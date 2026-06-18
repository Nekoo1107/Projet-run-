import { useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const WS_URL = `${API.replace(/^http/, 'ws')}/api/live`;

// --- base64 <-> PCM helpers ---
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
  const [transcript, setTranscript] = useState([]); // {who, text}
  const ref = useRef({});

  function pushText(who, text) {
    setTranscript((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last && last.who === who) last.text += text;
      else next.push({ who, text });
      return next.slice(-12);
    });
  }

  async function start() {
    setError(null);
    setTranscript([]);
    setStatus('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      const ws = new WebSocket(WS_URL);
      const st = { stream, inputCtx, outputCtx, ws, nextTime: 0, sources: [] };
      ref.current = st;

      ws.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.type === 'status') setStatus(m.status === 'live' ? 'live' : 'connecting');
        else if (m.type === 'error') {
          setError(m.message);
          setStatus('error');
          stop();
        } else if (m.type === 'audio') playChunk(m.data);
        else if (m.type === 'text') pushText(m.who, m.text);
        else if (m.type === 'interrupted') flushPlayback();
      };
      ws.onclose = () => setStatus((s) => (s === 'error' ? s : 'idle'));
      ws.onerror = () => {
        setError('Connexion au serveur vocal impossible (backend lancé ? /api/live).');
        setStatus('error');
      };

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const proc = inputCtx.createScriptProcessor(4096, 1, 1);
        const silent = inputCtx.createGain();
        silent.gain.value = 0; // keep the processor alive without echoing the mic
        proc.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const f32 = e.inputBuffer.getChannelData(0);
          const i16 = new Int16Array(f32.length);
          for (let i = 0; i < f32.length; i++) {
            const s = Math.max(-1, Math.min(1, f32[i]));
            i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          ws.send(JSON.stringify({ type: 'audio', data: abToB64(i16.buffer) }));
        };
        source.connect(proc);
        proc.connect(silent);
        silent.connect(inputCtx.destination);
        st.proc = proc;
        st.source = source;
      };
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Micro refusé. Autorise le micro dans le navigateur.' : e.message);
      setStatus('error');
    }
  }

  function playChunk(b64) {
    const st = ref.current;
    if (!st.outputCtx) return;
    const f32 = b64ToFloat32(b64);
    if (!f32.length) return;
    const buf = st.outputCtx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = st.outputCtx.createBufferSource();
    src.buffer = buf;
    src.connect(st.outputCtx.destination);
    const t = Math.max(st.outputCtx.currentTime, st.nextTime);
    src.start(t);
    st.nextTime = t + buf.duration;
    st.sources.push(src);
    src.onended = () => {
      st.sources = st.sources.filter((s) => s !== src);
    };
  }

  function flushPlayback() {
    const st = ref.current;
    (st.sources || []).forEach((s) => {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    });
    st.sources = [];
    st.nextTime = 0;
  }

  function stop() {
    const st = ref.current;
    try {
      st.proc?.disconnect();
      st.source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      st.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    try {
      st.ws?.close();
    } catch {
      /* ignore */
    }
    try {
      st.inputCtx?.close();
      st.outputCtx?.close();
    } catch {
      /* ignore */
    }
    ref.current = {};
    setStatus((s) => (s === 'error' ? s : 'idle'));
  }

  useEffect(() => () => stop(), []); // cleanup on unmount

  const live = status === 'live';
  return (
    <div className="live">
      <div className="live-center">
        <button
          className={`mic-btn ${live ? 'on' : ''}`}
          onClick={live || status === 'connecting' ? stop : start}
          disabled={status === 'connecting'}
        >
          {status === 'connecting' ? '…' : live ? '⏹' : '🎙'}
        </button>
        <p className="live-status">
          {status === 'idle' && 'Appuie pour parler à ton coach'}
          {status === 'connecting' && 'Connexion…'}
          {live && 'À l’écoute — parle !'}
          {status === 'error' && 'Erreur'}
        </p>
        {error && <p className="warn-text small">{error}</p>}
      </div>

      {transcript.length > 0 && (
        <div className="live-transcript">
          {transcript.map((t, i) => (
            <div key={i} className={`bubble ${t.who === 'you' ? 'user' : 'assistant'}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}

      <p className="muted small live-note">
        Voix temps réel via Gemini Live. Marche le mieux sur <strong>Chrome</strong> ; autorise le micro.
        Nécessite <code>GEMINI_API_KEY</code> côté serveur.
      </p>
    </div>
  );
}
