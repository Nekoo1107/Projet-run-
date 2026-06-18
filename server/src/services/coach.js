import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { getPlan } from '../plan/buildPlan.js';
import { getSetting, getTokens } from '../db.js';
import { listRunsBetween } from './strava.js';
import { computeAnalytics } from './analytics.js';

const MODEL = 'claude-opus-4-8';

let client = null;
function getClient() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL from env
  return client;
}

const fmtPace = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const paceFromMs = (ms) => (ms ? fmtPace(1000 / ms) : '—');

// 60s cache so a multi-message chat doesn't re-hit Strava on every turn.
let ctxCache = null;
export async function gatherData() {
  if (ctxCache && Date.now() - ctxCache.at < 60000) return ctxCache.data;
  const plan = getPlan();
  const startDate = getSetting('plan_start_date');
  let runs = [];
  let analytics = null;
  if (getTokens()) {
    try {
      const now = Math.floor(Date.now() / 1000);
      runs = await listRunsBetween(now - 120 * 86400, now + 86400);
      analytics = computeAnalytics(runs);
    } catch {
      /* Strava unavailable — context degrades but chat still works */
    }
  }
  let clientContext = null;
  try {
    const raw = getSetting('client_context');
    if (raw) clientContext = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const data = { plan, startDate, runs, analytics, clientContext };
  ctxCache = { at: Date.now(), data };
  return data;
}

function currentWeekNumber(startDate) {
  if (!startDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000);
  const wk = Math.floor(days / 7) + 1;
  return wk >= 1 && wk <= 12 ? wk : null;
}

export function buildContext({ plan, startDate, runs, analytics, clientContext }) {
  const lines = [];

  // Today's context (local time + weather) so Jarvis can mention it.
  if (clientContext) {
    lines.push('## Aujourd’hui');
    if (clientContext.localTime) lines.push(`- Date/heure locale : ${clientContext.localTime}`);
    if (clientContext.weather) lines.push(`- Météo : ${clientContext.weather} (adapte tes conseils à la chaleur/au froid)`);
    lines.push('');
  }

  // Plan overview
  lines.push('## Plan 12 semaines (référence)');
  for (const p of plan.phases) {
    lines.push(`- Phase ${p.number} ${p.name} (S${p.weekNumbers[0]}–S${p.weekNumbers.at(-1)}) — cible ${p.targetVolumeKm} km`);
  }
  const wk = currentWeekNumber(startDate);
  if (wk) {
    const w = plan.weeks.find((x) => x.week === wk);
    lines.push(`\n### Semaine en cours : S${wk} (Phase ${w.phase}${w.isDeload ? ', DELOAD' : ''}) — cible ${w.targetVolumeKm} km`);
    for (const s of w.sessions.filter((s) => s.isRun)) {
      lines.push(`- ${s.dayLabel} : ${s.type} ${s.targetDistanceKm}km${s.quality ? ` (${s.quality})` : ''}${s.targetPace ? ` @ ${s.targetPace}` : ''}`);
    }
  } else {
    lines.push('\n(Date de départ du plan non définie — pas de semaine courante calée sur le calendrier.)');
  }

  // Recent runs
  if (runs.length) {
    lines.push('\n## Runs réels récents (Strava, du plus récent)');
    for (const r of [...runs].slice(-12).reverse()) {
      const d = r.start_date_local?.slice(0, 10);
      const km = (r.distance_m / 1000).toFixed(1);
      const hr = r.has_heartrate ? `${Math.round(r.average_heartrate)} bpm` : 'FC n/d';
      lines.push(`- ${d} : ${km} km @ ${paceFromMs(r.average_speed_ms)} /km, ${hr}`);
    }
  } else {
    lines.push('\n## Runs réels\n(Aucune donnée Strava disponible.)');
  }

  // Trends
  if (analytics) {
    const t = analytics.paceAtHrTrend;
    lines.push('\n## Tendances');
    if (t.verdict !== 'insufficient') {
      lines.push(`- Allure à ~${analytics.refHr} bpm : ${t.verdict} (${fmtPace(t.startPace)} → ${fmtPace(t.endPace)} /km sur ${t.n} runs, r²=${t.r2}). C'est la métrique reine : allure qui baisse à FC égale = base aérobie qui progresse.`);
    } else {
      lines.push(`- Allure à FC comparable : données insuffisantes (${t.n} runs en zone).`);
    }
    const wv = analytics.weeklyVolume.slice(-6).map((w) => `${w.km}`).join(', ');
    if (wv) lines.push(`- Volume hebdo réel (6 dern. sem.) : ${wv} km. Tendance : ${analytics.volumeTrend.slopePerWeek ?? '—'} km/sem.`);
  }

  return lines.join('\n');
}

export const SYSTEM_RULES = `Tu es le coach IA personnel d'un coureur, intégré à son app de suivi. Tu réponds en français, de façon concise, concrète et chiffrée, en t'appuyant UNIQUEMENT sur les données ci-dessous. Si une donnée manque, dis-le clairement plutôt que d'inventer.

Règles d'entraînement NON NÉGOCIABLES (tu ne proposes jamais quelque chose qui les viole) :
1. Deloads (semaines 5 et 9) sacrés : jamais supprimés ni alourdis.
2. Progression de volume plafonnée à ~10–15 %/semaine.
3. Douleur localisée signalée → course en pause, repos/cross-training, reprise seulement après résolution confirmée. Pas de "on teste pour voir".
4. Jamais 3 jours durs d'affilée.
5. Jours faciles = FC plafonnée (≤150 bpm). Signale si les réels dépassent régulièrement.
6. La perf se construit par le volume cumulé SANS interruption : rester entier prime sur rattraper à tout prix.

Sois encourageant mais honnête. Donne des chiffres précis quand c'est pertinent. Réponses courtes par défaut, détaillées seulement si on te le demande.`;

/**
 * Stream a coaching response to `res` (text/plain chunks).
 * @param {Array<{role:'user'|'assistant', content:string}>} messages
 */
export async function streamCoachReply(messages, res) {
  const data = await gatherData();
  const context = buildContext(data);
  const system = `${SYSTEM_RULES}\n\n===== DONNÉES DE L'UTILISATEUR =====\n${context}`;

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      res.write(event.delta.text);
    }
  }
  await stream.finalMessage().catch(() => {});
}
