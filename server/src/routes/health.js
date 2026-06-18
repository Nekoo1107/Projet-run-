import { Router } from 'express';
import { getTokens, getSetting, getHealthMetrics, upsertHealthMetric, deleteHealthMetric } from '../db.js';
import { listRunsBetween } from '../services/strava.js';
import { computeAnalytics } from '../services/analytics.js';
import { computeCorrelations, computeAlerts } from '../services/correlations.js';
import { corosStatus, fetchCorosDaily } from '../services/coros.js';

const router = Router();
const DAY_MS = 86400000;

function currentWeekNumber(startDate) {
  if (!startDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS);
  const wk = Math.floor(days / 7) + 1;
  return wk >= 1 && wk <= 12 ? wk : null;
}

// --- COROS (pluggable, optional) ---
router.get('/coros', (req, res) => res.json(corosStatus()));
router.post('/coros/sync', async (req, res, next) => {
  try {
    await fetchCorosDaily();
    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 501).json({ error: err.message });
  }
});

// --- daily health metrics (manual or COROS) ---
router.get('/metrics', (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 60, 7), 400);
  const since = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
  res.json(getHealthMetrics(since));
});

router.post('/metrics', (req, res) => {
  const b = req.body || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : new Date().toISOString().slice(0, 10);
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
  upsertHealthMetric(date, {
    hrv: num(b.hrv),
    restingHr: num(b.restingHr),
    sleepHours: num(b.sleepHours),
    recovery: num(b.recovery),
    vo2max: num(b.vo2max),
    source: 'manual',
  });
  res.json({ ok: true, date });
});

router.delete('/metrics/:date', (req, res) => {
  deleteHealthMetric(req.params.date);
  res.json({ ok: true });
});

// --- correlations (health metrics vs run data) ---
router.get('/correlations', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 120, 14), 400);
    const since = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
    const metrics = getHealthMetrics(since);
    let runs = [];
    if (getTokens()) {
      const now = Math.floor(Date.now() / 1000);
      runs = await listRunsBetween(now - days * 86400, now + 86400);
    }
    res.json({ correlations: computeCorrelations(runs, metrics), metricCount: metrics.length, runCount: runs.length });
  } catch (err) {
    next(err);
  }
});

// --- alerts (volume spike, deload approaching, HR drift) ---
router.get('/alerts', async (req, res, next) => {
  try {
    let analytics = null;
    if (getTokens()) {
      const now = Math.floor(Date.now() / 1000);
      const runs = await listRunsBetween(now - 90 * 86400, now + 86400);
      analytics = computeAnalytics(runs);
    }
    const currentWeek = currentWeekNumber(getSetting('plan_start_date'));
    res.json({ alerts: computeAlerts({ analytics, currentWeek }) });
  } catch (err) {
    next(err);
  }
});

export default router;
