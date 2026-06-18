/** Volume réel vs cible, with a progress bar. */
export default function Adherence({ actual, target, tracking }) {
  const pct = tracking && target ? Math.round((actual / target) * 100) : null;
  const width = pct == null ? 0 : Math.min(pct, 100);
  return (
    <div className="adh">
      <div className="adh-bar">
        <div className="adh-fill" style={{ width: `${width}%` }} />
      </div>
      <div className="adh-label">
        {tracking ? (
          <>
            <strong>{actual ?? 0}</strong> / {target} km{' '}
            {pct != null && <span className="muted">({pct}%)</span>}
          </>
        ) : (
          <span className="muted">cible {target} km</span>
        )}
      </div>
    </div>
  );
}
