import { paceFromSpeed, bpm } from '../format.js';

const TYPE = {
  easy: { label: 'Easy', cls: 'easy' },
  long: { label: 'Long', cls: 'long' },
  seuil: { label: 'Seuil', cls: 'seuil' },
  vo2max: { label: 'VO2max', cls: 'vo2' },
  tempo: { label: 'Tempo', cls: 'tempo' },
  escalade: { label: 'Escalade', cls: 'escalade' },
  repos: { label: 'Repos', cls: 'repos' },
};

const STATUSES = [
  { key: 'done', label: 'Faite' },
  { key: 'modified', label: 'Modifiée' },
  { key: 'skipped', label: 'Sautée' },
];

function frDay(ymd) {
  if (!ymd) return '';
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

export default function SessionRow({ session: s, tracking, onStatus }) {
  const t = TYPE[s.type] || TYPE.easy;
  const target = s.targetDistanceKm != null ? `${s.distanceEstimated ? '≈' : ''}${s.targetDistanceKm} km` : null;

  const notes = [];
  if (s.quality) notes.push(s.quality);
  if (s.strides) notes.push(typeof s.strides === 'number' ? `${s.strides} strides` : 'strides');
  if (s.tempoFinish) notes.push('finition tempo');
  if (s.evening) notes.push(`soir : ${s.evening}`);
  if (s.cross && s.type !== 'escalade') notes.push('+ escalade');
  if (s.double) notes.push('double');
  if (s.optional) notes.push('optionnel');

  return (
    <li className={`session-row status-${s.status || 'none'}`}>
      <div className="sr-day">
        <span className="sr-daylabel">{s.dayLabel}</span>
        <span className="sr-date">{frDay(s.date)}</span>
      </div>

      <div className="sr-main">
        <div className="sr-title-line">
          <span className={`chip ${t.cls}`}>{t.label}</span>
          <span className="sr-title">{s.title}</span>
        </div>
        <div className="sr-meta">
          {target && <span className="sr-target">{target}</span>}
          {s.targetPace && <span className="muted">{s.targetPace}</span>}
          {s.targetHr && <span className="muted">{s.targetHr}</span>}
          {notes.length > 0 && <span className="sr-notes">{notes.join(' · ')}</span>}
        </div>

        {tracking && s.isRun && (
          <div className="sr-actual">
            {s.matched ? (
              <>
                <span className="real">
                  réel : <strong>{s.matched.actualKm} km</strong>
                  {s.matched.paceMs ? ` · ${paceFromSpeed(s.matched.paceMs)}` : ''}
                  {s.matched.hasHeartrate ? ` · ${bpm(s.matched.avgHr)}` : ''}
                </span>
                {s.targetDistanceKm != null && (
                  <Delta actual={s.matched.actualKm} target={s.targetDistanceKm} />
                )}
                {s.matched.runCount > 1 && <span className="muted"> ({s.matched.runCount} runs)</span>}
              </>
            ) : (
              <span className="muted">pas de run Strava ce jour</span>
            )}
          </div>
        )}
      </div>

      {s.type !== 'repos' && (
        <div className="sr-actions">
          {STATUSES.map((st) => (
            <button
              key={st.key}
              className={`pill-btn ${s.status === st.key ? `on ${st.key}` : ''}`}
              onClick={() => onStatus(s.id, s.status === st.key ? null : st.key)}
            >
              {st.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function Delta({ actual, target }) {
  const d = Math.round((actual - target) * 10) / 10;
  if (Math.abs(d) < 0.1) return <span className="delta ok">= prévu</span>;
  return (
    <span className={`delta ${d > 0 ? 'over' : 'under'}`}>
      {d > 0 ? '+' : ''}
      {d} km vs prévu
    </span>
  );
}
