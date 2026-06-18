import { useEffect, useState } from 'react';
import { getAnalytics } from '../api.js';
import { LineChart, BarChart } from './charts.jsx';

const fmtPace = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const shortDate = (ymd) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

const VERDICT = {
  progression: { label: '📈 Progression', cls: 'ok' },
  stagnation: { label: '➡️ Stagnation', cls: 'warn' },
  regression: { label: '📉 Régression', cls: 'bad' },
  insufficient: { label: 'Données insuffisantes', cls: 'muted' },
};

export default function StatsView({ status }) {
  const [days, setDays] = useState(120);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!status.connected) return;
    setData(null);
    setError(null);
    getAnalytics(days)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status.connected, days]);

  if (!status.connected) {
    return (
      <div className="card empty">
        <h2>Connecte Strava pour tes stats</h2>
        <p className="muted">Les analyses (allure-à-FC, volume, tendances) se basent sur tes runs Strava.</p>
      </div>
    );
  }

  const v = data && VERDICT[data.paceAtHrTrend.verdict];

  return (
    <section className="stats">
      <div className="stats-head">
        <h2>Analyses</h2>
        <div className="seg">
          {[60, 120, 180].map((d) => (
            <button key={d} className={d === days ? 'on' : ''} onClick={() => setDays(d)}>
              {d}j
            </button>
          ))}
        </div>
      </div>

      {error && <div className="card empty"><p className="warn-text">Erreur: {error}</p></div>}
      {!data && !error && <p className="muted">Calcul des tendances…</p>}

      {data && (
        <>
          {/* Pace at comparable HR — the "metric reine" */}
          <div className="card stat-card">
            <div className="stat-card-head">
              <div>
                <h3>Allure à FC comparable (~{data.refHr} bpm)</h3>
                <p className="muted small">
                  Allure sur tes runs faciles à FC ≈ {data.refHr} bpm. Si l'allure baisse à FC égale → ta base
                  aérobie progresse. ({data.paceAtHrTrend.n} runs)
                </p>
              </div>
              {v && <span className={`badge-v ${v.cls}`}>{v.label}</span>}
            </div>
            {data.paceAtHr.length >= 2 ? (
              <>
                <LineChart
                  points={data.paceAtHr.map((p) => ({ label: shortDate(p.date), value: p.paceSecPerKm }))}
                  invertY
                  formatY={(s) => fmtPace(s)}
                  color="#fc4c02"
                />
                <p className="muted small chart-note">↑ plus haut = plus rapide.
                  {data.paceAtHrTrend.verdict !== 'insufficient' && (
                    <> Estimé : {fmtPace(data.paceAtHrTrend.startPace)} → <strong>{fmtPace(data.paceAtHrTrend.endPace)}</strong> /km
                    ({data.paceAtHrTrend.changeSecPerKm > 0 ? '+' : ''}{data.paceAtHrTrend.changeSecPerKm}s, r²={data.paceAtHrTrend.r2}).</>
                  )}
                </p>
              </>
            ) : (
              <p className="muted">
                Pas assez de runs avec FC proche de {data.refHr} bpm sur la période. Allonge la période ou cours
                en zone facile.
              </p>
            )}
          </div>

          {/* Weekly volume */}
          <div className="card stat-card">
            <h3>Volume hebdomadaire réel (km)</h3>
            {data.weeklyVolume.length > 0 ? (
              <BarChart
                bars={data.weeklyVolume.map((w) => ({ label: shortDate(w.weekStart), value: w.km }))}
                formatY={(v) => Math.round(v)}
              />
            ) : (
              <p className="muted">Aucun run sur la période.</p>
            )}
            {data.volumeTrend.slopePerWeek != null && (
              <p className="muted small chart-note">
                Tendance sur {data.volumeTrend.weeks} sem. : {data.volumeTrend.slopePerWeek > 0 ? '+' : ''}
                {data.volumeTrend.slopePerWeek} km/sem.
              </p>
            )}
          </div>

          {/* Aerobic efficiency */}
          {data.efficiency.length >= 2 && (
            <div className="card stat-card">
              <h3>Efficacité aérobie (vitesse / FC)</h3>
              <p className="muted small">Plus haut = tu vas plus vite pour une FC donnée. Tous tes runs avec FC.</p>
              <LineChart
                points={data.efficiency.map((e) => ({ label: shortDate(e.date), value: e.value }))}
                color="#4cd787"
                formatY={(x) => x.toFixed(1)}
              />
            </div>
          )}

          <p className="muted small">
            {data.counts.total} runs analysés · {data.counts.withHr} avec FC · {data.counts.inBand} en zone ~{data.refHr} bpm.
          </p>
        </>
      )}
    </section>
  );
}
