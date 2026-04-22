import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
  onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { EXAM_CONFIG, MODULES } from '../config/modules';

// ============================================
// Module Progress Hook (real-time via onSnapshot)
// ============================================
export function useModuleProgress(moduleId) {
  const { user } = useAuth();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moduleOpen, setModuleOpen] = useState(true);
  const [moduleDates, setModuleDates] = useState({ openDate: null, closeDate: null });

  useEffect(() => {
    if (!user || !moduleId) {
      setLoading(false);
      return;
    }

    // Listen to user's progress in real-time (admin score changes reflect instantly)
    const progressRef = doc(db, 'users', user.uid, 'progress', moduleId);
    const unsubProgress = onSnapshot(progressRef, (snap) => {
      if (snap.exists()) {
        setProgress({ id: snap.id, ...snap.data() });
      } else {
        setProgress(null);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error listening to module progress:', error);
      setLoading(false);
    });

    // Listen to module open/close settings in real-time
    const settingsRef = doc(db, 'moduleSettings', moduleId);
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setModuleDates({ openDate: data.openDate || null, closeDate: data.closeDate || null });
        // Check manual isOpen toggle
        if (data.isOpen === false) {
          setModuleOpen(false);
          return;
        }
        // Check date-based automation
        const now = new Date();
        if (data.openDate) {
          const openDate = new Date(data.openDate);
          if (now < openDate) {
            setModuleOpen(false);
            return;
          }
        }
        if (data.closeDate) {
          const closeDate = new Date(data.closeDate);
          // Close at end of closeDate day
          closeDate.setHours(23, 59, 59, 999);
          if (now > closeDate) {
            setModuleOpen(false);
            return;
          }
        }
        setModuleOpen(true);
      } else {
        setModuleOpen(true); // default open if no settings doc
      }
    }, () => { /* ignore errors for settings */ });

    return () => {
      unsubProgress();
      unsubSettings();
    };
  }, [user, moduleId]);

  return { progress, loading, moduleOpen, moduleDates };
}

// ============================================
// All User Progress Hook
// ============================================
export function useAllProgress() {
  const { user } = useAuth();
  const [progressMap, setProgressMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      if (!user) return;
      try {
        const progressRef = collection(db, 'users', user.uid, 'progress');
        const snap = await getDocs(progressRef);
        const map = {};
        snap.forEach((doc) => {
          map[doc.id] = { id: doc.id, ...doc.data() };
        });
        setProgressMap(map);
      } catch (error) {
        console.error('Error fetching all progress:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [user]);

  return { progressMap, loading };
}

// ============================================
// Submission Hook
// ============================================
export function useSubmission() {
  const { user } = useAuth();

  async function submitProof(moduleId, data) {
    if (!user) throw new Error('Vous devez être connecté');

    const { images, videoUrl, description } = data;
    const imageUrls = [];

    // Upload images to Firebase Storage
    if (images && images.length > 0) {
      for (const image of images) {
        try {
          const storageRef = ref(
            storage,
            `submissions/${user.uid}/${moduleId}/${Date.now()}_${image.name}`
          );
          const snapshot = await uploadBytes(storageRef, image);
          const url = await getDownloadURL(snapshot.ref);
          imageUrls.push(url);
        } catch (uploadError) {
          console.error('Image upload failed:', uploadError.code, uploadError.message);
          throw new Error(`Échec de l'upload de l'image "${image.name}". Réessayez.`);
        }
      }
    }

    const submission = {
      userId: user.uid,
      moduleId,
      images: imageUrls,
      videoUrl: videoUrl || null,
      description,
      status: 'pending',
      submittedAt: serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
    };

    // Save submission
    const submissionRef = doc(
      collection(db, 'users', user.uid, 'submissions')
    );
    await setDoc(submissionRef, submission);

    // Update progress — auto-validate and unlock exam immediately
    const progressRef = doc(db, 'users', user.uid, 'progress', moduleId);
    await setDoc(
      progressRef,
      {
        moduleId,
        submissionId: submissionRef.id,
        submitted: true,
        submittedAt: serverTimestamp(),
        validated: true,
        examUnlocked: true,
        examScore: null,
        examAttempts: 0,
        examLocked: false,
        badgeId: null,
      },
      { merge: true }
    );

    return submissionRef.id;
  }

  return { submitProof };
}

// ============================================
// Exam Hook
// ============================================
export function useExam() {
  const { user } = useAuth();

  async function getExamStatus(moduleId) {
    if (!user) return null;
    const progressRef = doc(db, 'users', user.uid, 'progress', moduleId);
    const progressSnap = await getDoc(progressRef);
    if (!progressSnap.exists()) return { eligible: false, reason: 'no-submission' };

    const data = progressSnap.data();
    if (!data.submitted || !data.examUnlocked) return { eligible: false, reason: 'no-submission' };
    if (data.examLocked) return { eligible: false, reason: 'locked' };
    if (data.examAttempts >= EXAM_CONFIG.MAX_ATTEMPTS) return { eligible: false, reason: 'max-attempts' };

    return { eligible: true, attempts: data.examAttempts || 0, data };
  }

  async function startExam(moduleId) {
    if (!user) throw new Error('Not authenticated');

    // Create exam session
    const examRef = doc(collection(db, 'exams'));
    await setDoc(examRef, {
      userId: user.uid,
      moduleId,
      startedAt: serverTimestamp(),
      status: 'in-progress',
      answers: [],
      mcqScore: null,
      openScore: null,
      totalScore: null,
      aiCheatingFlags: 0,
      completedAt: null,
    });

    // Increment attempt counter
    const progressRef = doc(db, 'users', user.uid, 'progress', moduleId);
    await updateDoc(progressRef, {
      examAttempts: increment(1),
    });

    return examRef.id;
  }

  async function submitAnswer(examId, questionIndex, answer, questionType) {
    if (!user) throw new Error('Not authenticated');

    const examRef = doc(db, 'exams', examId);
    const examSnap = await getDoc(examRef);
    if (!examSnap.exists()) throw new Error('Exam not found');

    const examData = examSnap.data();
    const answers = [...(examData.answers || [])];
    answers[questionIndex] = {
      answer,
      questionType,
      submittedAt: new Date().toISOString(),
    };

    await updateDoc(examRef, { answers });
    return true;
  }

  async function completeExam(examId, moduleId, questions) {
    if (!user) throw new Error('Not authenticated');

    const examRef = doc(db, 'exams', examId);
    const examSnap = await getDoc(examRef);
    if (!examSnap.exists()) throw new Error('Exam not found');

    const examData = examSnap.data();
    const answers = examData.answers || [];

    // Score MCQ questions: 1 point per correct answer
    let mcqCorrect = 0;
    let mcqTotal = 0;
    let openScore = 0;
    let openTotal = 0;

    // Nonsense/lazy answer detection for open questions
    const NONSENSE_PATTERNS = [
      /^(rien|nothing|ok|okay|oui|non|yes|no|idk|jsp|je\s*sais\s*pas|i\s*don'?t\s*know|n\/a|na|nope|pas?\s*de?\s*réponse|aucune?\s*idée|bof|meh|lol|haha|test|hello|bonjour|salut|merci|thanks|cool|nice|good|bien|d'accord|voilà|c'est\s*tout|fin|end|stop|quit|skip|next|suivant|je\s*n'?ai\s*rien|i\s*didn'?t|no\s*idea|whatever|peu\s*importe|ça\s*va|comme\s*ci|i\s*don'?t\s*care)$/i,
      /^[\s\.\,\!\?\-\_\*\#\@\&\(\)]*$/, // Only punctuation/whitespace
      /^(.)\1{3,}$/, // Repeated single character (e.g., "aaaa", "1111")
      /^(.{1,3}\s*){1,3}$/, // Very short repeated words
    ];

    // Generic filler phrases that indicate no real understanding
    const GENERIC_FILLER_PHRASES = [
      /c'est\s+(très\s+)?(important|intéressant|bien|bon|utile|nécessaire|essentiel)/i,
      /je\s+pense\s+que\s+c'est\s+(bien|bon|important|utile)/i,
      /il\s+faut\s+(bien\s+)?faire\s+attention/i,
      /c'est\s+un\s+(bon|bel|excellent)\s+(outil|concept|sujet|thème)/i,
      /en\s+conclusion.*c'est\s+(très\s+)?(bien|important)/i,
      /j'ai\s+(beaucoup\s+)?appris\s+(beaucoup\s+)?(de\s+)?choses/i,
      /c'est\s+un\s+sujet\s+(très\s+)?(vaste|large|complexe)/i,
      /il\s+y\s+a\s+(beaucoup|plusieurs)\s+(de\s+)?(choses|éléments|aspects)\s+(à\s+)?(considérer|prendre\s+en\s+compte|voir)/i,
    ];

    function isNonsenseAnswer(text) {
      if (!text || typeof text !== 'string') return true;
      const trimmed = text.trim();
      // Too short (less than 15 characters)
      if (trimmed.length < 15) return true;
      // Too few words (less than 5 words)
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length < 5) return true;
      // Matches nonsense patterns
      for (const pattern of NONSENSE_PATTERNS) {
        if (pattern.test(trimmed)) return true;
      }
      return false;
    }

    // Detect generic/filler answers that don't demonstrate real understanding
    function scoreOpenAnswer(answerText, questionText) {
      if (!answerText || typeof answerText !== 'string') return 0;
      const trimmed = answerText.trim();
      const words = trimmed.split(/\s+/).filter(Boolean);
      const wordCount = words.length;
      const lowerText = trimmed.toLowerCase();
      const lowerQuestion = (questionText || '').toLowerCase();

      // Check if answer is mostly a copy of the question
      if (lowerQuestion.length > 20) {
        const questionWords = lowerQuestion.split(/\s+/).filter((w) => w.length > 3);
        const matchCount = questionWords.filter((w) => lowerText.includes(w)).length;
        const overlapRatio = questionWords.length > 0 ? matchCount / questionWords.length : 0;
        if (overlapRatio > 0.7 && wordCount < 40) return 0; // Copied the question
      }

      // Count generic filler matches
      let fillerCount = 0;
      for (const pattern of GENERIC_FILLER_PHRASES) {
        if (pattern.test(lowerText)) fillerCount++;
      }
      // If more than 2 filler phrases and short answer = low quality
      if (fillerCount >= 2 && wordCount < 35) return 0.25;

      // Check for repetitive content (same sentence repeated)
      const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 10);
      if (sentences.length >= 2) {
        const uniqueSentences = new Set(sentences.map((s) => s.trim().toLowerCase()));
        if (uniqueSentences.size < sentences.length * 0.5) return 0.25; // Too repetitive
      }

      // Check for technical depth indicators
      const technicalIndicators = [
        /api|sdk|framework|library|database|serveur|backend|frontend|deploy/i,
        /fonction|variable|class|module|composant|component|hook|state/i,
        /firebase|firestore|auth|cloud|storage|hosting|docker|git/i,
        /algorithme|architecture|pattern|design|mvc|mvvm|rest|graphql/i,
        /erreur|debug|log|test|unitaire|intégration|performance/i,
        /sécurité|authentification|autorisation|token|jwt|oauth/i,
        /code|implémentat|configur|install|import|export|require/i,
      ];
      const technicalMatches = technicalIndicators.filter((p) => p.test(lowerText)).length;

      // Scoring based on quality signals
      if (wordCount >= 40 && technicalMatches >= 2) return 1;      // Detailed + technical
      if (wordCount >= 25 && technicalMatches >= 1) return 1;      // Good length + some technical
      if (wordCount >= 25 && fillerCount === 0) return 0.75;       // Good length, no filler
      if (wordCount >= 15 && technicalMatches >= 1) return 0.5;    // Short but technical
      if (wordCount >= 15) return 0.5;                              // Valid but short
      return 0.25;                                                  // Minimal effort
    }

    if (questions && questions.length > 0) {
      questions.forEach((q, index) => {
        if (q.type === 'mcq') {
          mcqTotal++;
          const userAnswer = answers[index]?.answer;
          if (userAnswer === q.correct) {
            mcqCorrect++;
          }
        } else if (q.type === 'open') {
          openTotal++;
          const userAnswer = answers[index]?.answer;
          if (isNonsenseAnswer(userAnswer)) {
            // Nonsense = 0 points
          } else {
            // Enhanced scoring with technical depth + generic answer detection
            openScore += scoreOpenAnswer(userAnswer, q.text);
          }
        }
      });
    }

    // Total score: MCQ (1pt each) + Open (0.5 or 1pt each), capped at 10
    const totalScore = Math.min(Math.round((mcqCorrect + openScore) * 10) / 10, 10);
    const passed = totalScore >= EXAM_CONFIG.PASSING_SCORE;

    // Update exam document
    await updateDoc(examRef, {
      status: 'completed',
      completedAt: serverTimestamp(),
      mcqScore: mcqCorrect,
      openScore,
      totalScore,
      mcqCorrect,
      mcqTotal,
      openTotal,
    });

    // Update user progress with score — keep the BEST score only
    const progressRef = doc(db, 'users', user.uid, 'progress', moduleId);
    const progressSnap = await getDoc(progressRef);
    const existingScore = progressSnap.exists() ? (progressSnap.data().examScore || 0) : 0;
    const existingBadge = progressSnap.exists() ? progressSnap.data().badgeId : null;
    
    // Only update if new score is better
    const bestScore = Math.max(existingScore, totalScore);
    
    // Certificate requires score >= 7 (badge)
    const earnsCertificate = bestScore >= 7;
    const badgeId = (earnsCertificate && !existingBadge) ? `badge-${moduleId}-${user.uid.slice(0, 6)}-${Date.now().toString(36)}` : null;

    const progressUpdate = {
      examScore: bestScore,
      lastExamScore: totalScore,
    };
    if (badgeId) {
      progressUpdate.badgeId = badgeId;

      // Save badge to public badges collection for verification
      try {
        const badgeDocRef = doc(db, 'badges', badgeId);
        const badgeModule = MODULES.find((m) => m.id === moduleId);
        await setDoc(badgeDocRef, {
          badgeId,
          userId: user.uid,
          userName: user.displayName || 'Apprenant',
          userEmail: user.email,
          userPhotoURL: user.photoURL || null,
          moduleId,
          moduleTitle: badgeModule?.title || moduleId,
          score: bestScore,
          completedAt: serverTimestamp(),
          completedAtStr: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
          issuedBy: 'GDG on Campus UCB',
          platform: 'UjuziAI',
          createdAt: serverTimestamp(),
        });
      } catch (badgeErr) {
        console.error('Failed to save public badge:', badgeErr);
      }
    }
    // Store the completion date the FIRST time they pass (>= 6) — never overwrite
    if (passed && !progressSnap.data()?.completedAt) {
      progressUpdate.completedAt = serverTimestamp();
    }

    await updateDoc(progressRef, progressUpdate);

    // Recalculate totalScore = sum of best scores per module
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const allProgressSnap = await getDocs(collection(db, 'users', user.uid, 'progress'));
      let newTotalScore = 0;
      allProgressSnap.forEach((p) => {
        newTotalScore += (p.data().examScore || 0);
      });
      await updateDoc(userRef, { totalScore: newTotalScore });
    }

    return { totalScore, mcqScore: mcqCorrect, openScore, passed, badgeId, mcqCorrect, mcqTotal, openTotal };
  }

  return { getExamStatus, startExam, submitAnswer, completeExam };
}

// ============================================
// Leaderboard Hook (real-time via onSnapshot)
// ============================================
export function useLeaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [userRank, setUserRank] = useState(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Admin emails to hide from public leaderboard
  const ADMIN_EMAILS_HIDDEN = ['abrahamfaith325@gmail.com', 'gdgoncampusucb@gmail.com'];

  useEffect(() => {
    const usersRef = collection(db, 'users');
    const usersQuery = query(usersRef, orderBy('totalScore', 'desc'));
    const projectsRef = collection(db, 'buildathonProjects');

    let usersCache = [];
    let projectsCache = [];

    function recomputeLeaderboard() {
      const communityPointsByUser = {};

      projectsCache.forEach((project) => {
        const ownerId = project?.submittedBy;
        if (!ownerId) return;
        const voteCount = Number.isFinite(Number(project?.voteCount))
          ? Number(project.voteCount)
          : (Array.isArray(project?.votes) ? project.votes.length : 0);
        const likesCount = Number.isFinite(Number(project?.likesCount))
          ? Number(project.likesCount)
          : (Array.isArray(project?.likeUserIds) ? project.likeUserIds.length : 0);
        const points = (voteCount * 10) + likesCount;
        communityPointsByUser[ownerId] = (communityPointsByUser[ownerId] || 0) + points;
      });

      const allData = usersCache
        .filter((item) => !ADMIN_EMAILS_HIDDEN.includes(item.email?.toLowerCase()))
        .map((item) => {
          const communityPoints = Number(communityPointsByUser[item.id] || 0);
          const leaderboardScore = Number(item.totalScore || 0) + Number(item.bonusPoints || 0) + communityPoints;
          return {
            ...item,
            communityPoints,
            leaderboardScore,
          };
        });

      allData.sort((a, b) => (b.leaderboardScore || 0) - (a.leaderboardScore || 0));
      setTotalUsers(allData.length);
      setLeaderboard(allData);

      if (user) {
        const idx = allData.findIndex((d) => d.id === user.uid);
        setUserRank(idx >= 0 ? idx + 1 : null);
      }
      setLoading(false);
    }

    const unsubUsers = onSnapshot(usersQuery, (snap) => {
      const data = [];
      snap.forEach((docSnap) => data.push({ id: docSnap.id, ...docSnap.data() }));
      usersCache = data;
      recomputeLeaderboard();
    }, (error) => {
      console.error('Error listening to leaderboard users:', error);
      setLoading(false);
    });

    const unsubProjects = onSnapshot(projectsRef, (snap) => {
      const data = [];
      snap.forEach((docSnap) => data.push({ id: docSnap.id, ...docSnap.data() }));
      projectsCache = data;
      recomputeLeaderboard();
    }, (error) => {
      console.error('Error listening to buildathon projects for leaderboard:', error);
    });

    return () => {
      unsubUsers();
      unsubProjects();
    };
  }, [user]);

  return { leaderboard, userRank, totalUsers, loading };
}

// ============================================
// Admin Hook
// ============================================
export function useAdmin() {
  const { user, isAdmin } = useAuth();

  async function getAllSubmissions() {
    if (!isAdmin) throw new Error('Unauthorized');
    const submissionsRef = collection(db, 'submissions');
    const snap = await getDocs(submissionsRef);
    const data = [];
    snap.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
    return data;
  }

  async function validateSubmission(userId, moduleId, approved) {
    if (!isAdmin) throw new Error('Unauthorized');

    const progressRef = doc(db, 'users', userId, 'progress', moduleId);
    await updateDoc(progressRef, {
      validated: approved,
      examUnlocked: approved,
      reviewedAt: serverTimestamp(),
      reviewedBy: user.uid,
    });
  }

  async function toggleModuleLock(moduleId, isOpen) {
    if (!isAdmin) throw new Error('Unauthorized');
    const moduleRef = doc(db, 'moduleSettings', moduleId);
    await setDoc(moduleRef, { isOpen, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function overrideExamLock(userId, moduleId) {
    if (!isAdmin) throw new Error('Unauthorized');
    const progressRef = doc(db, 'users', userId, 'progress', moduleId);
    await updateDoc(progressRef, {
      examLocked: false,
      examAttempts: 0,
    });
  }

  // ---- Role management (4 community roles) ----
  async function updateUserRole(userId, newRole) {
    if (!isAdmin) throw new Error('Unauthorized');
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      communityRole: newRole,
      updatedAt: serverTimestamp(),
    });
  }

  // ---- Module CRUD ----
  async function saveModuleSettings(moduleId, settings) {
    if (!isAdmin) throw new Error('Unauthorized');
    const moduleRef = doc(db, 'moduleSettings', moduleId);
    await setDoc(moduleRef, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
  }

  // ---- Editable exam settings ----
  async function saveExamSettings(settings) {
    if (!isAdmin) throw new Error('Unauthorized');
    const settingsRef = doc(db, 'appSettings', 'exam');
    await setDoc(settingsRef, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function getExamSettings() {
    const settingsRef = doc(db, 'appSettings', 'exam');
    const snap = await getDoc(settingsRef);
    if (snap.exists()) return snap.data();
    return null;
  }

  // ---- Admin: modify user exam score ----
  async function modifyUserScore(userId, moduleId, newScore) {
    if (!isAdmin) throw new Error('Unauthorized');
    const progressRef = doc(db, 'users', userId, 'progress', moduleId);
    const progressSnap = await getDoc(progressRef);
    if (!progressSnap.exists()) throw new Error('Progress not found');

    const earnsCertificate = newScore >= 7;
    const existingBadge = progressSnap.data().badgeId;
    const badgeId = (earnsCertificate && !existingBadge) ? `badge-${moduleId}-${userId.slice(0, 6)}-${Date.now().toString(36)}` : null;

    const update = {
      examScore: newScore,
      lastExamScore: newScore,
      reviewedAt: serverTimestamp(),
      reviewedBy: user.uid,
    };
    if (badgeId) {
      update.badgeId = badgeId;

      // Save badge to public badges collection for verification
      try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        const badgeModule = MODULES.find((m) => m.id === moduleId);
        const badgeDocRef = doc(db, 'badges', badgeId);
        await setDoc(badgeDocRef, {
          badgeId,
          userId,
          userName: userData.displayName || 'Apprenant',
          userEmail: userData.email || '',
          userPhotoURL: userData.photoURL || null,
          moduleId,
          moduleTitle: badgeModule?.title || moduleId,
          score: newScore,
          completedAt: serverTimestamp(),
          completedAtStr: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
          issuedBy: 'GDG on Campus UCB',
          platform: 'UjuziAI',
          createdAt: serverTimestamp(),
        });
      } catch (badgeErr) {
        console.error('Failed to save public badge:', badgeErr);
      }
    }
    // If score is lowered below earning certificate and they had a badge, remove it
    if (!earnsCertificate && existingBadge) update.badgeId = null;

    await updateDoc(progressRef, update);

    // Recalculate totalScore for the user
    const userRefCalc = doc(db, 'users', userId);
    const allProgressSnap = await getDocs(collection(db, 'users', userId, 'progress'));
    let newTotalScore = 0;
    allProgressSnap.forEach((p) => {
      if (p.id === moduleId) {
        newTotalScore += newScore;
      } else {
        newTotalScore += (p.data().examScore || 0);
      }
    });
    await updateDoc(userRefCalc, { totalScore: newTotalScore });
  }

  // ---- Admin: get submission details ----
  async function getUserSubmissions(userId) {
    if (!isAdmin) throw new Error('Unauthorized');
    const subsRef = collection(db, 'users', userId, 'submissions');
    const snap = await getDocs(subsRef);
    const data = [];
    snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
    return data;
  }

  // ---- Admin: add bonus points to a user ----
  async function addBonusPoints(userId, points, reason = '') {
    if (!isAdmin) throw new Error('Unauthorized');
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      bonusPoints: increment(points),
    });
    // Log the bonus in a subcollection for audit trail
    const logRef = doc(collection(db, 'users', userId, 'bonusLogs'));
    await setDoc(logRef, {
      points,
      reason,
      grantedBy: user.uid,
      grantedAt: serverTimestamp(),
    });
  }

  return {
    getAllSubmissions,
    validateSubmission,
    toggleModuleLock,
    overrideExamLock,
    updateUserRole,
    saveModuleSettings,
    saveExamSettings,
    getExamSettings,
    modifyUserScore,
    getUserSubmissions,
    addBonusPoints,
  };
}
