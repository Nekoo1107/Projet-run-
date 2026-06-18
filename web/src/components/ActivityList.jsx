import { km, duration, paceFromSpeed, bpm, dateLabel } from '../format.js';

export default function ActivityList({ activities, onSelect }) {
  return (
    <ul className="run-list">
      {activities.map((a) => (
        <li key={a.id}>
          <button className="run-card" onClick={() => onSelect(a.id)}>
            <div className="run-main">
              <span className="run-name">{a.name}</span>
              <span className="run-date">{dateLabel(a.start_date_local)}</span>
            </div>
            <div className="run-stats">
              <Stat label="Distance" value={km(a.distance_m)} />
              <Stat label="Duree" value={duration(a.moving_time_s)} />
              <Stat label="Allure" value={paceFromSpeed(a.average_speed_ms)} />
              <Stat label="FC moy" value={a.has_heartrate ? bpm(a.average_heartrate) : '—'} />
            </div>
          </button>
        </li>
      ))}
    </ul>
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
