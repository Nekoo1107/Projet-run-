import { useEffect, useState } from 'react';
import { getStatus } from './api.js';
import ConnectStrava from './components/ConnectStrava.jsx';
import RunsView from './components/RunsView.jsx';
import PlanView from './components/PlanView.jsx';
import StatsView from './components/StatsView.jsx';
import ChatView from './components/ChatView.jsx';
import AdaptationView from './components/AdaptationView.jsx';
import HealthView from './components/HealthView.jsx';

const BANNERS = {
  connected: { kind: 'ok', text: 'Strava connecte ✓' },
  denied: { kind: 'warn', text: 'Connexion refusee sur Strava.' },
  error: { kind: 'warn', text: 'Echec de la connexion Strava, reessaie.' },
};

export default function App() {
  const [status, setStatus] = useState({ loading: true });
  const [banner, setBanner] = useState(null);
  const [tab, setTab] = useState('plan');

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🏃</span>
          <div>
            <h1>Projet Run</h1>
            <p className="subtitle">Suivi d'entrainement + coach IA</p>
          </div>
        </div>
        <ConnectStrava status={status} onChange={refreshStatus} />
      </header>

      <nav className="tabs">
        <button className={tab === 'plan' ? 'tab active' : 'tab'} onClick={() => setTab('plan')}>
          Plan 12 semaines
        </button>
        <button className={tab === 'adapt' ? 'tab active' : 'tab'} onClick={() => setTab('adapt')}>
          Adaptation
        </button>
        <button className={tab === 'stats' ? 'tab active' : 'tab'} onClick={() => setTab('stats')}>
          Stats
        </button>
        <button className={tab === 'health' ? 'tab active' : 'tab'} onClick={() => setTab('health')}>
          Santé
        </button>
        <button className={tab === 'coach' ? 'tab active' : 'tab'} onClick={() => setTab('coach')}>
          Coach IA
        </button>
        <button className={tab === 'runs' ? 'tab active' : 'tab'} onClick={() => setTab('runs')}>
          Mes runs
        </button>
      </nav>

      {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}

      <main>
        {status.loading && <p className="muted">Chargement…</p>}

        {!status.loading && status.unreachable && (
          <div className="card empty">
            <p>Le backend ne repond pas sur <code>http://localhost:3001</code>.</p>
            <p className="muted">Lance-le avec <code>npm run dev</code> (voir le README).</p>
          </div>
        )}

        {!status.loading && !status.unreachable && tab === 'runs' && <RunsView status={status} />}
        {!status.loading && !status.unreachable && tab === 'plan' && <PlanView status={status} />}
        {!status.loading && !status.unreachable && tab === 'adapt' && <AdaptationView />}
        {!status.loading && !status.unreachable && tab === 'stats' && <StatsView status={status} />}
        {!status.loading && !status.unreachable && tab === 'health' && <HealthView />}
        {!status.loading && !status.unreachable && tab === 'coach' && <ChatView />}
      </main>
    </div>
  );
}
