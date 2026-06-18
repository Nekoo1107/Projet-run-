import { useEffect, useMemo, useState } from 'react';
import { getPlanData, setSessionStatus } from '../api.js';
import StartDatePrompt from './StartDatePrompt.jsx';
import WeekView from './WeekView.jsx';
import Adherence from './Adherence.jsx';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function PlanView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      setData(await getPlanData());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const weeks = useMemo(() => (data ? data.phases.flatMap((p) => p.weeks) : []), [data]);

  // Pick the current week (by today's date) once data is loaded.
  useEffect(() => {
    if (!data || selectedWeek != null) return;
    const t = todayStr();
    const cur = weeks.find((w) => w.startDate && w.startDate <= t && t <= w.endDate);
    setSelectedWeek(cur ? cur.week : 1);
  }, [data, weeks, selectedWeek]);

  async function onStatus(sessionId, status) {
    setBusy(true);
    try {
      await setSessionStatus(sessionId, { status });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="card empty">
        <p className="warn-text">Erreur: {error}</p>
      </div>
    );
  }
  if (!data) return <p className="muted">Chargement du plan…</p>;
  if (!data.startDate) return <StartDatePrompt onSaved={() => load()} />;

  const week = weeks.find((w) => w.week === selectedWeek);
  const t = todayStr();

  return (
    <section className={busy ? 'plan busy' : 'plan'}>
      {/* Phase adherence overview */}
      <div className="phase-overview">
        {data.phases.map((p) => (
          <div key={p.number} className="phase-card">
            <div className="phase-head">
              <strong>Phase {p.number}</strong> · {p.name}
            </div>
            <Adherence actual={p.actualVolumeKm} target={p.targetVolumeKm} tracking={data.tracking} />
          </div>
        ))}
      </div>

      {!data.tracking && (
        <p className="muted hint">
          {data.trackingError
            ? `Donnees Strava indisponibles (${data.trackingError}).`
            : data.connected
              ? 'Volumes reels indisponibles — verifie la date de depart.'
              : 'Connecte Strava (onglet « Mes runs ») pour voir tes volumes reels et le matching des seances.'}
        </p>
      )}

      {/* Week selector */}
      <div className="week-strip">
        {weeks.map((w) => {
          const isCur = w.startDate && w.startDate <= t && t <= w.endDate;
          const cls = [
            'week-pill',
            w.week === selectedWeek ? 'sel' : '',
            w.isDeload ? 'deload' : '',
            isCur ? 'cur' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button key={w.week} className={cls} onClick={() => setSelectedWeek(w.week)} title={`Phase ${w.phase}`}>
              <span className="wk-n">S{w.week}</span>
              <span className="wk-v">{w.targetVolumeKm}km</span>
              {w.isDeload && <span className="wk-tag">deload</span>}
            </button>
          );
        })}
      </div>

      {week && <WeekView week={week} tracking={data.tracking} onStatus={onStatus} />}
    </section>
  );
}
