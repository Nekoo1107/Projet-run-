// Tiny dependency-free SVG charts. Responsive via viewBox + width:100%.

const PAD = { l: 46, r: 14, t: 14, b: 26 };

function scale(v, min, max, lo, hi) {
  if (max === min) return (lo + hi) / 2;
  return lo + ((v - min) / (max - min)) * (hi - lo);
}

/** points: [{ label, value }] */
export function LineChart({ points, height = 190, color = '#fc4c02', invertY = false, formatY = (v) => v }) {
  const W = 640;
  const H = height;
  if (!points || points.length === 0) return <p className="muted">Pas assez de données.</p>;

  const ys = points.map((p) => p.value);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const padY = (maxY - minY) * 0.12;
  minY -= padY;
  maxY += padY;

  const x = (i) => scale(i, 0, points.length - 1 || 1, PAD.l, W - PAD.r);
  const y = (v) =>
    invertY ? scale(v, minY, maxY, PAD.t, H - PAD.b) : scale(v, minY, maxY, H - PAD.b, PAD.t);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [minY, (minY + maxY) / 2, maxY];
  const xticks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      {ticks.map((t, i) => {
        const yy = y(t);
        return (
          <g key={i}>
            <line x1={PAD.l} y1={yy} x2={W - PAD.r} y2={yy} className="grid" />
            <text x={PAD.l - 6} y={yy + 3} className="ytick" textAnchor="end">
              {formatY(t)}
            </text>
          </g>
        );
      })}
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="3" fill={color} />
      ))}
      {xticks.map((i) => (
        <text key={i} x={x(i)} y={H - 8} className="xtick" textAnchor="middle">
          {points[i]?.label}
        </text>
      ))}
    </svg>
  );
}

/** bars: [{ label, value, hi }]  hi=highlight */
export function BarChart({ bars, height = 190, color = '#5dade2', formatY = (v) => v }) {
  const W = 640;
  const H = height;
  if (!bars || bars.length === 0) return <p className="muted">Pas de données.</p>;

  const maxY = Math.max(...bars.map((b) => b.value), 1);
  const innerW = W - PAD.l - PAD.r;
  const bw = innerW / bars.length;
  const y = (v) => scale(v, 0, maxY, H - PAD.b, PAD.t);
  const ticks = [0, maxY / 2, maxY];
  const showEvery = Math.ceil(bars.length / 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.l} y1={y(t)} x2={W - PAD.r} y2={y(t)} className="grid" />
          <text x={PAD.l - 6} y={y(t) + 3} className="ytick" textAnchor="end">
            {formatY(t)}
          </text>
        </g>
      ))}
      {bars.map((b, i) => {
        const bx = PAD.l + i * bw + bw * 0.15;
        const yy = y(b.value);
        return (
          <g key={i}>
            <rect x={bx} y={yy} width={bw * 0.7} height={H - PAD.b - yy} rx="2" fill={b.hi ? '#fc4c02' : color} />
            {i % showEvery === 0 && (
              <text x={bx + bw * 0.35} y={H - 8} className="xtick" textAnchor="middle">
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
