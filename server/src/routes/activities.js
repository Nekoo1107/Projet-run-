import { Router } from 'express';
import { listRecentRuns, getActivityDetail } from '../services/strava.js';
import { getTokens } from '../db.js';

const router = Router();

function ensureConnected(req, res, next) {
  if (!getTokens()) return res.status(401).json({ error: 'not_connected' });
  next();
}

// GET /api/activities?limit=10  → recent runs (summary)
router.get('/', ensureConnected, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
    res.json(await listRecentRuns(limit));
  } catch (err) {
    next(err);
  }
});

// GET /api/activities/:id  → one run with per-km splits
router.get('/:id', ensureConnected, async (req, res, next) => {
  try {
    res.json(await getActivityDetail(req.params.id));
  } catch (err) {
    next(err);
  }
});

export default router;
