import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import { config, geminiConfigured } from './config.js';
import { gatherData, buildContext, SYSTEM_RULES } from './services/coach.js';

// Live model id changes over time / by access. Overridable via env so you can
// swap to a native-audio model (nicer voice) without a code change.
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-live-001';

const VOICE_INSTRUCTION =
  "Tu réponds À L'ORAL, en français, de façon naturelle, chaleureuse et CONCISE (1 à 3 phrases). " +
  "Pas de listes ni de markdown — c'est une conversation parlée. Appuie-toi sur les données ci-dessous.";

const send = (ws, obj) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
};

/** Attach the Gemini Live voice relay at ws://<host>/api/live. */
export function attachLive(server) {
  const wss = new WebSocketServer({ server, path: '/api/live' });

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
      const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

      session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { languageCode: 'fr-FR' },
        },
        callbacks: {
          onopen: () => send(ws, { type: 'status', status: 'live' }),
          onmessage: (msg) => relay(ws, msg),
          onerror: (e) => send(ws, { type: 'error', message: `Gemini Live: ${e?.message || e}` }),
          onclose: () => {
            if (!closed) try { ws.close(); } catch { /* ignore */ }
          },
        },
      });
    } catch (e) {
      send(ws, {
        type: 'error',
        message: `Connexion Gemini Live échouée (${e.message}). Le modèle « ${LIVE_MODEL} » n'est peut-être pas disponible sur ta clé/région — essaie un autre via GEMINI_LIVE_MODEL.`,
      });
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
