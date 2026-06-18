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

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS session_status (
      session_id   TEXT PRIMARY KEY,   -- e.g. "w1-mon"
      status       TEXT NOT NULL,      -- done | modified | skipped
      strava_id    INTEGER,            -- manually linked run (optional)
      note         TEXT,
      updated_at   INTEGER NOT NULL
    );

    -- Phase 5: adapted target distances accepted from the adaptation engine
    CREATE TABLE IF NOT EXISTS session_overrides (
      session_id   TEXT PRIMARY KEY,
      adapted_km   REAL NOT NULL,
      reason       TEXT,
      updated_at   INTEGER NOT NULL
    );

    -- Phase 5: pain / injury flags that pause the running build
    CREATE TABLE IF NOT EXISTS health_flags (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      area         TEXT,
      severity     TEXT,
      note         TEXT,
      status       TEXT NOT NULL DEFAULT 'active',  -- active | resolved
      created_at   INTEGER NOT NULL,
      resolved_at  INTEGER
    );
  `);
  console.log(`[db] SQLite ready at ${dbPath}`);
}

// --- settings (key/value) ---
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

// --- per-session check-off status ---
export function getAllStatuses() {
  const rows = db.prepare('SELECT * FROM session_status').all();
  const map = {};
  for (const r of rows) {
    map[r.session_id] = {
      status: r.status,
      stravaId: r.strava_id ?? null,
      note: r.note ?? null,
      updatedAt: r.updated_at,
    };
  }
  return map;
}

export function setSessionStatus(sessionId, { status, stravaId = null, note = null }) {
  if (!status) {
    db.prepare('DELETE FROM session_status WHERE session_id = ?').run(sessionId);
    return;
  }
  db.prepare(
    `INSERT INTO session_status (session_id, status, strava_id, note, updated_at)
     VALUES (@session_id, @status, @strava_id, @note, @updated_at)
     ON CONFLICT(session_id) DO UPDATE SET
       status = excluded.status,
       strava_id = excluded.strava_id,
       note = excluded.note,
       updated_at = excluded.updated_at`
  ).run({
    session_id: sessionId,
    status,
    strava_id: stravaId,
    note,
    updated_at: Math.floor(Date.now() / 1000),
  });
}

// --- adaptation: session distance overrides ---
export function getOverrides() {
  const rows = db.prepare('SELECT * FROM session_overrides').all();
  const map = {};
  for (const r of rows) map[r.session_id] = { adaptedKm: r.adapted_km, reason: r.reason };
  return map;
}

export function setOverride(sessionId, adaptedKm, reason = null) {
  db.prepare(
    `INSERT INTO session_overrides (session_id, adapted_km, reason, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       adapted_km = excluded.adapted_km, reason = excluded.reason, updated_at = excluded.updated_at`
  ).run(sessionId, adaptedKm, reason, Math.floor(Date.now() / 1000));
}

export function clearOverride(sessionId) {
  db.prepare('DELETE FROM session_overrides WHERE session_id = ?').run(sessionId);
}

// --- adaptation: health / pain flags ---
export function getActiveHealthFlag() {
  return db.prepare(`SELECT * FROM health_flags WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`).get() || null;
}

export function listHealthFlags(limit = 20) {
  return db.prepare('SELECT * FROM health_flags ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function addHealthFlag({ area = null, severity = null, note = null }) {
  const info = db
    .prepare(`INSERT INTO health_flags (area, severity, note, status, created_at) VALUES (?, ?, ?, 'active', ?)`)
    .run(area, severity, note, Math.floor(Date.now() / 1000));
  return info.lastInsertRowid;
}

export function resolveHealthFlags() {
  db.prepare(`UPDATE health_flags SET status = 'resolved', resolved_at = ? WHERE status = 'active'`).run(
    Math.floor(Date.now() / 1000)
  );
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
