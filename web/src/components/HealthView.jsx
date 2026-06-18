import { useEffect, useState } from 'react';
import {
  getCorosStatus,
  getHealthMetrics,
  saveHealthMetric,
  getCorrelations,
  getHealthAlerts,
} from '../api.js';

const FIELDS = [
  { key: 'hrv', label: 'HRV (ms)', step: '1' },
  { key: 'restingHr', label: 'FC repos', step: '1' },
  { key: 'sleepHours', label: 'Sommeil (h)', step: '0.1' },
  { key: 'recovery', label: 'Récup (%)', step: '1' },
  { key: 'vo2max', label: 'VO2max', step: '0.1' },
];
const ALERT_ICON = { volume: '📈', deload: '🛟', hr: '❤️‍🔥' };

export default function HealthView() {
  const [coros, setCoros] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [correlations, setCorrelations] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const [c, m, cor, al] = await Promise.all([
        getCorosStatus(),
        getHealthMetrics(60),
        getCorrelations(120).catch(() => null),
        getHealthAlerts().catch(() => ({ alerts: [] })),
      ]);
      setCoros(c);
      setMetrics(m);
      setCorrelations(cor?.correlations || []);
      setAlerts(al?.alerts || []);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveHealthMetric(form);
      setForm({ date: form.date });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="health">
      <h2>Santé & récupération</h2>

      {alerts.length > 0 && (
        <div className="card adapt-card">
          <h3>Alertes</h3>
          <ul className="alert-list">
            {alerts.map((a, i) => (
              <li key={i}>
                <span className="alert-ico">{ALERT_ICON[a.kind] || '•'}</span> {a.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* COROS pluggable module */}
      <div className="card adapt-card">
        <h3>Module COROS {coros?.configured ? '' : '(optionnel)'}</h3>
        <p className="muted small">{coros?.note || '…'}</p>
      </div>

      {/* Manual entry */}
      <div className="card adapt-card">
        <h3>Saisie du jour</h3>
        <p className="muted small">
          HRV, sommeil, récup, VO2max ne remontent pas de Strava — saisis-les ici pour activer les
          corrélations.
        </p>
        <form className="metric-form" onSubmit={save}>
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type="number"
                step={f.step}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </label>
          ))}
          <button className="btn strava" type="submit" disabled={busy}>
            {busy ? '…' : 'Enregistrer'}
          </button>
        </form>
      </div>

      {/* Correlations */}
      <h3 className="section-h">Corrélations</h3>
      {correlations === null ? (
        <p className="muted">…</p>
      ) : (
        <div className="corr-grid">
          {correlations.map((c) => (
            <div key={c.key} className="card corr-card">
              <div className="corr-label">{c.label}</div>
              {c.enough ? (
                <>
                  <div className="corr-r">
                    r = {c.r} <span className={`corr-tag ${c.direction === 'positive' ? 'pos' : 'neg'}`}>{c.strength} {c.direction}</span>
                  </div>
                  <p className="muted small">{c.note}</p>
                </>
              ) : (
                <p className="muted small">Pas assez de données (n={c.n}, besoin ≥ 4 points).</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recent metrics */}
      <h3 className="section-h">Mesures récentes</h3>
      {metrics.length === 0 ? (
        <p className="muted">Aucune mesure encore.</p>
      ) : (
        <table className="splits">
          <thead>
            <tr>
              <th>Date</th>
              <th>HRV</th>
              <th>FC repos</th>
              <th>Sommeil</th>
              <th>Récup</th>
              <th>VO2max</th>
            </tr>
          </thead>
          <tbody>
            {[...metrics].reverse().slice(0, 14).map((m) => (
              <tr key={m.date}>
                <td>{m.date}</td>
                <td>{m.hrv ?? '—'}</td>
                <td>{m.restingHr ?? '—'}</td>
                <td>{m.sleepHours ?? '—'}</td>
                <td>{m.recovery ?? '—'}</td>
                <td>{m.vo2max ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <p className="warn-text">Erreur : {error}</p>}
    </section>
  );
}
