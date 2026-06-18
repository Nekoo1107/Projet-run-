import { useEffect, useRef, useState } from 'react';
import { streamChat, getChatHealth } from '../api.js';

const SUGGESTIONS = [
  'Est-ce que je progresse ?',
  'Pourquoi ma FC a dérivé sur mon dernier run ?',
  'Je me sens cramé, je fais quoi cette semaine ?',
  'Mon allure à FC égale s’améliore-t-elle ?',
];

export default function ChatView() {
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [configured, setConfigured] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    getChatHealth()
      .then((h) => setConfigured(h.configured))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, busy]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setError(null);
    setInput('');
    const history = [...messages, { role: 'user', content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    try {
      await streamChat(history, (delta) => {
        setMessages((prev) => {
          const next = prev.slice();
          next[next.length - 1] = {
            role: 'assistant',
            content: next[next.length - 1].content + delta,
          };
          return next;
        });
      });
    } catch (e) {
      setError(e.message);
      // drop the empty assistant placeholder on hard failure
      setMessages((prev) =>
        prev[prev.length - 1]?.role === 'assistant' && !prev[prev.length - 1].content
          ? prev.slice(0, -1)
          : prev
      );
    } finally {
      setBusy(false);
    }
  }

  if (configured === false) {
    return (
      <div className="card empty">
        <h2>Coach IA non configuré</h2>
        <p className="muted">
          Ajoute ta clé <code>ANTHROPIC_API_KEY</code> dans <code>server/.env</code> puis relance le
          backend. Le coach répond ensuite avec ton plan, tes runs et tes tendances en contexte.
        </p>
      </div>
    );
  }

  return (
    <section className="chat">
      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-welcome">
            <p className="muted">
              Pose une question sur ton entraînement. Je réponds avec <strong>tes</strong> données
              (plan, runs Strava, tendances).
            </p>
            <div className="chat-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="pill-btn" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content || (busy && i === messages.length - 1 ? <span className="dots">…</span> : '')}
          </div>
        ))}
        {error && <p className="warn-text">Erreur : {error}</p>}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          type="text"
          placeholder="Demande à ton coach…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button className="btn strava" type="submit" disabled={busy || !input.trim()}>
          {busy ? '…' : 'Envoyer'}
        </button>
      </form>
    </section>
  );
}
