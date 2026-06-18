import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { config } from './config.js';

// We use Node's built-in SQLite (node:sqlite) — no native compilation, no extra
// dependency, works the same on Windows/macOS/Linux. Requires Node >= 22.5
// (built-in and flag-free on Node 24). Real SQLite, migratable later.
const __dirname = dirname(fileURLToPath(import.meta.url));
// DB path is resolved relative to the server/ folder (one level up from src/).
const dbPath = resolve(__dirname, '..', config.dbPath);
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strava_tokens (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      athlete_json  TEXT,
      updated_at    INTEGER NOT NULL
    );
  `);
  console.log(`[db] SQLite ready at ${dbPath}`);
}

/**
 * Persist Strava tokens (single-user: always row id = 1).
 * @param {{access_token:string, refresh_token:string, expires_at:number, athlete?:object}} t
 */
export function saveTokens(t) {
  const athleteJson = t.athlete ? JSON.stringify(t.athlete) : null;
  db.prepare(
    `INSERT INTO strava_tokens (id, access_token, refresh_token, expires_at, athlete_json, updated_at)
     VALUES (1, @access_token, @refresh_token, @expires_at, @athlete_json, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       access_token  = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at    = excluded.expires_at,
       athlete_json  = COALESCE(excluded.athlete_json, strava_tokens.athlete_json),
       updated_at    = excluded.updated_at`
  ).run({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_at,
    athlete_json: athleteJson,
    updated_at: Math.floor(Date.now() / 1000),
  });
}

/** @returns {null | {access_token, refresh_token, expires_at, athlete}} */
export function getTokens() {
  const row = db.prepare('SELECT * FROM strava_tokens WHERE id = 1').get();
  if (!row) return null;
  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at,
    athlete: row.athlete_json ? JSON.parse(row.athlete_json) : null,
  };
}

export function clearTokens() {
  db.prepare('DELETE FROM strava_tokens WHERE id = 1').run();
}

export default db;
