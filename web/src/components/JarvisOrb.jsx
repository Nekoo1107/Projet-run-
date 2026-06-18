import { useEffect, useRef } from 'react';

// Mode → colour palette (Jarvis HUD vibe).
const PALETTE = {
  idle: { core: '#22d3ee', glow: '34,211,238' },
  listening: { core: '#34d399', glow: '52,211,153' },
  speaking: { core: '#38bdf8', glow: '56,189,248' },
  thinking: { core: '#a78bfa', glow: '167,139,250' },
  error: { core: '#f87171', glow: '248,113,113' },
};

/**
 * Animated, audio-reactive orb.
 * @param {Function} [getLevel] returns current amplitude 0..1 (real audio). If
 *   omitted, the orb self-animates from `mode`.
 * @param {string} mode idle | listening | speaking | thinking | error
 * @param {Function} [onClick]
 */
export default function JarvisOrb({ getLevel, mode = 'idle', onClick }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ level: 0, mode });

  stateRef.current.mode = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const size = canvas.clientWidth;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const start = performance.now();
    const draw = (now) => {
      const t = now - start;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const m = stateRef.current.mode;
      const pal = PALETTE[m] || PALETTE.idle;

      // Target amplitude: real audio if available, else a breathing baseline.
      let target;
      if (getLevel) {
        const base = m === 'listening' ? 0.12 : m === 'speaking' ? 0.1 : 0.05;
        target = Math.min(1, Math.max(getLevel() || 0, base));
      } else {
        const breathe = (Math.sin(t / 900) + 1) / 2;
        const amp = m === 'speaking' ? 0.55 : m === 'listening' ? 0.4 : m === 'thinking' ? 0.3 : 0.18;
        target = 0.08 + breathe * amp + (m === 'speaking' ? Math.random() * 0.12 : 0);
      }
      // smooth
      stateRef.current.level += (target - stateRef.current.level) * 0.18;
      const lvl = stateRef.current.level;

      ctx.clearRect(0, 0, w, h);
      const unit = Math.min(w, h);
      const base = unit * 0.2;
      const r = base * (1 + lvl * 0.55);
      const g = (a) => `rgba(${pal.glow},${a})`;

      // outer glow
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 2.6);
      grd.addColorStop(0, g(0.5 + lvl * 0.4));
      grd.addColorStop(0.45, g(0.12));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, base * 2.6, 0, Math.PI * 2);
      ctx.fill();

      // reactive rings
      for (let i = 0; i < 3; i++) {
        const rr = r + base * (0.55 + i * 0.4) + Math.sin(t / 600 + i * 1.3) * (unit * 0.012) + lvl * base * 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = g(0.28 - i * 0.07);
        ctx.lineWidth = Math.max(1, unit * 0.006);
        ctx.stroke();
      }

      // rotating HUD arcs
      const arc = (radius, from, to, speed, dash, alpha) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((t / speed) % (Math.PI * 2));
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.arc(0, 0, radius, from, to);
        ctx.strokeStyle = g(alpha);
        ctx.lineWidth = Math.max(1, unit * 0.005);
        ctx.stroke();
        ctx.restore();
      };
      arc(base * 2.0, 0, Math.PI * 1.4, 2200, [unit * 0.02, unit * 0.03], 0.55);
      arc(base * 2.32, Math.PI * 0.2, Math.PI * 1.1, -2800, [unit * 0.008, unit * 0.04], 0.4);

      // core
      const coreGrd = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      coreGrd.addColorStop(0, '#ffffff');
      coreGrd.addColorStop(0.35, pal.core);
      coreGrd.addColorStop(1, g(0.65));
      ctx.fillStyle = coreGrd;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [getLevel]);

  return <canvas ref={canvasRef} className="orb" onClick={onClick} role="button" aria-label="orbe vocal" />;
}
