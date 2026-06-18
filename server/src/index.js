import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { config, stravaConfigured, chatProvider } from './config.js';
import { initDb } from './db.js';
import authRouter from './routes/auth.js';
import activitiesRouter from './routes/activities.js';
import planRouter from './routes/plan.js';
import analyticsRouter from './routes/analytics.js';
import chatRouter from './routes/chat.js';
import adaptationRouter from './routes/adaptation.js';
import healthRouter from './routes/health.js';
import { attachLive } from './live.js';

initDb();

const app = express();
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/plan', planRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/adaptation', adaptationRouter);
app.use('/api/health-metrics', healthRouter);

// Centralized error handler.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'internal_error' });
});

const server = http.createServer(app);
attachLive(server); // Gemini Live voice relay on ws://.../api/live

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[server] ⛔ Port ${config.port} deja utilise : un autre serveur tourne deja.`);
    console.error('[server]    Arrete-le puis relance :  mac/linux -> pkill -f node   |   windows -> taskkill /IM node.exe /F\n');
  } else {
    console.error('[server]', err);
  }
  process.exit(1);
});

server.listen(config.port, () => {
  console.log(`[server] API on http://localhost:${config.port}`);
  console.log(`[server] fichier .env : ${config.envPath} ${config.envFound ? '(trouve)' : '(INTROUVABLE)'}`);
  console.log(
    `[server] STRAVA_CLIENT_ID : ${config.stravaClientId ? 'OK' : 'MANQUANT'}` +
      ` | STRAVA_CLIENT_SECRET : ${config.stravaClientSecret ? 'OK' : 'MANQUANT'}`
  );
  console.log(`[server] Coach IA : ${chatProvider() || 'aucun (ajoute GEMINI_API_KEY ou ANTHROPIC_API_KEY)'}`);
  console.log(`[server] CORS origin : ${config.frontendUrl}`);
  if (!stravaConfigured()) {
    console.log('[server] ⚠️  Cles Strava manquantes — verifie le fichier .env indique ci-dessus.');
  }
});
