import { useEffect, useState } from 'react';
import { getActivities } from '../api.js';
import ActivityList from './ActivityList.jsx';
import ActivityDetail from './ActivityDetail.jsx';

export default function RunsView({ status }) {
  const [activities, setActivities] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!status.connected) return;
    setActivities(null);
    setError(null);
    getActivities(10)
      .then(setActivities)
      .catch((e) => setError(e.message));
  }, [status.connected]);

  if (!status.connected) {
    return (
      <div className="card empty">
        <h2>Connecte ton compte Strava</h2>
        <p className="muted">
          Une fois connecte, tes 10 derniers runs s'afficheront ici avec leurs splits.
        </p>
        {status.configured === false && (
          <p className="warn-text">
            ⚠️ Les cles Strava ne sont pas configurees cote serveur. Renseigne{' '}
            <code>server/.env</code> (voir README).
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="runs">
      <h2>10 derniers runs</h2>
      {error && (
        <div className="card empty">
          <p className="warn-text">Erreur: {error}</p>
        </div>
      )}
      {!activities && !error && <p className="muted">Recuperation depuis Strava…</p>}
      {activities && activities.length === 0 && (
        <p className="muted">Aucun run trouve sur ton compte Strava.</p>
      )}
      {activities && activities.length > 0 && (
        <ActivityList activities={activities} onSelect={setSelectedId} />
      )}
      {selectedId && <ActivityDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </section>
  );
}
