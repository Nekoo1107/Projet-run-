import { useEffect, useRef, useState } from 'react';
import { streamChat } from '../api.js';

const SR =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const TTS = typeof window !== 'undefined' ? window.speechSynthesis : null;

function pickFrVoice() {
  const voices = TTS?.getVoices() || [];
  // Prefer a natural-sounding French voice, then any French voice.
  return (
    voices.find((v) => /fr[-_]?FR/i.test(v.lang) && /google|amélie|amelie|thomas|audrey/i.test(v.name)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('fr')) ||
    null
  );
}

function firstSentenceEnd(s) {
  const m = s.match(/[.!?…\n]/);
  return m ? m.index : -1;
}

export default function VoiceCoach() {
  const supported = Boolean(SR && TTS);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const voiceRef = useRef(null);

  useEffect(() => {
    if (!TTS) return;
    const load = () => {
      voiceRef.current = pickFrVoice();
    };
    load();
    TTS.onvoiceschanged = load;
    return () => {
      try {
        TTS.cancel();
      } catch {
        /* */
      }
    };
  }, []);

  function speak(text) {
    const t = text.trim();
    if (!t || !TTS) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'fr-FR';
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 1.04;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(!TTS || TTS.speaking);
    TTS.speak(u);
  }

  async function ask(text) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    const history = [...messages, { role: 'user', content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setBusy(true);

    let buffer = '';
    const flush = (force) => {
      let idx;
      while ((idx = firstSentenceEnd(buffer)) >= 0) {
        const sentence = buffer.slice(0, idx + 1);
        buffer = buffer.slice(idx + 1);
        speak(sentence);
      }
      if (force && buffer.trim()) {
        speak(buffer);
        buffer = '';
      }
    };

    try {
      await streamChat(history, (delta) => {
        buffer += delta;
        setMessages((prev) => {
          const n = prev.slice();
          n[n.length - 1] = { role: 'assistant', content: n[n.length - 1].content + delta };
          return n;
        });
        flush(false); // speak sentence-by-sentence as it streams (Jarvis talks while thinking)
      });
      flush(true);
    } catch (e) {
      setError(e.message);
      setMessages((prev) =>
        prev[prev.length - 1]?.role === 'assistant' && !prev[prev.length - 1].content ? prev.slice(0, -1) : prev
      );
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    if (!SR) return;
    try {
      TTS?.cancel(); // barge-in: stop talking when you start talking
    } catch {
      /* */
    }
    setSpeaking(false);
    setError(null);
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setListening(false);
      ask(t);
    };
    rec.onerror = (e) => {
      setError(
        e.error === 'not-allowed'
          ? 'Micro refusé — autorise-le (icône à gauche de la barre d’adresse).'
          : `Reco vocale: ${e.error}`
      );
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stopAll() {
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    try {
      TTS?.cancel();
    } catch {
      /* */
    }
    setListening(false);
    setSpeaking(false);
  }

  if (!supported) {
    return (
      <div className="card empty">
        <h2>Voix non supportée par ce navigateur</h2>
        <p className="muted">
          La reconnaissance vocale n’est dispo que sur <strong>Chrome</strong> (desktop). Ouvre l’app
          dans Chrome, ou utilise le mode <strong>Texte</strong>.
        </p>
      </div>
    );
  }

  const status = listening ? 'À l’écoute — parle !' : busy ? 'Le coach réfléchit…' : speaking ? 'Le coach parle…' : 'Appuie et pose ta question';

  return (
    <div className="live">
      <div className="live-center">
        <button
          className={`mic-btn ${listening ? 'on' : ''}`}
          onClick={listening ? stopAll : startListening}
          disabled={busy && !listening}
          title={listening ? 'Stop' : 'Parler'}
        >
          {listening ? '⏹' : '🎙'}
        </button>
        <p className="live-status">{status}</p>
        {(speaking || busy) && !listening && (
          <button className="btn ghost" onClick={stopAll}>
            Couper la voix
          </button>
        )}
        {error && <p className="warn-text small">{error}</p>}
      </div>

      {messages.length > 0 && (
        <div className="live-transcript">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
              {m.content || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
          ))}
        </div>
      )}

      <p className="muted small live-note">
        Voix du navigateur (fiable, gratuite) — micro pour parler, le coach répond à l’oral avec tes
        données. Idéal sur Chrome.
      </p>
    </div>
  );
}
