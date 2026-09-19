import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins
}));

app.use(express.json({ limit: '5mb' }));

// ─────────────────────────────────────────────
// IA : choix du fournisseur
// ─────────────────────────────────────────────

const aiProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const openaiModel = process.env.OPENAI_MODEL || 'gpt-5.5';

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ─────────────────────────────────────────────
// Supabase
// ─────────────────────────────────────────────

const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )
    : null;

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiProvider,
    aiConfigured:
      aiProvider === 'gemini'
        ? Boolean(gemini)
        : Boolean(openai),
    authConfigured: Boolean(supabaseAdmin),
    model:
      aiProvider === 'gemini'
        ? geminiModel
        : openaiModel
  });
});

// ─────────────────────────────────────────────
// Authentification
// ─────────────────────────────────────────────

async function requireUser(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(503).json({
      error: 'Supabase serveur non configuré.'
    });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: 'Connexion requise.'
    });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        error: 'Session invalide ou expirée.'
      });
    }

    req.user = data.user;
    next();
  } catch (error) {
    return res.status(401).json({
      error: error.message || 'Session invalide.'
    });
  }
}

// ─────────────────────────────────────────────
// Vérification IA
// ─────────────────────────────────────────────

function requireAI(res) {
  if (aiProvider === 'gemini' && !gemini) {
    res.status(503).json({
      error: 'GEMINI_API_KEY manquante dans server/.env'
    });
    return false;
  }

  if (aiProvider === 'openai' && !openai) {
    res.status(503).json({
      error: 'OPENAI_API_KEY manquante dans server/.env'
    });
    return false;
  }

  if (!['gemini', 'openai'].includes(aiProvider)) {
    res.status(500).json({
      error: `Fournisseur IA inconnu : ${aiProvider}. Utilise "gemini" ou "openai".`
    });
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────
// Flashcards
// ─────────────────────────────────────────────

app.post('/api/flashcards', requireUser, async (req, res) => {
  if (!requireAI(res)) return;

  const { title, text } = req.body || {};

  if (!text?.trim()) {
    return res.status(400).json({
      error: 'Cours vide.'
    });
  }

  const instructions = `
Tu es un professeur de CPGE scientifique français.

Transforme un cours en flashcards exigeantes mais précises.
Ne crée aucun fait absent du cours.

Retourne UNIQUEMENT un JSON valide sous la forme :
{
  "cards": [
    {
      "question": "...",
      "answer": "..."
    }
  ]
}

Génère 10 à 20 cartes selon la richesse du contenu.

Les questions doivent couvrir :
- définitions
- formules
- interprétation
- conditions d'application
- raisonnement

Le champ answer peut contenir du Markdown simple.
`;

  const input = `
Utilisateur connecté : ${req.user.id}

Titre du cours : ${title || 'Cours'}

COURS :
${text.slice(0, 60000)}
`;

  try {
    let raw;

    if (aiProvider === 'gemini') {
      const response = await gemini.models.generateContent({
        model: geminiModel,
        contents: input,
        config: {
          systemInstruction: instructions,
          responseMimeType: 'application/json'
        }
      });

      raw = response.text.trim();
    } else {
      const response = await openai.responses.create({
        model: openaiModel,
        instructions,
        input
      });

      raw = response.output_text.trim();
    }

    const parsed = JSON.parse(
      raw
        .replace(/^```json\s*/, '')
        .replace(/```$/, '')
        .trim()
    );

    if (!Array.isArray(parsed.cards)) {
      throw new Error('Format de réponse IA invalide.');
    }

    res.json(parsed);
  } catch (error) {
    console.error('Erreur flashcards:', error);

    res.status(500).json({
      error: error.message || 'Erreur lors de la génération.'
    });
  }
});

// ─────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────

app.post('/api/chat', requireUser, async (req, res) => {
  if (!requireAI(res)) return;

  const {
    question,
    courseText,
    history = []
  } = req.body || {};

  if (!question?.trim()) {
    return res.status(400).json({
      error: 'Question vide.'
    });
  }

  try {
    const historyText = history
      .map(m =>
        `${m.role === 'user' ? 'Élève' : 'Professeur'}: ${String(m.text || '')}`
      )
      .join('\n');

    const instructions = `
Tu es le professeur particulier d'un élève de CPGE scientifique.

Réponds en français.

Aide à comprendre plutôt qu'à donner immédiatement la solution quand
l'élève travaille un exercice.

Sois rigoureux sur :
- les unités
- les hypothèses
- les signes
- les conditions d'application

Si un cours est fourni, utilise-le comme source prioritaire et signale
clairement quand une information n'y figure pas.

Tu peux utiliser du Markdown et LaTeX.

COURS FOURNI :
${(courseText || '(aucun)').slice(0, 50000)}

HISTORIQUE :
${historyText.slice(-12000)}
`;

    let answer;

    if (aiProvider === 'gemini') {
      const response = await gemini.models.generateContent({
        model: geminiModel,
        contents: question,
        config: {
          systemInstruction: instructions
        }
      });

      answer = response.text;
    } else {
      const response = await openai.responses.create({
        model: openaiModel,
        instructions,
        input: question
      });

      answer = response.output_text;
    }

    res.json({
      answer
    });
  } catch (error) {
    console.error('Erreur chat:', error);

    res.status(500).json({
      error: error.message || 'Erreur IA.'
    });
  }
});

// ─────────────────────────────────────────────
// Frontend en production
// ─────────────────────────────────────────────

if (isProduction) {
  const dist = path.resolve(__dirname, '../client/dist');

  app.use(express.static(dist));

  app.get(/.*/, (_req, res) =>
    res.sendFile(path.join(dist, 'index.html'))
  );
}

// ─────────────────────────────────────────────
// Serveur
// ─────────────────────────────────────────────

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  console.log(
    `Jarvis server listening on port ${port} - AI: ${aiProvider}`
  );
});