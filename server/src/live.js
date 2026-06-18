import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import { config, geminiConfigured } from './config.js';
import { gatherData, buildContext, SYSTEM_RULES } from './services/coach.js';

// Live model availability varies by key/region, and ids change over time.
// We try several (best/most natural voice first) and keep the first that
// connects. Override the whole list with GEMINI_LIVE_MODEL (comma-separated).
const MODELS = (process.env.GEMINI_LIVE_MODEL
  ? process.env.GEMINI_LIVE_MODEL.split(',')
  : [
      'gemini-2.5-flash-preview-native-audio-dialog', // native audio = voix la plus naturelle
      'gemini-2.5-flash-native-audio-preview-09-2025',
      'gemini-live-2.5-flash-preview',
      'gemini-2.0-flash-live-001',
    ]
).map((s) => s.trim()).filter(Boolean);

// API version also varies; try the configured one (or both common ones).
const API_VERSIONS = process.env.GEMINI_API_VERSION ? [process.env.GEMINI_API_VERSION] : ['v1beta', 'v1alpha'];

const VOICE_INSTRUCTION =
  "Tu réponds À L'ORAL, en français, de façon naturelle, chaleureuse et CONCISE (1 à 3 phrases). " +
  "Pas de listes ni de markdown — c'est une conversation parlée. Appuie-toi sur les données ci-dessous.";

const send = (ws, obj) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
};

/** Attach the Gemini Live voice relay at ws://<host>/api/live. */
export function attachLive(server) {
  const wss = new WebSocketServer({ server, path: '/api/live' });
  // Avoid an unhandled 'error' re-emit when the shared HTTP server fails to bind.
  wss.on('error', (e) => console.error('[live] WS server:', e?.message || e));

  wss.on('connection', async (ws) => {
    if (!geminiConfigured()) {
      send(ws, { type: 'error', message: 'Live nécessite GEMINI_API_KEY (gratuit, AI Studio).' });
      ws.close();
      return;
    }

    let session = null;
    let closed = false;
    ws.on('close', () => {
      closed = true;
      try {
        session?.close();
      } catch {
        /* ignore */
      }
    });

    try {
      send(ws, { type: 'status', status: 'connecting' });
      const data = await gatherData();
      const systemInstruction = `${SYSTEM_RULES}\n\n${VOICE_INSTRUCTION}\n\n===== DONNÉES DE L'UTILISATEUR =====\n${buildContext(data)}`;
      const AUDIO = Modality?.AUDIO ?? 'AUDIO';
      const liveConfig = { responseModalities: [AUDIO], systemInstruction }; // minimal = max compat

      // A bad model resolves connect() then closes instantly ("not found ...").
      // So we only ACCEPT a model that stays open ~1.3 s; otherwise move on.
      const connectStable = (ai, model) =>
        new Promise((resolve, reject) => {
          let settled = false;
          let committed = false;
          let sess = null;
          const fail = (msg) => {
            if (settled) return;
            settled = true;
            try { sess?.close(); } catch { /* ignore */ }
            reject(new Error(msg));
          };
          const cb = {
            onopen: () => {},
            onmessage: (msg) => { if (committed) relay(ws, msg); },
            onerror: (e) => {
              if (!settled) fail(e?.message || 'erreur');
              else send(ws, { type: 'error', message: `Gemini Live: ${e?.message || e}` });
            },
            onclose: (e) => {
              const reason = e?.reason || e?.message || `code ${e?.code}`;
              if (!settled) fail(reason);
              else {
                console.log(`[live] session fermee. code=${e?.code ?? '?'} reason="${reason}"`);
                send(ws, { type: 'closed', code: e?.code, reason });
                if (!closed) try { ws.close(); } catch { /* ignore */ }
              }
            },
          };
          ai.live
            .connect({ model, config: liveConfig, callbacks: cb })
            .then((s) => {
              sess = s;
              session = s; // expose for inbound audio + cleanup
              setTimeout(() => {
                if (settled) return;
                settled = true;
                committed = true;
                resolve();
              }, 1300);
            })
            .catch((e) => fail(e?.message || String(e)));
        });

      let chosen = null;
      let lastDetail = '';
      for (const apiVersion of API_VERSIONS) {
        const ai = new GoogleGenAI({ apiKey: config.geminiApiKey, httpOptions: { apiVersion } });
        for (const model of MODELS) {
          if (closed) return;
          try {
            console.log(`[live] essai ${model} (${apiVersion})…`);
            await connectStable(ai, model);
            chosen = `${model} (${apiVersion})`;
            break;
          } catch (e) {
            lastDetail = `${model}/${apiVersion} → ${(e?.message || e).toString().slice(0, 120)}`;
            console.error(`[live] ✗ ${lastDetail}`);
            session = null;
          }
        }
        if (chosen) break;
      }

      if (!chosen) {
        send(ws, {
          type: 'error',
          message: `Aucun modèle Live n'a tenu la connexion. Dernier détail : ${lastDetail || 'inconnu'}.`,
        });
        try { ws.close(); } catch { /* ignore */ }
        return;
      }

      console.log(`[live] connecté ✓ via ${chosen}`);
      send(ws, { type: 'status', status: 'live' });
    } catch (e) {
      console.error('[live] connexion ECHOUEE:', e?.message || e);
      send(ws, { type: 'error', message: `Connexion Gemini Live échouée : ${e.message}` });
      try { ws.close(); } catch { /* ignore */ }
      return;
    }

    // Browser → Gemini : 16 kHz PCM16 audio chunks (base64).
    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.type === 'audio' && session) {
        try {
          session.sendRealtimeInput({ audio: { data: m.data, mimeType: 'audio/pcm;rate=16000' } });
        } catch {
          /* ignore transient send errors */
        }
      }
    });
  });

  console.log('[live] WebSocket relay prêt sur /api/live');
}

// Gemini → browser. Forward audio once (avoid duplicating data + parts), plus transcripts.
function relay(ws, msg) {
  try {
    const sc = msg.serverContent;
    let audioSent = false;

    const parts = sc?.modelTurn?.parts || [];
    for (const p of parts) {
      const d = p?.inlineData?.data;
      if (d) {
        send(ws, { type: 'audio', data: d });
        audioSent = true;
      }
    }
    if (!audioSent && typeof msg.data === 'string' && msg.data) {
      send(ws, { type: 'audio', data: msg.data });
    }

    if (sc?.outputTranscription?.text) send(ws, { type: 'text', who: 'coach', text: sc.outputTranscription.text });
    if (sc?.inputTranscription?.text) send(ws, { type: 'text', who: 'you', text: sc.inputTranscription.text });
    if (sc?.interrupted) send(ws, { type: 'interrupted' });
    if (sc?.turnComplete) send(ws, { type: 'turn_complete' });
  } catch {
    /* ignore malformed messages */
  }
}
