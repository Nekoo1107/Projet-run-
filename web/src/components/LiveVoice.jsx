import { useCallback, useEffect, useRef, useState } from 'react';
import JarvisOrb from './JarvisOrb.jsx';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const WS_URL = `${API.replace(/^http/, 'ws')}/api/live`;

function abToB64(ab) {
  let bin = '';
  const bytes = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToFloat32(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
  return f32;
}

export default function LiveVoice() {
  const [status, setStatus] = useState('idle'); // idle | connecting | live | error
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [log, setLog] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const ref = useRef({});

  const addLog = (s) => setLog((l) => [...l.slice(-12), `${new Date().toLocaleTimeString('fr-FR')} ${s}`]);

  function pushText(who, text) {
    setTranscript((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last && last.who === who) last.text += text;
      else next.push({ who, text });
      return next.slice(-12);
    });
  }

  // Real audio amplitude (0..1) from the coach's output + your mic.
  const getLevel = useCallback(() => {
    const st = ref.current;
    let out = 0;
    if (st.outAnalyser && st.outBuf) {
      st.outAnalyser.getByteTimeDomainData(st.outBuf);
      let sum = 0;
      for (let i = 0; i < st.outBuf.length; i++) {
        const v = (st.outBuf[i] - 128) / 128;
        sum += v * v;
      }
      out = Math.sqrt(sum / st.outBuf.length) * 1.9;
    }
    st.inLevel = (st.inLevel || 0) * 0.85;
    return Math.min(1, Math.max(out, st.inLevel));
  }, []);

  // Throttled "coach is speaking" detection for orb colour.
  useEffect(() => {
    const id = setInterval(() => setSpeaking((ref.current.lastAudio || 0) > Date.now() - 280), 140);
    return () => clearInterval(id);
  }, []);

  function teardown() {
    const st = ref.current;
    try { st.proc?.disconnect(); st.source?.disconnect(); st.silent?.disconnect(); } catch { /* */ }
    try { st.stream?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
    try { if (st.ws) { st.ws.onclose = null; st.ws.close(); } } catch { /* */ }
    try { st.inputCtx?.close(); } catch { /* */ }
    try { st.outputCtx?.close(); } catch { /* */ }
    clearTimeout(st.timer);
  }

  function fail(message) {
    ref.current.errored = true;
    addLog(`échec: ${String(message).slice(0, 80)}`);
    setError((prev) => prev || message);
    setStatus('error');
    teardown();
  }

  function stop() {
    teardown();
    const errored = ref.current.errored;
    ref.current = {};
    setStatus(errored ? 'error' : 'idle');
  }

  async function start() {
    setError(null);
    setTranscript([]);
    setLog([]);
    setStatus('connecting');
    ref.current = { errored: false, live: false, nextTime: 0, sources: [] };
    addLog('micro…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      addLog('micro OK');
      const AC = window.AudioContext || window.webkitAudioContext;
      const inputCtx = new AC({ sampleRate: 16000 });
      const outputCtx = new AC({ sampleRate: 24000 });
      const outAnalyser = outputCtx.createAnalyser();
      outAnalyser.fftSize = 256;
      outAnalyser.connect(outputCtx.destination);
      addLog(`WS → ${WS_URL}`);
      const ws = new WebSocket(WS_URL);
      Object.assign(ref.current, {
        stream,
        inputCtx,
        outputCtx,
        outAnalyser,
        outBuf: new Uint8Array(outAnalyser.frequencyBinCount),
        ws,
      });

      ref.current.timer = setTimeout(() => {
        if (!ref.current.live && !ref.current.errored)
          fail('Pas de réponse du serveur vocal en 12 s. Vérifie le backend et GEMINI_API_KEY.');
      }, 12000);

      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type !== 'audio') addLog(`serveur: ${m.type}${m.status ? ' ' + m.status : ''}${m.reason ? ' « ' + m.reason + ' »' : ''}`);
        if (m.type === 'status') {
          if (m.status === 'live') { ref.current.live = true; clearTimeout(ref.current.timer); setStatus('live'); }
        } else if (m.type === 'error') {
          fail(m.message);
        } else if (m.type === 'closed') {
          if (!ref.current.live) fail(`Session fermée${m.reason ? ` (${m.reason})` : ''}.`);
        } else if (m.type === 'audio') {
          playChunk(m.data);
        } else if (m.type === 'text') {
          pushText(m.who, m.text);
        } else if (m.type === 'interrupted') {
          flushPlayback();
        }
      };
      ws.onerror = () => { addLog('WS erreur'); fail('Connexion au serveur vocal impossible (backend lancé ?).'); };
      ws.onclose = (e) => {
        addLog(`WS fermé (code ${e?.code ?? '?'})`);
        if (!ref.current.errored) setStatus(ref.current.live ? 'idle' : 'error');
        if (!ref.current.errored && !ref.current.live) setError((p) => p || 'Connexion vocale fermée avant le démarrage.');
      };

      ws.onopen = () => {
        addLog('WS ouvert');
        const source = inputCtx.createMediaStreamSource(stream);
        const proc = inputCtx.createScriptProcessor(4096, 1, 1);
        const silent = inputCtx.createGain();
        silent.gain.value = 0;
        proc.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const f32 = e.inputBuffer.getChannelData(0);
          let sum = 0;
          const i16 = new Int16Array(f32.length);
          for (let i = 0; i < f32.length; i++) {
            const s = Math.max(-1, Math.min(1, f32[i]));
            sum += s * s;
            i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          ref.current.inLevel = Math.min(1, Math.sqrt(sum / f32.length) * 2.4);
          ws.send(JSON.stringify({ type: 'audio', data: abToB64(i16.buffer) }));
        };
        source.connect(proc);
        proc.connect(silent);
        silent.connect(inputCtx.destination);
        Object.assign(ref.current, { proc, source, silent });
      };
    } catch (e) {
      fail(e.name === 'NotAllowedError' ? 'Micro refusé. Autorise le micro (icône à gauche de la barre d’adresse).' : e.message);
    }
  }

  function playChunk(b64) {
    const st = ref.current;
    if (!st.outputCtx) return;
    const f32 = b64ToFloat32(b64);
    if (!f32.length) return;
    st.lastAudio = Date.now();
    const buf = st.outputCtx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = st.outputCtx.createBufferSource();
    src.buffer = buf;
    src.connect(st.outAnalyser || st.outputCtx.destination);
    const t = Math.max(st.outputCtx.currentTime, st.nextTime || 0);
    src.start(t);
    st.nextTime = t + buf.duration;
    (st.sources ||= []).push(src);
    src.onended = () => { st.sources = (st.sources || []).filter((s) => s !== src); };
  }

  function flushPlayback() {
    const st = ref.current;
    (st.sources || []).forEach((s) => { try { s.stop(); } catch { /* */ } });
    st.sources = [];
    st.nextTime = 0;
  }

  useEffect(() => () => teardown(), []);

  const live = status === 'live';
  const orbMode =
    status === 'error' ? 'error' : status === 'connecting' ? 'thinking' : live ? (speaking ? 'speaking' : 'listening') : 'idle';
  const label =
    status === 'connecting' ? 'Connexion…' : live ? (speaking ? 'Jarvis parle…' : 'À l’écoute — parle !') : status === 'error' ? 'Échec' : 'Touche l’orbe pour parler';

  return (
    <div className="live">
      <div className="orb-stage">
        <JarvisOrb getLevel={live ? getLevel : undefined} mode={orbMode} onClick={live || status === 'connecting' ? stop : start} />
        <p className="orb-label">{label}</p>
        {error && <p className="warn-text small orb-error">{error}</p>}
      </div>

      {transcript.length > 0 && (
        <div className="live-transcript">
          {transcript.map((t, i) => (
            <div key={i} className={`bubble ${t.who === 'you' ? 'user' : 'assistant'}`}>{t.text}</div>
          ))}
        </div>
      )}

      {log.length > 0 && status !== 'live' && (
        <details className="live-debug">
          <summary>journal technique</summary>
          <div className="live-log">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
        </details>
      )}
    </div>
  );
}
