import { useState } from 'react';
import { setPlanStartDate } from '../api.js';

/** Asks for the Monday of week 1 so the plan can be aligned to the calendar. */
export default function StartDatePrompt({ onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { startDate } = await setPlanStartDate(date);
      onSaved(startDate);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="card empty">
      <h2>Date de depart du plan</h2>
      <p className="muted">
        Choisis le <strong>lundi de la semaine 1</strong>. La date sera automatiquement calee sur
        le lundi de la semaine choisie, et chaque seance sera alignee sur le calendrier (pour le
        matching avec tes runs Strava).
      </p>
      <div className="row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn strava" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Demarrer le plan'}
        </button>
      </div>
      {error && <p className="warn-text">Erreur: {error}</p>}
    </div>
  );
}
