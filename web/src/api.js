// All calls go straight to the backend (CORS enabled there).
const API = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
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
  // Some endpoints (204) may have no body.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const connectUrl = () => `${API}/api/auth/strava`;

// --- auth & activities (Phase 1) ---
export const getStatus = () => req('/api/auth/status');
export const getActivities = (limit = 10) => req(`/api/activities?limit=${limit}`);
export const getActivity = (id) => req(`/api/activities/${id}`);
export const disconnect = () => req('/api/auth/disconnect', { method: 'POST' });

// --- plan (Phase 2) ---
export const getPlanData = () => req('/api/plan');
export const getPlanSettings = () => req('/api/plan/settings');
export const setPlanStartDate = (startDate) =>
  req('/api/plan/settings', { method: 'PUT', body: { startDate } });
export const setSessionStatus = (id, body) =>
  req(`/api/plan/session/${id}/status`, { method: 'POST', body });
