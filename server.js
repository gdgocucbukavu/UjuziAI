import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[SERVER] Starting UjuziAI Server...');

// Initialize Firebase Admin
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'gdg-ucb-bwai',
    });
    console.log('[SERVER] Firebase Admin initialized for project: gdg-ucb-bwai');
  }
} catch (error) {
  console.error('[SERVER] Firebase Admin Init Error:', error);
}

const db = admin.firestore();
const auth = admin.auth();

// Robust Agent Loading using require (CommonJS)
let orchestrator;
try {
  const { QuestionGeneratorAgent } = require('./functions/src/agents/questionGenerator.js');
  const { EvaluationAgent } = require('./functions/src/agents/evaluation.js');
  const { AntiHallucinationAgent } = require('./functions/src/agents/antiHallucination.js');
  const { RankingAgent } = require('./functions/src/agents/ranking.js');
  const { AgentOrchestrator } = require('./functions/src/agents/orchestrator.js');

  orchestrator = new AgentOrchestrator({
    questionGenerator: new QuestionGeneratorAgent(),
    evaluation: new EvaluationAgent(),
    antiHallucination: new AntiHallucinationAgent(),
    ranking: new RankingAgent(),
  });
  console.log('[SERVER] Agents Orchestrator initialized successfully');
} catch (error) {
  console.error('[SERVER] Failed to initialize Agents:', error);
}

const app = express();
app.use(cors());
app.use(express.json());

// Health Check for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Middleware to verify Firebase Auth Token
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('[AUTH] Token Verification Error:', error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ============================================
// API ROUTES
// ============================================

app.post('/api/generateExamQuestions', authenticate, async (req, res) => {
  try {
    const { moduleId } = req.body;
    const userId = req.user.uid;

    if (!orchestrator) throw new Error('Orchestrator not initialized');

    const progressRef = db.collection('users').doc(userId).collection('progress').doc(moduleId);
    const progressSnap = await progressRef.get();

    if (!progressSnap.exists) {
      return res.status(400).json({ error: 'No submission found' });
    }

    const progress = progressSnap.data();
    if (!progress.submitted) return res.status(400).json({ error: 'Must submit proof first' });
    if (progress.examLocked) return res.status(403).json({ error: 'Exam is locked' });
    if (progress.examAttempts >= 2) return res.status(403).json({ error: 'Maximum attempts reached' });

    const userContext = await orchestrator.getUserContext(userId, moduleId);
    const questions = await orchestrator.generateQuestions(moduleId, userContext);

    res.json({ data: { questions } });
  } catch (error) {
    console.error('[API] generateExamQuestions error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/submitExam', authenticate, async (req, res) => {
  try {
    const { examId, moduleId } = req.body;
    const userId = req.user.uid;

    if (!orchestrator) throw new Error('Orchestrator not initialized');

    const examRef = db.collection('exams').doc(examId);
    const examSnap = await examRef.get();

    if (!examSnap.exists) return res.status(404).json({ error: 'Exam not found' });
    if (examSnap.data().userId !== userId) return res.status(403).json({ error: 'Not your exam' });

    const result = await orchestrator.evaluateExam(examId, moduleId, userId, examSnap.data());
    res.json({ data: result });
  } catch (error) {
    console.error('[API] submitExam error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/validateSubmission', authenticate, async (req, res) => {
  try {
    const adminDoc = await db.collection('users').doc(req.user.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId, moduleId, approved } = req.body;
    const progressRef = db.collection('users').doc(userId).collection('progress').doc(moduleId);
    await progressRef.update({
      validated: approved,
      examUnlocked: approved,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: req.user.uid,
    });

    res.json({ data: { success: true } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/verifyBadge', async (req, res) => {
  try {
    const { badgeId } = req.body;
    if (!badgeId) return res.status(400).json({ error: 'Badge ID required' });

    const badgeQuery = await db.collectionGroup('progress').where('badgeId', '==', badgeId).limit(1).get();
    if (badgeQuery.empty) return res.json({ data: { valid: false } });

    const badgeData = badgeQuery.docs[0].data();
    const userDoc = await db.collection('users').doc(badgeData.userId || '').get();

    res.json({
      data: {
        valid: true,
        module: badgeData.moduleId,
        score: badgeData.examScore,
        userName: userDoc.exists ? userDoc.data().displayName : 'Unknown',
        issuedAt: badgeData.completedAt,
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Static files
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA Routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] UjuziAI active on port ${PORT}`);
});
