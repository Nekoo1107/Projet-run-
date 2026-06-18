import { useEffect, useState } from 'react';
import { getStatus, getActivities } from './api.js';
import ConnectStrava from './components/ConnectStrava.jsx';
import ActivityList from './components/ActivityList.jsx';
import ActivityDetail from './components/ActivityDetail.jsx';

const BANNERS = {
  connected: { kind: 'ok', text: 'Strava connecte ✓' },
  denied: { kind: 'warn', text: 'Connexion refusee sur Strava.' },
  error: { kind: 'warn', text: 'Echec de la connexion Strava, reessaie.' },
};

export default function App() {
  const [status, setStatus] = useState({ loading: true });
  const [activities, setActivities] = useState(null);
  const [activitiesError, setActivitiesError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [banner, setBanner] = useState(null);

  // Pick up ?strava=... from the OAuth redirect, show a banner, clean the URL.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('strava');
    if (param && BANNERS[param]) {
      setBanner(BANNERS[param]);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function refreshStatus() {
    setStatus({ loading: true });
    try {
      const s = await getStatus();
      setStatus({ loading: false, ...s });
    } catch {
      setStatus({ loading: false, connected: false, unreachable: true });
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  // Load runs once connected.
  useEffect(() => {
    if (!status.connected) return;
    setActivities(null);
    setActivitiesError(null);
    getActivities(10)
      .then(setActivities)
      .catch((e) => setActivitiesError(e.message));
  }, [status.connected]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🏃</span>
          <div>
            <h1>Projet Run</h1>
            <p className="subtitle">Suivi d'entrainement — Phase 1</p>
          </div>
        </div>
        <ConnectStrava status={status} onChange={refreshStatus} />
      </header>

      {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}

      <main>
        {status.loading && <p className="muted">Chargement…</p>}

        {!status.loading && status.unreachable && (
          <div className="card empty">
            <p>Le backend ne repond pas sur <code>http://localhost:3001</code>.</p>
            <p className="muted">Lance-le avec <code>npm run dev</code> (voir le README).</p>
          </div>
        )}

        {!status.loading && !status.unreachable && !status.connected && (
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
        )}

        {status.connected && (
          <section className="runs">
            <h2>10 derniers runs</h2>
            {activitiesError && (
              <div className="card empty">
                <p className="warn-text">Erreur: {activitiesError}</p>
              </div>
            )}
            {!activities && !activitiesError && <p className="muted">Recuperation depuis Strava…</p>}
            {activities && activities.length === 0 && (
              <p className="muted">Aucun run trouve sur ton compte Strava.</p>
            )}
            {activities && activities.length > 0 && (
              <ActivityList activities={activities} onSelect={setSelectedId} />
            )}
          </section>
        )}
      </main>

      {selectedId && <ActivityDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
