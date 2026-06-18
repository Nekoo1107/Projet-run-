import { connectUrl, disconnect } from '../api.js';

export default function ConnectStrava({ status, onChange }) {
  if (status.loading) return null;

  if (status.connected) {
    const a = status.athlete;
    const name = a ? `${a.firstname ?? ''} ${a.lastname ?? ''}`.trim() : 'Strava';
    return (
      <div className="conn">
        {a?.profile && a.profile.startsWith('http') && (
          <img className="avatar" src={a.profile} alt="" />
        )}
        <span className="conn-name">{name || 'Connecte'}</span>
        <button
          className="btn ghost"
          onClick={async () => {
            await disconnect();
            onChange();
          }}
        >
          Deconnecter
        </button>
      </div>
    );
  }

  return (
    <a className="btn strava" href={connectUrl()}>
      Se connecter avec Strava
    </a>
  );
}
