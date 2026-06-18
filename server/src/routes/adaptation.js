import { Router } from 'express';
import { getPlan, getWeek, DAY_ORDER } from '../plan/buildPlan.js';
import { computeAdaptation } from '../services/adaptation.js';
import { listRunsBetween } from '../services/strava.js';
import {
  getTokens,
  getSetting,
  getAllStatuses,
  getOverrides,
  setOverride,
  clearOverride,
  getActiveHealthFlag,
  listHealthFlags,
  addHealthFlag,
  resolveHealthFlags,
} from '../db.js';

const router = Router();
const DAY_MS = 86400000;
const toUTC = (ymd) => new Date(`${ymd}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (ymd, n) => fmt(new Date(toUTC(ymd).getTime() + n * DAY_MS));
const localDateOf = (iso) => (iso ? iso.slice(0, 10) : null);
const round1 = (n) => Math.round(n * 10) / 10;

function currentWeekNumber(startDate) {
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.floor((toUTC(today).getTime() - toUTC(startDate).getTime()) / DAY_MS);
  return Math.min(Math.max(Math.floor(days / 7) + 1, 1), 12);
}

// GET /api/adaptation → proposals + alerts for the current week
router.get('/', async (req, res, next) => {
  try {
    const startDate = getSetting('plan_start_date');
    if (!startDate) return res.json({ needsStartDate: true, proposals: [], alerts: [] });

    const today = new Date().toISOString().slice(0, 10);
    const weekNum = currentWeekNumber(startDate);
    const week = getWeek(weekNum);
    const nextWeek = getWeek(weekNum + 1);
    const weekStart = addDays(startDate, (weekNum - 1) * 7);

    // Match actual runs for this week by date (best-effort).
    const actuals = {};
    if (getTokens()) {
      try {
        const after = Math.floor(toUTC(weekStart).getTime() / 1000) - DAY_MS / 1000;
        const before = Math.floor(toUTC(addDays(weekStart, 7)).getTime() / 1000) + DAY_MS / 1000;
        const runs = await listRunsBetween(after, before);
        const byDate = new Map();
        for (const r of runs) {
          const d = localDateOf(r.start_date_local);
          if (!byDate.has(d)) byDate.set(d, []);
          byDate.get(d).push(r);
        }
        for (const s of week.sessions.filter((x) => x.isRun)) {
          const date = addDays(weekStart, DAY_ORDER.indexOf(s.day));
          const onDate = byDate.get(date) || [];
          if (onDate.length) {
            const actualKm = round1(onDate.reduce((a, r) => a + r.distance_m / 1000, 0));
            const primary = onDate.reduce((a, b) => (b.distance_m > a.distance_m ? b : a));
            actuals[s.id] = { actualKm, avgHr: primary.has_heartrate ? Math.round(primary.average_heartrate) : null };
          }
        }
      } catch {
        /* Strava unavailable → adaptation still works on plan + statuses + pain */
      }
    }

    const painFlag = getActiveHealthFlag();
    const { proposals, alerts } = computeAdaptation({
      week,
      weekStart,
      nextWeek,
      today,
      actuals,
      statuses: getAllStatuses(),
      overrides: getOverrides(),
      painActive: Boolean(painFlag),
    });

    res.json({
      week: weekNum,
      weekStart,
      phase: week.phase,
      isDeload: week.isDeload,
      painFlag: painFlag
        ? { id: painFlag.id, area: painFlag.area, severity: painFlag.severity, note: painFlag.note, since: painFlag.created_at }
        : null,
      proposals,
      alerts,
      overrideCount: Object.keys(getOverrides()).length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/adaptation/apply  body: { changes: [{sessionId, adaptedKm, reason}] }
router.post('/apply', (req, res) => {
  const { changes } = req.body || {};
  if (!Array.isArray(changes) || !changes.length) return res.status(400).json({ error: 'changes requis' });
  for (const c of changes) {
    if (typeof c.sessionId === 'string' && typeof c.adaptedKm === 'number') {
      setOverride(c.sessionId, round1(c.adaptedKm), c.reason || null);
    }
  }
  res.json({ ok: true, applied: changes.length });
});

// POST /api/adaptation/clear  body: { sessionIds: [...] }  (omit to clear all in body)
router.post('/clear', (req, res) => {
  const { sessionIds } = req.body || {};
  const ids = Array.isArray(sessionIds) && sessionIds.length ? sessionIds : Object.keys(getOverrides());
  for (const id of ids) clearOverride(id);
  res.json({ ok: true, cleared: ids.length });
});

// --- pain / injury flags ---
router.get('/health', (req, res) => {
  res.json({ active: getActiveHealthFlag(), history: listHealthFlags() });
});

router.post('/health', (req, res) => {
  const { area = null, severity = null, note = null } = req.body || {};
  const id = addHealthFlag({ area, severity, note });
  res.json({ ok: true, id });
});

router.post('/health/resolve', (req, res) => {
  resolveHealthFlags();
  res.json({ ok: true });
});

export default router;
