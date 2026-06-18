import { GoogleGenAI } from '@google/genai';
import { gatherData, buildContext, SYSTEM_RULES } from './coach.js';

// Gemini Flash: fast and free-tier-friendly. The exact model id can be bumped
// later; Flash is the right default for a personal coaching chat.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let ai = null;
function getAi() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

/**
 * Stream a coaching reply to `res` (text/plain) using Gemini.
 * Reuses the exact same data context + coaching rules as the Claude path.
 * @param {Array<{role:'user'|'assistant', content:string}>} messages
 */
export async function streamGeminiReply(messages, res) {
  const data = await gatherData();
  const system = `${SYSTEM_RULES}\n\n===== DONNÉES DE L'UTILISATEUR =====\n${buildContext(data)}`;

  // Gemini uses role "model" for assistant turns; system goes in systemInstruction.
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const stream = await getAi().models.generateContentStream({
    model: MODEL,
    contents,
    config: { systemInstruction: system },
  });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) res.write(text);
  }
}
