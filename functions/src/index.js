const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// Import agents
const { QuestionGeneratorAgent } = require('./agents/questionGenerator');
const { EvaluationAgent } = require('./agents/evaluation');
const { AntiHallucinationAgent } = require('./agents/antiHallucination');
const { RankingAgent } = require('./agents/ranking');

// Import orchestrator
const { AgentOrchestrator } = require('./agents/orchestrator');

// Initialize orchestrator with all agents
const orchestrator = new AgentOrchestrator({
  questionGenerator: new QuestionGeneratorAgent(),
  evaluation: new EvaluationAgent(),
  antiHallucination: new AntiHallucinationAgent(),
  ranking: new RankingAgent(),
});

// ============================================
// EXAM FUNCTIONS
// ============================================

/**
 * Generate exam questions for a module
 * Uses ADK: Agent orchestration to coordinate question generation
 */
exports.generateExamQuestions = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { moduleId } = data;
  const userId = context.auth.uid;

  // Check eligibility
  const progressRef = db.collection('users').doc(userId).collection('progress').doc(moduleId);
  const progressSnap = await progressRef.get();

  if (!progressSnap.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'No submission found');
  }

  const progress = progressSnap.data();

  if (!progress.submitted) {
    throw new functions.https.HttpsError('failed-precondition', 'Must submit proof first');
  }

  if (progress.examLocked) {
    throw new functions.https.HttpsError('permission-denied', 'Exam is locked');
  }

  if (progress.examAttempts >= 2) {
    throw new functions.https.HttpsError('permission-denied', 'Maximum attempts reached');
  }

  // MCP: Retrieve user context for personalized questions
  const userContext = await orchestrator.getUserContext(userId, moduleId);

  // ADK: Orchestrate question generation
  const questions = await orchestrator.generateQuestions(moduleId, userContext);

  return { questions };
});

/**
 * Submit exam and evaluate answers
 * Uses A2A: Inter-agent communication for evaluation pipeline
 */
exports.submitExam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { examId, moduleId } = data;
  const userId = context.auth.uid;

  // Fetch exam data
  const examRef = db.collection('exams').doc(examId);
  const examSnap = await examRef.get();

  if (!examSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Exam not found');
  }

  const examData = examSnap.data();

  if (examData.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your exam');
  }

  // A2A Pipeline: Evaluation → Anti-Hallucination → Ranking
  const result = await orchestrator.evaluateExam(examId, moduleId, userId, examData);

  return result;
});

/**
 * Validate a submission (admin only)
 */
exports.validateSubmission = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Verify admin role
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { userId, moduleId, approved } = data;

  const progressRef = db.collection('users').doc(userId).collection('progress').doc(moduleId);
  await progressRef.update({
    validated: approved,
    examUnlocked: approved,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewedBy: context.auth.uid,
  });

  return { success: true };
});

/**
 * Verify a badge ID
 */
exports.verifyBadge = functions.https.onCall(async (data, context) => {
  const { badgeId } = data;

  if (!badgeId) {
    throw new functions.https.HttpsError('invalid-argument', 'Badge ID required');
  }

  const badgeQuery = await db.collectionGroup('progress')
    .where('badgeId', '==', badgeId)
    .limit(1)
    .get();

  if (badgeQuery.empty) {
    return { valid: false };
  }

  const badgeData = badgeQuery.docs[0].data();
  const userDoc = await db.collection('users').doc(badgeData.userId || '').get();

  return {
    valid: true,
    module: badgeData.moduleId,
    score: badgeData.examScore,
    userName: userDoc.exists ? userDoc.data().displayName : 'Unknown',
    issuedAt: badgeData.completedAt,
  };
});

// ============================================
// FIRESTORE TRIGGERS
// ============================================

/**
 * When an exam is completed, trigger the evaluation pipeline
 */
exports.onExamCompleted = functions.firestore
  .document('exams/{examId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only trigger when status changes to 'completed'
    if (before.status !== 'completed' && after.status === 'completed') {
      const examId = context.params.examId;

      try {
        await orchestrator.evaluateExam(
          examId,
          after.moduleId,
          after.userId,
          after
        );
      } catch (error) {
        console.error('Evaluation pipeline error:', error);
      }
    }
  });

/**
 * Update leaderboard when user score changes
 */
exports.onUserScoreUpdate = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.totalScore !== after.totalScore) {
      await orchestrator.agents.ranking.updateLeaderboard();
    }
  });

/**
 * Keep user communityPoints synchronized from buildathon project interactions.
 * Formula: votes * 10 + likes for each owned project.
 */
exports.onBuildathonProjectCommunityScoreUpdate = functions.firestore
  .document('buildathonProjects/{projectId}')
  .onWrite(async (change) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

    const getProjectCommunityScore = (data) => {
      if (!data) return 0;
      const voteCount = Number.isFinite(Number(data.voteCount))
        ? Number(data.voteCount)
        : (Array.isArray(data.votes) ? data.votes.length : 0);
      const likesCount = Number.isFinite(Number(data.likesCount))
        ? Number(data.likesCount)
        : (Array.isArray(data.likeUserIds) ? data.likeUserIds.length : 0);
      return (voteCount * 10) + likesCount;
    };

    const beforeOwner = before?.submittedBy || null;
    const afterOwner = after?.submittedBy || null;
    const beforeScore = getProjectCommunityScore(before);
    const afterScore = getProjectCommunityScore(after);

    const updates = [];

    if (beforeOwner && beforeOwner === afterOwner) {
      const delta = afterScore - beforeScore;
      if (delta !== 0) {
        updates.push(
          db.collection('users').doc(beforeOwner).set(
            { communityPoints: admin.firestore.FieldValue.increment(delta), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          )
        );
      }
    } else {
      if (beforeOwner && beforeScore !== 0) {
        updates.push(
          db.collection('users').doc(beforeOwner).set(
            { communityPoints: admin.firestore.FieldValue.increment(-beforeScore), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          )
        );
      }

      if (afterOwner && afterScore !== 0) {
        updates.push(
          db.collection('users').doc(afterOwner).set(
            { communityPoints: admin.firestore.FieldValue.increment(afterScore), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          )
        );
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    return null;
  });
