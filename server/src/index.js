import express from 'express';
import cors from 'cors';
import { config, stravaConfigured } from './config.js';
import { initDb } from './db.js';
import authRouter from './routes/auth.js';
import activitiesRouter from './routes/activities.js';

initDb();

const app = express();
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/activities', activitiesRouter);

// Centralized error handler.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'internal_error' });
});

app.listen(config.port, () => {
  console.log(`[server] API on http://localhost:${config.port}`);
  console.log(`[server] fichier .env : ${config.envPath} ${config.envFound ? '(trouve)' : '(INTROUVABLE)'}`);
  console.log(
    `[server] STRAVA_CLIENT_ID : ${config.stravaClientId ? 'OK' : 'MANQUANT'}` +
      ` | STRAVA_CLIENT_SECRET : ${config.stravaClientSecret ? 'OK' : 'MANQUANT'}`
  );
  console.log(`[server] CORS origin : ${config.frontendUrl}`);
  if (!stravaConfigured()) {
    console.log('[server] ⚠️  Cles Strava manquantes — verifie le fichier .env indique ci-dessus.');
  }
});
