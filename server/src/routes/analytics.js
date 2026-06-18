import { Router } from 'express';
import { listRunsBetween } from '../services/strava.js';
import { computeAnalytics } from '../services/analytics.js';
import { getTokens } from '../db.js';

const router = Router();

// GET /api/analytics?days=120&refHr=145
router.get('/', async (req, res, next) => {
  try {
    if (!getTokens()) return res.status(401).json({ error: 'not_connected' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 120, 14), 400);
    const refHr = Math.min(Math.max(parseInt(req.query.refHr, 10) || 145, 110), 180);

    const now = Math.floor(Date.now() / 1000);
    const after = now - days * 86400;
    const runs = await listRunsBetween(after, now + 86400);

    res.json(computeAnalytics(runs, { refHr }));
  } catch (err) {
    next(err);
  }
});

export default router;
