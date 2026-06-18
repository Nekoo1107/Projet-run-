import { Router } from 'express';
import { chatProvider } from '../config.js';
import { streamCoachReply } from '../services/coach.js';
import { streamGeminiReply } from '../services/coachGemini.js';

const router = Router();

router.get('/health', (req, res) => {
  const provider = chatProvider();
  res.json({ configured: Boolean(provider), provider });
});

// POST /api/chat  body: { messages: [{role, content}, ...] }  → streams text/plain
router.post('/', async (req, res, next) => {
  const provider = chatProvider();
  if (!provider) {
    return res.status(503).json({ error: 'Aucune cle IA configuree (GEMINI_API_KEY ou ANTHROPIC_API_KEY dans server/.env)' });
  }
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages requis' });
  }
  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'le dernier message doit etre de l_utilisateur' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  try {
    await (provider === 'gemini' ? streamGeminiReply : streamCoachReply)(clean, res);
    res.end();
  } catch (err) {
    // If nothing streamed yet, surface a JSON error; otherwise close with a marker.
    if (!res.headersSent) return next(err);
    res.write(`\n\n[erreur: ${err.message}]`);
    res.end();
  }
});

export default router;
