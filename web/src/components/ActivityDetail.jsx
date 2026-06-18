import { useEffect, useState } from 'react';
import { getActivity } from '../api.js';
import {
  km,
  duration,
  paceFromSpeed,
  bpm,
  elevation,
  cadenceSpm,
  dateLabel,
} from '../format.js';

export default function ActivityDetail({ id, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    getActivity(id)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Fermer">
          ×
        </button>

        {!data && !error && <p className="muted">Chargement du detail…</p>}
        {error && <p className="warn-text">Erreur: {error}</p>}

        {data && (
          <>
            <h2 className="modal-title">{data.name}</h2>
            <p className="muted">{dateLabel(data.start_date_local)}</p>

            <div className="detail-grid">
              <Stat label="Distance" value={km(data.distance_m)} />
              <Stat label="Duree" value={duration(data.moving_time_s)} />
              <Stat label="Allure moy" value={paceFromSpeed(data.average_speed_ms)} />
              <Stat label="FC moy" value={data.has_heartrate ? bpm(data.average_heartrate) : '—'} />
              <Stat label="FC max" value={data.has_heartrate ? bpm(data.max_heartrate) : '—'} />
              <Stat label="D+" value={elevation(data.total_elevation_gain_m)} />
              <Stat label="Cadence" value={cadenceSpm(data.average_cadence)} />
              <Stat label="Calories" value={data.calories ?? '—'} />
            </div>

            <h3>Splits par km</h3>
            {data.splits_metric && data.splits_metric.length > 0 ? (
              <table className="splits">
                <thead>
                  <tr>
                    <th>Km</th>
                    <th>Allure</th>
                    <th>FC moy</th>
                    <th>D+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {data.splits_metric.map((s) => (
                    <tr key={s.split}>
                      <td>{s.split}</td>
                      <td>{paceFromSpeed(s.average_speed_ms)}</td>
                      <td>{s.average_heartrate != null ? bpm(s.average_heartrate) : '—'}</td>
                      <td>
                        {s.elevation_difference_m != null
                          ? `${s.elevation_difference_m > 0 ? '+' : ''}${Math.round(
                              s.elevation_difference_m
                            )} m`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Pas de splits disponibles pour ce run.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
