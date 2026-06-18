import { Router } from 'express';
import crypto from 'node:crypto';
import { config, stravaConfigured } from '../config.js';
import { getAuthorizeUrl, exchangeCodeForTokens } from '../services/strava.js';
import { getTokens, clearTokens } from '../db.js';

const router = Router();

// CSRF protection for the OAuth round-trip. In-memory is fine for a local
// single-user app (states are short-lived and one-time-use).
const pendingStates = new Set();

// Start the OAuth flow → redirect the browser to Strava's consent screen.
router.get('/strava', (req, res) => {
  if (!stravaConfigured()) {
    return res
      .status(500)
      .send('Strava non configure. Renseigne STRAVA_CLIENT_ID et STRAVA_CLIENT_SECRET dans server/.env');
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.add(state);
  res.redirect(getAuthorizeUrl(state));
});

// Strava redirects here with ?code & ?state (or ?error).
router.get('/strava/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${config.frontendUrl}/?strava=denied`);
    if (!code || !state || !pendingStates.has(state)) {
      return res.redirect(`${config.frontendUrl}/?strava=error`);
    }
    pendingStates.delete(state);
    await exchangeCodeForTokens(code);
    res.redirect(`${config.frontendUrl}/?strava=connected`);
  } catch (err) {
    next(err);
  }
});

// Is the app connected to Strava? (does NOT expose tokens)
router.get('/status', (req, res) => {
  const tokens = getTokens();
  if (!tokens) return res.json({ connected: false, configured: stravaConfigured() });
  const a = tokens.athlete;
  res.json({
    connected: true,
    configured: stravaConfigured(),
    athlete: a
      ? { id: a.id, firstname: a.firstname, lastname: a.lastname, profile: a.profile }
      : null,
  });
});

router.post('/disconnect', (req, res) => {
  clearTokens();
  res.json({ connected: false });
});

export default router;
