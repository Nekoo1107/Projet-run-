// All calls go straight to the backend (CORS enabled there).
const API = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

async function json(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).error || '';
    } catch {
      /* ignore */
    }
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const connectUrl = () => `${API}/api/auth/strava`;

export const getStatus = () => json('/api/auth/status');
export const getActivities = (limit = 10) => json(`/api/activities?limit=${limit}`);
export const getActivity = (id) => json(`/api/activities/${id}`);

export async function disconnect() {
  await fetch(`${API}/api/auth/disconnect`, { method: 'POST' });
}
