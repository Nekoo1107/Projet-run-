import SessionRow from './SessionRow.jsx';
import Adherence from './Adherence.jsx';

function frDate(ymd) {
  if (!ymd) return '';
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

export default function WeekView({ week, tracking, onStatus }) {
  return (
    <div className="week-view">
      <div className="week-header">
        <div>
          <h2>
            Semaine {week.week}
            {week.isDeload && <span className="badge deload">DELOAD — non négociable</span>}
          </h2>
          <p className="muted">
            Phase {week.phase} · {week.phaseName}
            {week.startDate && (
              <>
                {' '}
                · {frDate(week.startDate)} → {frDate(week.endDate)}
              </>
            )}
          </p>
        </div>
        <div className="week-volume">
          <Adherence actual={week.actualVolumeKm} target={week.targetVolumeKm} tracking={tracking} />
        </div>
      </div>

      <ul className="session-list">
        {week.sessions.map((s) => (
          <SessionRow key={s.id} session={s} tracking={tracking} onStatus={onStatus} />
        ))}
      </ul>
    </div>
  );
}
