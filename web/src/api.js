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

// --- analytics (Phase 3) ---
export const getAnalytics = (days = 120) => req(`/api/analytics?days=${days}`);

// --- chat coach (Phase 4), streamed text ---
export const getChatHealth = () => req('/api/chat/health');

export async function streamChat(messages, onDelta, signal) {
  const res = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = '';
    try {
      detail = (await res.json()).error || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onDelta(decoder.decode(value, { stream: true }));
  }
}
