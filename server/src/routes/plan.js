import { Router } from 'express';
import { getPlan, DAY_ORDER } from '../plan/buildPlan.js';
import { listRunsBetween } from '../services/strava.js';
import { getTokens, getAllStatuses, setSessionStatus, getSetting, setSetting, getOverrides } from '../db.js';

const router = Router();
const VALID_STATUS = new Set(['done', 'modified', 'skipped']);
const DAY_MS = 86400000;

// --- date helpers (plan dates are plain calendar dates: 'YYYY-MM-DD') ---
const toUTC = (ymd) => new Date(`${ymd}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (ymd, n) => fmt(new Date(toUTC(ymd).getTime() + n * DAY_MS));
const localDateOf = (iso) => (iso ? iso.slice(0, 10) : null);

/** Monday (ISO) of the week containing the given date. */
function mondayOf(ymd) {
  const d = toUTC(ymd);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  return fmt(new Date(d.getTime() - dow * DAY_MS));
}

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (actual, target) => (target ? Math.round((actual / target) * 100) : null);

// --- small TTL cache so repeated loads don't hammer Strava ---
let rangeCache = null; // { key, at, runs }
async function runsForRange(afterEpoch, beforeEpoch) {
  const key = `${afterEpoch}-${beforeEpoch}`;
  if (rangeCache && rangeCache.key === key && Date.now() - rangeCache.at < 30000) {
    return rangeCache.runs;
  }
  const runs = await listRunsBetween(afterEpoch, beforeEpoch);
  rangeCache = { key, at: Date.now(), runs };
  return runs;
}

function summarizeRun(run) {
  return {
    id: run.id,
    name: run.name,
    date: localDateOf(run.start_date_local),
    distanceKm: round1(run.distance_m / 1000),
    paceMs: run.average_speed_ms,
    avgHr: run.average_heartrate,
    maxHr: run.max_heartrate,
    hasHeartrate: run.has_heartrate,
  };
}

/**
 * GET /api/plan
 * Structured plan + check-off status, plus (if connected and start date set)
 * date-matched actual runs and adherence per week/phase.
 */
router.get('/', async (req, res, next) => {
  try {
    const plan = getPlan();
    const statuses = getAllStatuses();
    const overrides = getOverrides();
    const startDate = getSetting('plan_start_date');
    const connected = Boolean(getTokens());

    // Index runs by local date for matching (only if we can track).
    // A Strava failure must NOT break the plan view — degrade gracefully.
    let runsByDate = null;
    let tracking = false;
    let trackingError = null;
    if (connected && startDate) {
      try {
        const planEnd = addDays(startDate, plan.totalWeeks * 7);
        const afterEpoch = Math.floor(toUTC(startDate).getTime() / 1000) - DAY_MS / 1000;
        const beforeEpoch = Math.floor(toUTC(planEnd).getTime() / 1000) + DAY_MS / 1000;
        const runs = await runsForRange(afterEpoch, beforeEpoch);
        runsByDate = new Map();
        for (const r of runs) {
          const d = localDateOf(r.start_date_local);
          if (!runsByDate.has(d)) runsByDate.set(d, []);
          runsByDate.get(d).push(r);
        }
        tracking = true;
      } catch (e) {
        trackingError = e.message;
      }
    }

    const phases = plan.phases.map((phase) => {
      let phaseActual = 0;
      const weeks = phase.weeks.map((wk) => {
        const weekStart = startDate ? addDays(startDate, (wk.week - 1) * 7) : null;
        const weekEnd = weekStart ? addDays(weekStart, 6) : null;

        const sessions = wk.sessions.map((s) => {
          const di = DAY_ORDER.indexOf(s.day);
          const date = weekStart ? addDays(weekStart, di) : null;
          const st = statuses[s.id] || null;
          const ov = overrides[s.id];
          // Adapted target (Phase 5): an accepted override replaces the planned km.
          const adapted = ov != null;
          const targetDistanceKm = adapted ? ov.adaptedKm : s.targetDistanceKm;
          const isRun = adapted ? targetDistanceKm > 0 : s.isRun;

          let matched = null;
          if (tracking && isRun && date) {
            const onDate = runsByDate.get(date) || [];
            const candidates =
              st?.stravaId != null
                ? onDate.filter((r) => r.id === st.stravaId)
                : onDate;
            if (candidates.length) {
              // primary = longest run that day; actual = sum of the day's runs
              const primary = candidates.reduce((a, b) =>
                b.distance_m > a.distance_m ? b : a
              );
              const actualKm = round1(
                candidates.reduce((sum, r) => sum + r.distance_m / 1000, 0)
              );
              matched = { ...summarizeRun(primary), actualKm, runCount: candidates.length };
            }
          }

          return {
            ...s,
            date,
            isRun,
            targetDistanceKm,
            adapted,
            originalKm: adapted ? s.targetDistanceKm : null,
            adaptReason: adapted ? ov.reason : null,
            status: st?.status || null,
            note: st?.note || null,
            matched,
          };
        });

        // Weekly actual volume = every run in the week's date window.
        let actualVolumeKm = null;
        if (tracking && weekStart) {
          let sum = 0;
          for (let i = 0; i < 7; i++) {
            const d = addDays(weekStart, i);
            for (const r of runsByDate.get(d) || []) sum += r.distance_m / 1000;
          }
          actualVolumeKm = round1(sum);
          phaseActual += sum;
        }

        return {
          ...wk,
          startDate: weekStart,
          endDate: weekEnd,
          sessions,
          actualVolumeKm,
          adherencePct: actualVolumeKm == null ? null : pct(actualVolumeKm, wk.targetVolumeKm),
        };
      });

      return {
        number: phase.number,
        name: phase.name,
        weekNumbers: phase.weekNumbers,
        targetVolumeKm: phase.targetVolumeKm,
        actualVolumeKm: tracking ? round1(phaseActual) : null,
        adherencePct: tracking ? pct(phaseActual, phase.targetVolumeKm) : null,
        weeks,
      };
    });

    res.json({
      startDate: startDate || null,
      connected,
      tracking,
      trackingError,
      zones: plan.zones,
      deloadWeeks: plan.deloadWeeks,
      totalWeeks: plan.totalWeeks,
      phases,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/plan/session/:id/status  body: { status, note?, stravaId? }
router.post('/session/:id/status', (req, res, next) => {
  try {
    const { status, note = null, stravaId = null } = req.body || {};
    if (status !== null && !VALID_STATUS.has(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    setSessionStatus(req.params.id, { status, note, stravaId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/settings  → { startDate }
router.get('/settings', (req, res) => {
  res.json({ startDate: getSetting('plan_start_date') || null });
});

// PUT /api/settings  body: { startDate }  (snapped to the Monday of that week)
router.put('/settings', (req, res) => {
  const { startDate } = req.body || {};
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return res.status(400).json({ error: 'invalid_date' });
  }
  const monday = mondayOf(startDate);
  setSetting('plan_start_date', monday);
  rangeCache = null; // invalidate matching cache
  res.json({ startDate: monday });
});

export default router;
