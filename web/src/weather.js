// WMO weather code → emoji + French label.
export function wmo(code) {
  if (code === 0) return { emoji: '☀️', label: 'ciel clair' };
  if (code === 1 || code === 2) return { emoji: '🌤️', label: 'peu nuageux' };
  if (code === 3) return { emoji: '☁️', label: 'couvert' };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'brouillard' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'bruine' };
  if (code >= 61 && code <= 67) return { emoji: '🌧️', label: 'pluie' };
  if (code >= 71 && code <= 77) return { emoji: '🌨️', label: 'neige' };
  if (code >= 80 && code <= 82) return { emoji: '🌧️', label: 'averses' };
  if (code >= 95) return { emoji: '⛈️', label: 'orage' };
  return { emoji: '🌡️', label: '—' };
}

// Geolocation → Open-Meteo (free, no key, CORS-friendly).
export async function fetchWeather() {
  const pos = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 600000 })
  );
  const { latitude: lat, longitude: lon } = pos.coords;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('météo indisponible');
  const c = (await res.json()).current;
  return { tempC: Math.round(c.temperature_2m), wind: Math.round(c.wind_speed_10m), ...wmo(c.weather_code) };
}
