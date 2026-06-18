import { useEffect, useState } from 'react';
import {
  getAdaptation,
  applyAdaptation,
  clearAdaptations,
  reportPain,
  resolvePain,
} from '../api.js';

const ALERT_ICON = { pain: '⛔', skip: '↩️', hr: '❤️‍🔥', hard: '⚠️', deload: '🛟' };

export default function AdaptationView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState({});
  const [painForm, setPainForm] = useState({ area: '', severity: 'modérée', note: '' });

  async function load() {
    setError(null);
    try {
      setData(await getAdaptation());
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="card empty"><p className="warn-text">Erreur : {error}</p></div>;
  if (!data) return <p className="muted">Analyse de la semaine…</p>;
  if (data.needsStartDate) {
    return (
      <div className="card empty">
        <h2>Définis d'abord la date de départ</h2>
        <p className="muted">Va dans l'onglet « Plan 12 semaines » et choisis le lundi de la semaine 1.</p>
      </div>
    );
  }

  const visibleProposals = data.proposals.filter((p) => !dismissed[p.id]);

  return (
    <section className={busy ? 'adapt busy' : 'adapt'}>
      <h2>Adaptation — Semaine {data.week}{data.isDeload ? ' (deload)' : ''}</h2>

      {/* Douleur / blessure */}
      <div className="card adapt-card">
        <h3>Douleur / blessure</h3>
        {data.painFlag ? (
          <>
            <p className="warn-text">
              ⛔ Douleur active : <strong>{data.painFlag.area || 'non précisée'}</strong>
              {data.painFlag.severity ? ` (${data.painFlag.severity})` : ''}. La course est en pause.
            </p>
            <button className="btn strava" disabled={busy} onClick={() => run(resolvePain)}>
              Marquer comme résolue (reprendre)
            </button>
          </>
        ) : (
          <form
            className="pain-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => reportPain(painForm));
            }}
          >
            <p className="muted small">
              Une douleur localisée ? Signale-la : la course se met en pause et ne reprend qu'après
              résolution confirmée.
            </p>
            <div className="row">
              <input
                placeholder="Zone (ex. tendon d'Achille)"
                value={painForm.area}
                onChange={(e) => setPainForm({ ...painForm, area: e.target.value })}
              />
              <select
                value={painForm.severity}
                onChange={(e) => setPainForm({ ...painForm, severity: e.target.value })}
              >
                <option>légère</option>
                <option>modérée</option>
                <option>forte</option>
              </select>
              <button className="btn ghost" type="submit" disabled={busy}>
                Signaler
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Alertes */}
      {data.alerts.length > 0 && (
        <div className="card adapt-card">
          <h3>Alertes</h3>
          <ul className="alert-list">
            {data.alerts.map((a, i) => (
              <li key={i}>
                <span className="alert-ico">{ALERT_ICON[a.kind] || '•'}</span> {a.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Propositions validables */}
      <h3 className="section-h">Ajustements proposés</h3>
      {visibleProposals.length === 0 ? (
        <p className="muted">Rien à ajuster pour l'instant — tu es dans les clous. 👍</p>
      ) : (
        visibleProposals.map((p) => (
          <div key={p.id} className={`card proposal ${p.kind}`}>
            <div className="proposal-head">
              <strong>{p.title}</strong>
            </div>
            <p className="muted small">{p.detail}</p>
            <ul className="changes">
              {p.changes.map((c) => (
                <li key={c.sessionId}>
                  <code>{c.sessionId}</code> → <strong>{c.adaptedKm} km</strong>
                </li>
              ))}
            </ul>
            <div className="row">
              <button className="btn strava" disabled={busy} onClick={() => run(() => applyAdaptation(p.changes))}>
                Valider
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => setDismissed({ ...dismissed, [p.id]: true })}>
                Refuser
              </button>
            </div>
          </div>
        ))
      )}

      {data.overrideCount > 0 && (
        <p className="muted small" style={{ marginTop: 12 }}>
          {data.overrideCount} séance(s) adaptée(s) active(s).{' '}
          <button className="linklike" disabled={busy} onClick={() => run(() => clearAdaptations())}>
            Tout réinitialiser au plan d'origine
          </button>
        </p>
      )}

      <p className="muted small hint">💡 Pour une analyse en langage naturel, demande à ton coach (onglet Coach IA).</p>
    </section>
  );
}
