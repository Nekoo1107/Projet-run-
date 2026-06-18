import { DAY_ORDER } from '../plan/buildPlan.js';

const DAY_MS = 86400000;
const round1 = (n) => Math.round(n * 10) / 10;
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const HARD = new Set(['seuil', 'vo2max', 'tempo']);
const isHard = (s) => HARD.has(s.type) || (s.type === 'long' && s.tempoFinish);

/**
 * Deterministic adaptation engine for the current week.
 * Returns validatable `proposals` (each carries concrete `changes`) and read-only `alerts`.
 * Never violates the non-negotiable coaching rules.
 */
export function computeAdaptation({ week, weekStart, nextWeek, today, actuals = {}, statuses = {}, overrides = {}, painActive = false }) {
  const proposals = [];
  const alerts = [];
  const eff = (s) => overrides[s.id]?.adaptedKm ?? (s.targetDistanceKm || 0);

  const enriched = week.sessions
    .filter((s) => s.isRun)
    .map((s) => {
      const date = addDays(weekStart, DAY_ORDER.indexOf(s.day));
      const a = actuals[s.id];
      return {
        ...s,
        date,
        effKm: eff(s),
        isPast: date <= today,
        actualKm: a?.actualKm ?? null,
        avgHr: a?.avgHr ?? null,
        status: statuses[s.id]?.status || null,
      };
    });

  // --- Rule 3: pain → pause the running build (overrides everything else) ---
  if (painActive) {
    const remaining = enriched.filter((s) => !s.isPast && s.effKm > 0);
    if (remaining.length) {
      proposals.push({
        id: 'pain-pause',
        kind: 'pain',
        title: 'Douleur signalée → mettre la course en pause',
        detail: `Repos / cross-training sur les ${remaining.length} séance(s) restantes. Reprise uniquement après avoir marqué la douleur résolue — pas de "on teste pour voir".`,
        changes: remaining.map((s) => ({ sessionId: s.id, adaptedKm: 0, reason: 'pause douleur' })),
      });
    }
    alerts.push({ kind: 'pain', text: "Course en pause tant que la douleur est active. 3 jours de coupe coûtent 3 jours ; une blessure ignorée coûte des semaines." });
    return { proposals, alerts };
  }

  const weeklyTarget = week.targetVolumeKm || 0;
  const past = enriched.filter((s) => s.isPast);
  const future = enriched.filter((s) => !s.isPast);
  const actualToDate = past.reduce((a, s) => a + (s.actualKm || 0), 0);
  const plannedToDate = past.reduce((a, s) => a + s.effKm, 0);
  const plannedRemaining = future.reduce((a, s) => a + s.effKm, 0);
  const projected = actualToDate + plannedRemaining;

  // --- Scenario A: surplus already run → absorb it, don't exceed weekly target ---
  if (!week.isDeload && projected > weeklyTarget + 1) {
    const overage = round1(projected - weeklyTarget);
    const easyRemaining = future.filter((s) => s.type === 'easy' && s.effKm > 0);
    const totalEasy = easyRemaining.reduce((a, s) => a + s.effKm, 0);
    const changes = [];
    for (const s of easyRemaining) {
      if (totalEasy <= 0) break;
      const newKm = round1(Math.max(0, s.effKm - overage * (s.effKm / totalEasy)));
      if (newKm !== s.effKm) changes.push({ sessionId: s.id, adaptedKm: newKm, reason: 'absorber le surplus' });
    }
    if (changes.length) {
      const surplus = round1(actualToDate - plannedToDate);
      proposals.push({
        id: 'absorb-surplus',
        kind: 'volume',
        title: `Absorber le surplus${surplus > 0 ? ` (+${surplus} km déjà courus)` : ''}`,
        detail: `Projeté ${round1(projected)} km > cible ${weeklyTarget} km. On réduit les séances faciles restantes pour rester sur le volume hebdo — la perf se construit sans pic.`,
        changes,
      });
    }
  }

  // --- Scenario B: skipped sessions → no brutal catch-up (information only) ---
  const skipped = enriched.filter(
    (s) => s.status === 'skipped' || (s.isPast && !['done', 'modified'].includes(s.status) && s.actualKm == null && s.effKm > 0)
  );
  if (skipped.length) {
    alerts.push({
      kind: 'skip',
      text: `${skipped.length} séance(s) non réalisée(s) : on ne reporte PAS le volume manquant (ça créerait un pic). On garde la progression douce.`,
    });
  }

  // --- Scenario C: after a shortfall, cap next week's ramp at +15% ---
  if (nextWeek && !nextWeek.isDeload && projected < weeklyTarget * 0.9) {
    const cap = round1(projected * 1.15);
    if ((nextWeek.targetVolumeKm || 0) > cap + 1) {
      const nextEasy = nextWeek.sessions.filter((s) => s.isRun && s.type === 'easy' && (s.targetDistanceKm || 0) > 0);
      const reduceBy = (nextWeek.targetVolumeKm || 0) - cap;
      const totalNextEasy = nextEasy.reduce((a, s) => a + s.targetDistanceKm, 0);
      const changes = [];
      for (const s of nextEasy) {
        if (totalNextEasy <= 0) break;
        const newKm = round1(Math.max(0, s.targetDistanceKm - reduceBy * (s.targetDistanceKm / totalNextEasy)));
        changes.push({ sessionId: s.id, adaptedKm: newKm, reason: 'montée ≤15% après déficit' });
      }
      if (changes.length) {
        proposals.push({
          id: 'ramp-guard',
          kind: 'ramp',
          title: `Lisser la montée vers S${nextWeek.week}`,
          detail: `Semaine basse (~${round1(projected)} km vs ${weeklyTarget} cible). S${nextWeek.week} vise ${nextWeek.targetVolumeKm} km (> +15 %). On plafonne à ${cap} km pour ne pas enchaîner déficit puis pic.`,
          changes,
        });
      }
    }
  }

  // --- Rule 5: easy-day HR drifting above 150 bpm ---
  const overHr = enriched.filter((s) => s.type === 'easy' && s.avgHr != null && s.avgHr > 150);
  if (overHr.length >= 2) {
    alerts.push({
      kind: 'hr',
      text: `Tes jours faciles dérivent au-dessus de 150 bpm (${overHr.length} cette semaine). Ralentis — les jours easy doivent être ennuyeux, c'est ce qui te protège.`,
    });
  }

  // --- Rule 4: never 3 hard days in a row ---
  let streak = 0;
  let threeHard = false;
  for (const day of DAY_ORDER) {
    const s = week.sessions.find((x) => x.day === day);
    streak = s && s.isRun && isHard(s) ? streak + 1 : 0;
    if (streak >= 3) threeHard = true;
  }
  if (threeHard) alerts.push({ kind: 'hard', text: '3 jours durs d’affilée détectés — à éviter. Réintercale un jour facile ou repos.' });

  // --- Rule 1: deload reminders (sacred) ---
  if (week.isDeload) alerts.push({ kind: 'deload', text: `Semaine de deload (S${week.week}) — allège, c'est non négociable. C'est pendant la décharge que les gains se figent.` });
  if (nextWeek?.isDeload) alerts.push({ kind: 'deload', text: `Deload la semaine prochaine (S${nextWeek.week}) — sacré, ne l'alourdis pas.` });

  return { proposals, alerts };
}
