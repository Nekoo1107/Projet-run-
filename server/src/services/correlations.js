import { linreg } from './analytics.js';

const localDate = (iso) => (iso ? iso.slice(0, 10) : null);
const mondayOf = (ymd) => {
  const t = new Date(`${ymd}T00:00:00Z`);
  return new Date(t.getTime() - (((t.getUTCDay() + 6) % 7) * 86400000)).toISOString().slice(0, 10);
};
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function pearson(pairs) {
  const pts = pairs.filter(([x, y]) => x != null && y != null).map(([x, y]) => ({ x, y }));
  const fit = linreg(pts);
  if (!fit) return { r: null, n: pts.length };
  const r = Math.sign(fit.slope) * Math.sqrt(Math.max(0, fit.r2));
  return { r: round(r), n: pts.length };
}

function strength(r) {
  const a = Math.abs(r);
  if (a < 0.2) return 'négligeable';
  if (a < 0.4) return 'faible';
  if (a < 0.6) return 'modérée';
  return 'forte';
}

/**
 * Correlations between health metrics (manual/COROS) and run data.
 * @param {Array} runs    run summaries (avg_temp, average_heartrate, average_speed_ms, distance_m, start_date_local)
 * @param {Array} metrics daily health metrics ({date, hrv, sleepHours, recovery, restingHr})
 */
export function computeCorrelations(runs, metrics, minN = 4) {
  const byDate = new Map(metrics.map((m) => [m.date, m]));
  const hrRuns = runs.filter((r) => r.has_heartrate && r.average_heartrate && r.average_speed_ms);

  // weekly aggregates
  const weekKm = new Map();
  for (const r of runs) {
    const wk = mondayOf(localDate(r.start_date_local));
    weekKm.set(wk, (weekKm.get(wk) || 0) + r.distance_m / 1000);
  }
  const weekMetric = (field) => {
    const acc = new Map();
    for (const m of metrics) {
      if (m[field] == null) continue;
      const wk = mondayOf(m.date);
      const e = acc.get(wk) || { sum: 0, n: 0 };
      e.sum += m[field];
      e.n += 1;
      acc.set(wk, e);
    }
    return acc;
  };

  const out = [];

  // 1. Heat vs HR (thermal drift)
  out.push({
    key: 'heat_hr',
    label: 'Chaleur (°C) → FC moyenne',
    ...pearson(hrRuns.map((r) => [r.average_temp, r.average_heartrate])),
    framing: (r) => (r > 0 ? 'ta FC monte avec la chaleur (dérive thermique) — adapte l’allure quand il fait chaud.' : 'peu de lien chaleur/FC sur tes données.'),
  });

  // 2. Sleep vs aerobic efficiency
  out.push({
    key: 'sleep_eff',
    label: 'Sommeil (h) → efficacité aérobie',
    ...pearson(hrRuns.map((r) => [byDate.get(localDate(r.start_date_local))?.sleepHours ?? null, r.average_speed_ms / r.average_heartrate])),
    framing: (r) => (r > 0 ? 'mieux tu dors, plus tu cours efficacement à FC donnée.' : 'lien sommeil/efficacité peu marqué.'),
  });

  // 3. HRV vs weekly volume
  {
    const acc = weekMetric('hrv');
    const pairs = [...weekKm.entries()].filter(([wk]) => acc.has(wk)).map(([wk, km]) => [acc.get(wk).sum / acc.get(wk).n, km]);
    out.push({
      key: 'hrv_volume',
      label: 'HRV (moy hebdo) → volume hebdo',
      ...pearson(pairs),
      framing: (r) => (r < 0 ? 'ton HRV tend à baisser quand le volume monte (signe de charge) — surveille la récup.' : 'ton HRV tient malgré le volume — bonne adaptation.'),
    });
  }

  // 4. Recovery vs weekly volume
  {
    const acc = weekMetric('recovery');
    const pairs = [...weekKm.entries()].filter(([wk]) => acc.has(wk)).map(([wk, km]) => [acc.get(wk).sum / acc.get(wk).n, km]);
    out.push({
      key: 'recovery_volume',
      label: 'Récupération (moy hebdo) → volume hebdo',
      ...pearson(pairs),
      framing: (r) => (r < 0 ? 'ta récup baisse avec le volume — normal, garde les deloads sacrés.' : 'récup stable face au volume.'),
    });
  }

  return out
    .map((c) => ({
      key: c.key,
      label: c.label,
      r: c.r,
      n: c.n,
      enough: c.n >= minN && c.r != null,
      strength: c.r != null ? strength(c.r) : null,
      direction: c.r == null ? null : c.r >= 0 ? 'positive' : 'négative',
      note: c.r != null && c.n >= minN ? c.framing(c.r) : null,
    }));
}

/** Volume-spike, deload-approaching and HR-drift alerts. */
export function computeAlerts({ analytics, deloadWeeks = [5, 9], currentWeek = null }) {
  const alerts = [];

  if (analytics?.weeklyVolume?.length >= 2) {
    const wv = analytics.weeklyVolume;
    const last = wv[wv.length - 1];
    const prev = wv[wv.length - 2];
    if (prev.km > 0 && last.km > prev.km * 1.15) {
      const pctInc = Math.round(((last.km - prev.km) / prev.km) * 100);
      alerts.push({
        kind: 'volume',
        text: `Ton volume a augmenté de ${pctInc}% (${prev.km} → ${last.km} km). Au-dessus de +15%/sem = risque de blessure.`,
      });
    }
  }

  if (currentWeek != null) {
    if (deloadWeeks.includes(currentWeek)) {
      alerts.push({ kind: 'deload', text: `Semaine ${currentWeek} = deload. Allège, c'est non négociable.` });
    } else if (deloadWeeks.includes(currentWeek + 1)) {
      alerts.push({ kind: 'deload', text: `Deload la semaine prochaine (S${currentWeek + 1}). Prépare-toi à lever le pied.` });
    }
  }

  if (analytics?.allHrRuns?.length) {
    const recent = analytics.allHrRuns.slice(-8);
    const hot = recent.filter((r) => r.avgHr > 152);
    if (hot.length >= 3) {
      alerts.push({
        kind: 'hr',
        text: `${hot.length} de tes 8 derniers runs sont à FC > 152 bpm. Si ce sont des jours faciles, tu cours trop dur — ralentis.`,
      });
    }
  }

  return alerts;
}
