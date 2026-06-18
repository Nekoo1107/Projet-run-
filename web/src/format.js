// Display helpers — keep raw numbers in the API, format only in the UI.

export function km(meters) {
  if (meters == null) return '—';
  return `${(meters / 1000).toFixed(2)} km`;
}

/** seconds → "1h12" or "48:30" */
export function duration(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** m/s → "5:07 /km" */
export function paceFromSpeed(speedMs) {
  if (!speedMs || speedMs <= 0) return '—';
  const secPerKm = Math.round(1000 / speedMs);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export function bpm(v) {
  return v == null ? '—' : `${Math.round(v)} bpm`;
}

export function elevation(m) {
  return m == null ? '—' : `${Math.round(m)} m`;
}

/** Strava reports one-leg cadence; ×2 ≈ steps/min. */
export function cadenceSpm(rpm) {
  return rpm == null ? '—' : `${Math.round(rpm * 2)} spm`;
}

export function dateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
