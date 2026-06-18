// Pure analytics over run summaries — no I/O. Fed by the Strava service.

const RUN_EASY_TYPES = new Set(['easy', 'long']); // not used directly; we filter by HR

/** Linear regression over [{x, y}] points → { slope, intercept, r2, n }. */
export function linreg(points) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const { x, y } of points) {
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  let ssTot = 0, ssRes = 0;
  for (const { x, y } of points) {
    const yhat = slope * x + intercept;
    ssRes += (y - yhat) ** 2;
    ssTot += (y - meanY) ** 2;
  }
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2, n };
}

const dayNum = (ymd) => Math.floor(new Date(`${ymd}T00:00:00Z`).getTime() / 86400000);
const localDate = (iso) => (iso ? iso.slice(0, 10) : null);
const mondayOf = (ymd) => {
  const t = new Date(`${ymd}T00:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7;
  return new Date(t.getTime() - dow * 86400000).toISOString().slice(0, 10);
};
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * @param {Array} runs  run summaries (distance_m, average_speed_ms, average_heartrate, start_date_local, has_heartrate)
 * @param {object} opts { refHr=145, band=7 }
 */
export function computeAnalytics(runs, { refHr = 145, band = 7 } = {}) {
  const withHr = runs
    .filter((r) => r.has_heartrate && r.average_heartrate && r.average_speed_ms)
    .map((r) => ({
      date: localDate(r.start_date_local),
      paceSecPerKm: Math.round(1000 / r.average_speed_ms),
      avgHr: Math.round(r.average_heartrate),
      distanceKm: round(r.distance_m / 1000),
      name: r.name,
      id: r.id,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Pace at comparable HR (~refHr) : the "metric reine" ---
  const inBand = withHr.filter((r) => Math.abs(r.avgHr - refHr) <= band);
  const baseDay = inBand.length ? dayNum(inBand[0].date) : 0;
  const points = inBand.map((r) => ({ x: dayNum(r.date) - baseDay, y: r.paceSecPerKm }));
  const fit = linreg(points);

  let paceAtHrTrend = { verdict: 'insufficient', n: inBand.length };
  if (fit && inBand.length >= 4) {
    const span = points[points.length - 1].x - points[0].x || 1;
    const changeSec = fit.slope * span; // + = slower over period
    let verdict = 'stagnation';
    if (changeSec <= -4) verdict = 'progression';
    else if (changeSec >= 4) verdict = 'regression';
    paceAtHrTrend = {
      verdict,
      n: inBand.length,
      changeSecPerKm: round(changeSec, 0),
      slopeSecPerDay: round(fit.slope, 2),
      r2: round(fit.r2, 2),
      startPace: Math.round(fit.intercept),
      endPace: Math.round(fit.intercept + fit.slope * span),
    };
  }

  // --- Aerobic efficiency (m/s per bpm) over time, all HR runs ---
  const efficiency = withHr.map((r) => ({
    date: r.date,
    value: round((1000 / r.paceSecPerKm / r.avgHr) * 1000, 2), // (m/s)/bpm *1000
  }));

  // --- Weekly volume (actual), grouped by Monday ---
  const weekMap = new Map();
  for (const r of runs) {
    const d = localDate(r.start_date_local);
    if (!d) continue;
    const wk = mondayOf(d);
    weekMap.set(wk, (weekMap.get(wk) || 0) + r.distance_m / 1000);
  }
  const weeklyVolume = [...weekMap.entries()]
    .map(([weekStart, km]) => ({ weekStart, km: round(km) }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // volume trend (last up-to-8 weeks)
  const recentWeeks = weeklyVolume.slice(-8);
  const volPoints = recentWeeks.map((w, i) => ({ x: i, y: w.km }));
  const volFit = linreg(volPoints);
  const volumeTrend = volFit
    ? { slopePerWeek: round(volFit.slope), r2: round(volFit.r2, 2), weeks: recentWeeks.length }
    : { weeks: recentWeeks.length };

  return {
    refHr,
    band,
    counts: { total: runs.length, withHr: withHr.length, inBand: inBand.length },
    paceAtHr: inBand.map((r) => ({ date: r.date, paceSecPerKm: r.paceSecPerKm, avgHr: r.avgHr })),
    paceAtHrFit: fit
      ? { startPace: Math.round(fit.intercept), endPace: Math.round(fit.intercept + fit.slope * (points.at(-1)?.x || 0)) }
      : null,
    paceAtHrTrend,
    efficiency,
    weeklyVolume,
    volumeTrend,
    allHrRuns: withHr, // for scatter / debugging
  };
}
