import { config } from '../config.js';
import { getTokens, saveTokens } from '../db.js';

const OAUTH_TOKEN_URL = 'https://www.strava.com/oauth/token';
const AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
const API_BASE = 'https://www.strava.com/api/v3';

// Scopes: read profile + read all activities (incl. private). Personal app.
const SCOPE = 'read,activity:read_all';

/** Build the Strava consent-screen URL. */
export function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.stravaClientId,
    response_type: 'code',
    redirect_uri: config.stravaRedirectUri,
    approval_prompt: 'auto',
    scope: SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchange the OAuth `code` for tokens and persist them. */
export async function exchangeCodeForTokens(code) {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.stravaClientId,
      client_secret: config.stravaClientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: data.athlete,
  });
  return data;
}

/**
 * Return a valid access token, refreshing it via the refresh_token if it is
 * expired (or about to expire within 60s). Tokens never leave the server.
 */
async function getValidAccessToken() {
  const tokens = getTokens();
  if (!tokens) throw Object.assign(new Error('not_connected'), { statusCode: 401 });

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at - 60 > now) return tokens.access_token;

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.stravaClientId,
      client_secret: config.stravaClientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: tokens.athlete, // refresh response has no athlete; keep existing
  });
  return data.access_token;
}

async function stravaGet(path, params = {}) {
  const token = await getValidAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    throw Object.assign(new Error('Strava rate limit reached, retry later.'), { statusCode: 429 });
  }
  if (!res.ok) {
    throw new Error(`Strava GET ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

/** Most recent runs (newest first), mapped to a lean summary shape. */
export async function listRecentRuns(limit = 10) {
  // Pull a window of activities, then keep only runs.
  const activities = await stravaGet('/athlete/activities', { per_page: 50, page: 1 });
  return activities
    .filter((a) => RUN_TYPES.has(a.sport_type) || RUN_TYPES.has(a.type))
    .slice(0, limit)
    .map(mapRunSummary);
}

/**
 * Runs whose start falls within [afterEpoch, beforeEpoch) (seconds).
 * Used to match planned sessions against actual activities by date.
 */
export async function listRunsBetween(afterEpoch, beforeEpoch) {
  const activities = await stravaGet('/athlete/activities', {
    after: afterEpoch,
    before: beforeEpoch,
    per_page: 200,
    page: 1,
  });
  return activities
    .filter((a) => RUN_TYPES.has(a.sport_type) || RUN_TYPES.has(a.type))
    .map(mapRunSummary);
}

/** Full detail for one activity, including per-km splits. */
export async function getActivityDetail(id) {
  const a = await stravaGet(`/activities/${id}`, { include_all_efforts: false });
  return mapRunDetail(a);
}

// --- mappers: normalize Strava's payload to what the frontend needs ---

function mapRunSummary(a) {
  return {
    id: a.id,
    name: a.name,
    sport_type: a.sport_type || a.type,
    start_date_local: a.start_date_local,
    distance_m: a.distance,
    moving_time_s: a.moving_time,
    elapsed_time_s: a.elapsed_time,
    average_speed_ms: a.average_speed, // m/s
    max_speed_ms: a.max_speed,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    total_elevation_gain_m: a.total_elevation_gain ?? null,
    average_cadence: a.average_cadence ?? null, // one-leg rpm (x2 = spm)
    average_temp: a.average_temp ?? null, // °C (when the device records it)
    has_heartrate: a.has_heartrate ?? false,
  };
}

function mapRunDetail(a) {
  return {
    ...mapRunSummary(a),
    description: a.description ?? null,
    calories: a.calories ?? null,
    splits_metric: (a.splits_metric || []).map((s) => ({
      split: s.split,
      distance_m: s.distance,
      moving_time_s: s.moving_time,
      elapsed_time_s: s.elapsed_time,
      average_speed_ms: s.average_speed,
      average_heartrate: s.average_heartrate ?? null,
      elevation_difference_m: s.elevation_difference ?? null,
      pace_zone: s.pace_zone ?? null,
    })),
  };
}
