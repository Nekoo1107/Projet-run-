import { useEffect, useState } from 'react';
import { fetchWeather } from '../weather.js';
import { postCoachContext } from '../api.js';

// Shows local weather and feeds it (+ local time) to the coach context.
export default function WeatherChip() {
  const [w, setW] = useState(null);

  useEffect(() => {
    let on = true;
    fetchWeather()
      .then((x) => {
        if (!on) return;
        setW(x);
        postCoachContext({
          weather: `${x.tempC}°C, ${x.label}, vent ${x.wind} km/h`,
          localTime: new Date().toLocaleString('fr-FR'),
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }).catch(() => {});
      })
      .catch(() => {}); // geoloc refused / offline → no chip, no big deal
    return () => {
      on = false;
    };
  }, []);

  if (!w) return null;
  return (
    <div className="weather-chip" title={`${w.label} · vent ${w.wind} km/h`}>
      <span className="wx-emoji">{w.emoji}</span>
      <span>{w.tempC}°C</span>
    </div>
  );
}
