import 'dotenv/config';

const PORT = process.env.PORT || 3001;

export const config = {
  port: PORT,
  stravaClientId: process.env.STRAVA_CLIENT_ID || '',
  stravaClientSecret: process.env.STRAVA_CLIENT_SECRET || '',
  stravaRedirectUri:
    process.env.STRAVA_REDIRECT_URI ||
    `http://localhost:${PORT}/api/auth/strava/callback`,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  dbPath: process.env.DB_PATH || './data/app.db',
};

/** True once Strava credentials are present. */
export function stravaConfigured() {
  return Boolean(config.stravaClientId && config.stravaClientSecret);
}
