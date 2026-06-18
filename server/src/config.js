import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load server/.env by ABSOLUTE path, so it works no matter which directory the
// process was launched from (a common cause of "keys missing" on Windows).
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
const loaded = dotenv.config({ path: envPath });

const PORT = process.env.PORT || 3001;

export const config = {
  port: PORT,
  envPath,
  envFound: !loaded.error,
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
