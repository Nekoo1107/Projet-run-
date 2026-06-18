import { parsePlanMarkdown } from './parsePlan.js';

// Deload weeks are non-negotiable (cf. plan). Hardcoded as per the document.
const DELOAD_WEEKS = new Set([5, 9]);

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim' };

const RUN_TYPES = new Set(['easy', 'long', 'seuil', 'vo2max', 'tempo']);

// --- Day templates, derived from each phase's "Schéma semaine type" prose. ---
// dist kinds: {from:'Col'} table cell · {sameAs:'wed'} · {remainder:true}
//             {easyShare:true} (splits leftover volume) · {qualityEstimate:'Col'}

const PHASE1_DAYS = [
  { day: 'mon', runType: 'easy', title: 'Easy + 5 strides', strides: 5, evening: 'Force A', dist: { from: 'Lun' } },
  { day: 'tue', cross: 'Escalade', title: 'Escalade' },
  { day: 'wed', runType: 'easy', title: 'Easy mid', dist: { from: 'Mer' } },
  { day: 'thu', runType: 'easy', title: 'Easy + 6 strides', strides: 6, evening: 'Force A', dist: { sameAs: 'wed' } },
  { day: 'fri', rest: true, title: 'Repos / mobilité' },
  { day: 'sat', runType: 'long', title: 'Sortie longue facile', dist: { from: 'Sam (long)' } },
  { day: 'sun', cross: 'Escalade', runType: 'easy', optional: true, title: 'Escalade (+ easy optionnel)', dist: { remainder: true } },
];

const PHASE2_DAYS = [
  { day: 'mon', runType: 'easy', title: 'AM easy + strides', strides: true, evening: 'Force A', dist: { easyShare: true } },
  { day: 'tue', cross: 'Escalade', runType: 'easy', double: true, title: 'Escalade + AM easy (double)', dist: { easyShare: true } },
  { day: 'wed', runType: 'seuil', title: 'Seuil', dist: { qualityEstimate: 'Seuil' } },
  { day: 'thu', runType: 'easy', title: 'AM easy', evening: 'Plyo B', dist: { easyShare: true } },
  { day: 'fri', rest: true, title: 'Repos / mobilité' },
  { day: 'sat', runType: 'long', title: 'Sortie longue', dist: { from: 'Long' } },
  { day: 'sun', cross: 'Escalade', runType: 'easy', double: true, title: 'Escalade + easy (double)', dist: { easyShare: true } },
];

const PHASE3_DAYS = [
  { day: 'mon', runType: 'easy', title: 'AM easy + strides', strides: true, evening: 'Plyo B réactif', dist: { easyShare: true } },
  { day: 'tue', cross: 'Escalade', runType: 'easy', double: true, title: 'Escalade + easy (double)', dist: { easyShare: true } },
  { day: 'wed', runType: 'vo2max', title: 'VO2max', dist: { qualityEstimate: 'Mercredi' } },
  { day: 'thu', runType: 'easy', title: 'AM easy', evening: 'Force A maintien + gainage', dist: { easyShare: true } },
  { day: 'fri', rest: true, title: 'Repos' },
  { day: 'sat', runType: 'long', tempoFinish: true, title: 'Sortie longue (finition tempo)', dist: { from: 'Long' } },
  { day: 'sun', cross: 'Escalade', runType: 'easy', double: true, title: 'Escalade + easy (double)', dist: { easyShare: true } },
];

/** During a deload, the midweek quality session becomes an easy run. */
function deloadVariant(days) {
  return days.map((d) =>
    d.day === 'wed'
      ? { day: 'wed', runType: 'easy', title: 'Easy (deload)', dist: { easyShare: true } }
      : d
  );
}

function templateFor(phaseNumber, week) {
  if (phaseNumber === 1) return PHASE1_DAYS;
  const base = phaseNumber === 2 ? PHASE2_DAYS : PHASE3_DAYS;
  return DELOAD_WEEKS.has(week) ? deloadVariant(base) : base;
}

/** First "<number> km" (or bare number) in a cell → Number, else null. */
function extractKm(cell) {
  if (!cell) return null;
  const m = String(cell).match(/(\d+(?:[.,]\d+)?)\s*km/i) || String(cell).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Rough distance of a quality session from its description ("4 × 1000", "6 × 3 min"). */
function estimateQualityKm(text) {
  if (!text || /deload|—/i.test(text)) return null;
  const m = text.match(/(\d+)\s*[×x]\s*(\d+)/);
  const warmCool = 3; // 2 km échauffement + 1 km retour
  if (!m) return warmCool;
  const reps = parseInt(m[1], 10);
  if (/min/i.test(text)) {
    const minutes = parseInt(m[2], 10);
    const repKm = reps * minutes * 0.25; // ~4:00/km à VO2max
    const recovKm = reps * 0.33; // récup trot
    return Math.max(5, Math.round(warmCool + repKm + recovKm));
  }
  const meters = parseInt(m[2], 10);
  const repKm = (reps * meters) / 1000;
  const recovKm = reps * 0.25;
  const tempoExtra = /\+\s*1\s*km\s*tempo/i.test(text) ? 1 : 0;
  return Math.max(5, Math.round(warmCool + repKm + recovKm + tempoExtra));
}

/** Build the 7 day-sessions for one week. */
function buildWeek(phase, weekRow) {
  const { week, cells } = weekRow;
  const isDeload = DELOAD_WEEKS.has(week);
  const volume = extractKm(cells.Volume);
  const template = templateFor(phase.number, week);

  // Pass 1: resolve directly-known distances (table cells, quality estimates).
  const resolved = {};
  const qualityText = {};
  for (const t of template) {
    if (!t.dist) continue;
    if (t.dist.from) resolved[t.day] = extractKm(cells[t.dist.from]);
    else if (t.dist.qualityEstimate) {
      qualityText[t.day] = cells[t.dist.qualityEstimate] || null;
      resolved[t.day] = estimateQualityKm(qualityText[t.day]);
    }
  }
  // Pass 2: sameAs references.
  for (const t of template) {
    if (t.dist?.sameAs) resolved[t.day] = resolved[t.dist.sameAs] ?? null;
  }
  // Pass 3: distribute leftover volume.
  const easyShareDays = template.filter((t) => t.dist?.easyShare).map((t) => t.day);
  const remainderDays = template.filter((t) => t.dist?.remainder).map((t) => t.day);
  const knownSum = Object.entries(resolved)
    .filter(([d]) => !easyShareDays.includes(d) && !remainderDays.includes(d))
    .reduce((s, [, v]) => s + (v || 0), 0);
  const leftover = Math.max(0, (volume || 0) - knownSum);
  if (easyShareDays.length) {
    const share = round1(leftover / easyShareDays.length);
    easyShareDays.forEach((d) => (resolved[d] = share));
  }
  remainderDays.forEach((d) => (resolved[d] = round1(leftover))); // phase 1 Sunday

  // Materialize the day sessions.
  const estimatedKinds = new Set(['sameAs', 'remainder', 'easyShare', 'qualityEstimate']);
  const sessions = template.map((t) => {
    const km = t.dist ? resolved[t.day] ?? null : null;
    const hasRun = Boolean(t.runType) && km != null && km > 0;
    const type = hasRun ? t.runType : t.cross ? 'escalade' : 'repos';
    const distKind = t.dist ? Object.keys(t.dist)[0] : null;
    return {
      id: `w${week}-${t.day}`,
      week,
      day: t.day,
      dayLabel: DAY_LABEL[t.day],
      type,
      title: t.title,
      isRun: hasRun,
      targetDistanceKm: hasRun ? km : null,
      distanceEstimated: hasRun ? estimatedKinds.has(distKind) : false,
      quality: qualityText[t.day] || null,
      strides: t.strides ?? null,
      evening: t.evening ?? null,
      cross: t.cross ?? null,
      double: Boolean(t.double),
      optional: Boolean(t.optional),
      tempoFinish: Boolean(t.tempoFinish),
    };
  });

  return {
    week,
    phase: phase.number,
    phaseName: phase.name,
    isDeload,
    targetVolumeKm: volume,
    plannedRunVolumeKm: round1(
      sessions.filter((s) => s.isRun).reduce((s, x) => s + (x.targetDistanceKm || 0), 0)
    ),
    sessions,
  };
}

let cached = null;

/** The full structured plan: zones, phases, and 12 built weeks. Cached. */
export function getPlan() {
  if (cached) return cached;
  const parsed = parsePlanMarkdown();
  const zoneFor = (type) => {
    const z = parsed.zones[type];
    return z ? { pace: z.pace, hr: z.hr } : null;
  };

  const phases = parsed.phases.map((phase) => {
    const weeks = phase.weeks.map((w) => buildWeek(phase, w));
    // Attach pace/HR targets per run session from the reference zone table.
    for (const wk of weeks) {
      for (const s of wk.sessions) {
        if (RUN_TYPES.has(s.type)) {
          const z = zoneFor(s.type);
          s.targetPace = z?.pace ?? null;
          s.targetHr = z?.hr ?? null;
        }
      }
    }
    return {
      number: phase.number,
      name: phase.name,
      weekNumbers: weeks.map((w) => w.week),
      targetVolumeKm: round1(weeks.reduce((s, w) => s + (w.targetVolumeKm || 0), 0)),
      weeks,
    };
  });

  const weeksFlat = phases.flatMap((p) => p.weeks);
  cached = {
    zones: parsed.zones,
    phases,
    weeks: weeksFlat,
    totalWeeks: weeksFlat.length,
    deloadWeeks: [...DELOAD_WEEKS],
    sourcePath: parsed.sourcePath,
  };
  return cached;
}

export function getWeek(n) {
  return getPlan().weeks.find((w) => w.week === n) || null;
}

export { DAY_ORDER };
