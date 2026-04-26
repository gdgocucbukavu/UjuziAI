import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDoc, arrayUnion, collection, collectionGroup, doc, getDoc, getDocs, increment, limit, onSnapshot, query, serverTimestamp, setDoc, deleteDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Calendar, Clock3, Crown, ExternalLink, Eye, FileText, Heart, Loader2, Medal, MessageSquare, Settings, ThumbsUp, Trophy, Users, UserPlus, Send, Star, UserCircle2 } from 'lucide-react';
import { normalizeJudgeCriteria } from '../lib/judging';

const TAB_LIST = [
  { id: 'overview', label: 'Aperçu' },
  { id: 'calendar', label: 'Calendrier' },
  { id: 'projects', label: 'Projets' },
  { id: 'ranking', label: 'Classement' },
  { id: 'submit', label: 'Soumettre' },
  { id: 'discussions', label: 'Discussions' },
  { id: 'rules', label: 'Règles' },
  { id: 'management', label: 'Gestion', adminOnly: true },
];

function normalizeDateLike(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?.toDate && typeof value.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatEventDate(value) {
  if (!value) return 'Date non définie';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date non définie';
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getEffectiveEventEndDate(event) {
  const candidateDates = [event?.voteEndDate, event?.submissionEndDate, event?.endDate]
    .map((value) => (value ? new Date(value) : null))
    .filter((date) => date && !Number.isNaN(date.getTime()));

  if (candidateDates.length === 0) return null;
  return candidateDates.reduce((latest, current) => (current > latest ? current : latest));
}

function toValidUrl(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  try {
    return new URL(rawValue.trim());
  } catch {
    return null;
  }
}

function isValidGitHubRepoUrl(rawValue) {
  const parsedUrl = toValidUrl(rawValue);
  if (!parsedUrl) return false;

  const hostname = parsedUrl.hostname.toLowerCase();
  if (parsedUrl.protocol !== 'https:' || (hostname !== 'github.com' && hostname !== 'www.github.com')) {
    return false;
  }

  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  return pathParts.length >= 2;
}

function isValidDemoUrl(rawValue) {
  const parsedUrl = toValidUrl(rawValue);
  if (!parsedUrl) return false;
  return parsedUrl.protocol === 'https:';
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}j ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getPhaseCountdown(startValue, endValue, nowMs) {
  const startMs = startValue ? new Date(startValue).getTime() : null;
  const endMs = endValue ? new Date(endValue).getTime() : null;

  if (!Number.isFinite(startMs) && !Number.isFinite(endMs)) {
    return { label: 'Date non définie', state: 'unknown' };
  }

  if (Number.isFinite(startMs) && nowMs < startMs) {
    return {
      label: `Commence dans ${formatDurationMs(startMs - nowMs)}`,
      state: 'upcoming',
    };
  }

  if (Number.isFinite(endMs)) {
    if (nowMs <= endMs) {
      return {
        label: `Se termine dans ${formatDurationMs(endMs - nowMs)}`,
        state: 'running',
      };
    }
    return { label: 'Terminé', state: 'ended' };
  }

  return { label: 'En cours', state: 'running' };
}

function getEventStatus(event) {
  const now = new Date();
  const startDate = event?.startDate ? new Date(event.startDate) : null;
  const voteEndDate = getEffectiveEventEndDate(event);

  if (startDate && startDate > now) return 'À venir';
  if (voteEndDate && voteEndDate < now) return 'Terminé';
  return 'En cours';
}

function isEventOpenForParticipation(event) {
  const status = getEventStatus(event);
  return status === 'À venir' || status === 'En cours';
}

function isWithinSubmissionWindow(event, nowMs = Date.now()) {
  const startMs = event?.submissionStartDate ? new Date(event.submissionStartDate).getTime() : null;
  const endMsRaw = getEffectiveEventEndDate(event);
  const endMs = endMsRaw ? endMsRaw.getTime() : null;

  if (!Number.isFinite(startMs) && !Number.isFinite(endMs)) return true;
  if (Number.isFinite(startMs) && nowMs < startMs) return false;
  if (Number.isFinite(endMs) && nowMs > endMs) return false;
  return true;
}

function normalizeBuildathonEvent(raw) {
  const mode = raw.mode === 'jury' || raw.juryModeEnabled === true || raw.rankingMode === 'jury' ? 'jury' : 'public';
  return {
    ...raw,
    participants: Array.isArray(raw.participants) ? raw.participants : [],
    votingEnabled: raw.votingEnabled !== false,
    rewardsVisible: raw.rewardsVisible !== false,
    startDate: normalizeDateLike(raw.startDate),
    endDate: normalizeDateLike(raw.endDate),
    voteStartDate: normalizeDateLike(raw.voteStartDate) || normalizeDateLike(raw.startDate),
    voteEndDate: normalizeDateLike(raw.voteEndDate) || normalizeDateLike(raw.endDate),
    submissionStartDate: normalizeDateLike(raw.submissionStartDate) || normalizeDateLike(raw.startDate),
    submissionEndDate: normalizeDateLike(raw.submissionEndDate) || normalizeDateLike(raw.endDate),
    participationRules: raw.participationRules || '',
    evaluationCriteria: raw.evaluationCriteria || '',
    tieBreakRuleText: raw.tieBreakRuleText || 'En cas d\'égalité, le projet soumis le plus tôt est prioritaire.',
    prizes: Array.isArray(raw.prizes) ? raw.prizes : [],
    projectVisibility: raw.projectVisibility || 'published-only',
    publicationStatus: raw.publicationStatus || 'published',
    mode,
    juryModeEnabled: mode === 'jury',
    juryResultsPublished: raw.juryResultsPublished === true,
    rankingMode: mode,
    judgeCriteria: normalizeJudgeCriteria(raw.judgeCriteria),
  };
}

function getCanonicalProjectStatus(project = {}) {
  const raw = String(project.projectStatus || project.status || '').toLowerCase();
  const normalizedRaw = raw.replace('é', 'e').trim();
  if (normalizedRaw === 'brouillon' || normalizedRaw === 'draft') return 'brouillon';
  if (normalizedRaw === 'soumis' || normalizedRaw === 'submitted' || normalizedRaw === 'pending') return 'soumis';
  if (normalizedRaw === 'valide' || normalizedRaw === 'validated' || normalizedRaw === 'approved') return 'valide';
  if (normalizedRaw === 'rejete' || normalizedRaw === 'rejected') return 'rejete';
  if (normalizedRaw === 'publie' || normalizedRaw === 'published') return 'publie';

  if (project?.moderationStatus === 'rejected') return 'rejete';
  if (project?.isPublished === true || project?.isPublic === true) return 'publie';
  if (project?.moderationStatus === 'approved') return 'valide';
  return 'soumis';
}

function getCanonicalProjectVisibility(event = {}) {
  const isJuryMode = event?.mode === 'jury' || event?.rankingMode === 'jury' || event?.juryModeEnabled === true;
  if (isJuryMode) return 'all-submitted';

  const raw = String(event?.projectVisibility || '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .trim();

  if (raw === 'all-submitted' || raw === 'allsubmitted' || raw === 'all') return 'all-submitted';
  return 'published-only';
}

function isProjectOwnerOrMember(project, uid) {
  if (!uid) return false;
  if (project?.submittedBy === uid) return true;
  return Array.isArray(project?.members) && project.members.some((member) => member?.uid === uid);
}

function isProjectVisibleForParticipant(project, event, uid) {
  const status = getCanonicalProjectStatus(project);
  if (isProjectOwnerOrMember(project, uid)) return true;

  if (status === 'rejete') return false;
  
  // LOGIC FIX: Always show submitted projects if the event is in "jury" mode 
  // or if projectVisibility is set to 'all-submitted'.
  // ALSO: If it's currently the submission or voting phase, we should probably 
  // show submitted projects so participants can see the activity.
  const projectVisibility = getCanonicalProjectVisibility(event);
  const isJuryMode = event?.mode === 'jury' || event?.rankingMode === 'jury' || event?.juryModeEnabled === true;

  if (isJuryMode || projectVisibility === 'all-submitted') {
    return status === 'soumis' || status === 'valide' || status === 'publie';
  }

  // Fallback: only published projects
  return status === 'publie';
}

function getProjectVisual(project = {}) {
  const candidate = [
    project.thumbnailUrl,
    project.coverImageUrl,
    project.imageUrl,
    project.logoUrl,
    project.avatarUrl,
  ].find((value) => typeof value === 'string' && value.trim());

  return candidate ? candidate.trim() : null;
}

function getEventCoverImageUrl(event = {}) {
  const value = String(event?.coverImageUrl || '').trim();
  if (!value) return '/icon-512.png';

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== 'https:') return '/icon-512.png';
    return parsedUrl.toString();
  } catch {
    return '/icon-512.png';
  }
}

function getInitialsLabel(input) {
  const value = String(input || '').trim();
  if (!value) return 'PR';
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'PR';
}

function toTimestampMs(value) {
  if (!value) return null;
  if (value?.toDate && typeof value.toDate === 'function') {
    const d = value.toDate();
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

function normalizeBuildathonProject(raw) {
  const votes = Array.isArray(raw.votes) ? raw.votes : [];
  const voteCountRaw = Number(raw.voteCount);
  const projectStatus = getCanonicalProjectStatus(raw);
  return {
    ...raw,
    votes,
    voteCount: Number.isFinite(voteCountRaw) ? voteCountRaw : votes.length,
    projectStatus,
    likesCount: Number.isFinite(Number(raw.likesCount)) ? Number(raw.likesCount) : 0,
    commentsCount: Number.isFinite(Number(raw.commentsCount)) ? Number(raw.commentsCount) : 0,
    feedbackCount: Number.isFinite(Number(raw.feedbackCount)) ? Number(raw.feedbackCount) : 0,
    likeUserIds: Array.isArray(raw.likeUserIds) ? raw.likeUserIds : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function getProjectSubmissionTimestamp(project) {
  const submittedAt = toTimestampMs(project?.submittedAt);
  if (submittedAt !== null) return submittedAt;

  const createdAt = toTimestampMs(project?.createdAt);
  if (createdAt !== null) return createdAt;

  return Number.MAX_SAFE_INTEGER;
}

function sortProjectsForJudgeRanking(projectList = []) {
  return [...projectList].sort((a, b) => {
    const scoreDiff = Number(b?.judgeScoreAverage || 0) - Number(a?.judgeScoreAverage || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const timeDiff = getProjectSubmissionTimestamp(a) - getProjectSubmissionTimestamp(b);
    if (timeDiff !== 0) return timeDiff;

    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function sortProjectsForRanking(projectList = []) {
  return [...projectList].sort((a, b) => {
    const voteDiff = (b?.voteCount || 0) - (a?.voteCount || 0);
    if (voteDiff !== 0) return voteDiff;

    const timeDiff = getProjectSubmissionTimestamp(a) - getProjectSubmissionTimestamp(b);
    if (timeDiff !== 0) return timeDiff;

    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function getProjectTeamLabel(project, allowMemberNames = false) {
  if (project?.teamName) return project.teamName;
  const members = Array.isArray(project?.members) ? project.members : [];
  if (members.length === 0) return 'Équipe non définie';
  if (!allowMemberNames) return 'Équipe participante';
  return members.map((member) => member.name).filter(Boolean).join(', ') || 'Équipe non définie';
}

function getProjectSummary(project) {
  const description = (project?.description || '').trim();
  if (!description) return 'Aucun résumé disponible.';
  return description.length > 140 ? `${description.slice(0, 140).trim()}...` : description;
}

function getProjectTags(project) {
  const tags = Array.isArray(project?.tags) ? project.tags.filter(Boolean) : [];
  if (tags.length > 0) return tags;

  if (project?.category) {
    return [project.category];
  }

  return [];
}

function getProjectCategoryLabel(project) {
  const raw = String(project?.category || '').trim().toLowerCase();
  if (!raw) return 'Autre';

  const labels = {
    'ai-ml': 'IA / ML',
    ai: 'IA / ML',
    ml: 'IA / ML',
    'ia-ml': 'IA / ML',
    'ia/ml': 'IA / ML',
    web: 'Web',
    mobile: 'Mobile',
    cloud: 'Cloud',
    data: 'Data',
    backend: 'Backend',
    frontend: 'Frontend',
    other: 'Autre',
    autre: 'Autre',
  };

  if (labels[raw]) return labels[raw];
  return raw.slice(0, 1).toUpperCase() + raw.slice(1);
}

function getRankingAccent(rank) {
  if (rank === 1) {
    return {
      container: 'border-amber-400/50 bg-gradient-to-br from-amber-500/20 via-amber-400/10 to-transparent',
      badge: 'border-amber-400/50 bg-amber-500/20 text-amber-200',
      score: 'text-amber-300',
    };
  }
  if (rank === 2) {
    return {
      container: 'border-slate-300/40 bg-gradient-to-br from-slate-400/15 via-slate-200/5 to-transparent',
      badge: 'border-slate-300/40 bg-slate-300/15 text-slate-100',
      score: 'text-slate-200',
    };
  }
  return {
    container: 'border-orange-400/40 bg-gradient-to-br from-orange-500/15 via-orange-300/10 to-transparent',
    badge: 'border-orange-400/40 bg-orange-500/20 text-orange-200',
    score: 'text-orange-200',
  };
}

function formatNumber(value) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('fr-FR').format(safeValue);
}

function getProjectStatusLabel(project) {
  const status = getCanonicalProjectStatus(project);
  if (status === 'publie') return 'publie';
  if (status === 'valide') return 'valide';
  if (status === 'rejete') return 'rejete';
  if (status === 'brouillon') return 'brouillon';
  return 'soumis';
}

export default function BuildathonDetail() {
  const { buildathonId } = useParams();
  const { isAdmin, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [submitFormData, setSubmitFormData] = useState({
    title: '',
    description: '',
    category: '',
    teamName: '',
    repoUrl: '',
    demoUrl: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [judgeScoresByProject, setJudgeScoresByProject] = useState({});
  const [judgeInvitations, setJudgeInvitations] = useState([]);
  const [activeJudges, setActiveJudges] = useState([]);
  const [judgeIdentifier, setJudgeIdentifier] = useState('');
  const [invitingJudge, setInvitingJudge] = useState(false);
  const [juryConfigSaving, setJuryConfigSaving] = useState(false);
  const [juryModeEnabled, setJuryModeEnabled] = useState(false);
  const [juryResultsPublished, setJuryResultsPublished] = useState(false);
  const [judgeCriteriaDraft, setJudgeCriteriaDraft] = useState('');

  useEffect(() => {
    const timerId = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!buildathonId) {
      setLoading(false);
      return;
    }

    const eventRef = doc(db, 'buildathons', buildathonId);
    const unsubEvent = onSnapshot(
      eventRef,
      (snap) => {
        if (!snap.exists()) {
          setEvent(null);
          setLoading(false);
          return;
        }
        setEvent(normalizeBuildathonEvent({ id: snap.id, ...snap.data() }));
        setLoading(false);
      },
      () => {
        setEvent(null);
        setLoading(false);
      }
    );

    return () => {
      unsubEvent();
    };
  }, [buildathonId]);

  useEffect(() => {
    if (!buildathonId) return;
    if (!isAdmin && !event) {
      setProjects([]);
      return;
    }

    const normalizeFromSnapshot = (snap) => {
      const list = [];
      snap.forEach((d) => {
        list.push(normalizeBuildathonProject({ id: d.id, ...d.data() }));
      });
      return list;
    };

    const emitProjects = (nextProjects) => {
      if (import.meta.env.DEV) {
        console.info('[BuildathonDetail] project query', {
          buildathonId,
          visibility: getCanonicalProjectVisibility(event || {}),
          isAdmin,
          eventProjectVisibility: event?.projectVisibility || null,
          projectCount: nextProjects.length,
          projects: nextProjects.map((project) => ({
            id: project.id,
            buildathonId: project.buildathonId,
            status: project.status || null,
            projectStatus: project.projectStatus || null,
            moderationStatus: project.moderationStatus || null,
            isPublished: project.isPublished === true,
            submittedBy: project.submittedBy || null,
            submittedAt: project.submittedAt || null,
          })),
        });
      }
      setProjects(nextProjects);
    };

    const projectsRef = query(collection(db, 'buildathonProjects'), where('buildathonId', '==', buildathonId));
    const unsubscribeProjects = onSnapshot(
      projectsRef,
      (snap) => {
        const nextProjects = normalizeFromSnapshot(snap);
        emitProjects(nextProjects);
      },
      (error) => {
        if (import.meta.env.DEV) {
          console.error('[BuildathonDetail] project query error', {
            buildathonId,
            message: error?.message || String(error),
            code: error?.code || null,
          });
        }
        setProjects([]);
      }
    );

    return () => {
      unsubscribeProjects();
    };
  }, [buildathonId, isAdmin, event?.id, event?.projectVisibility]);

  useEffect(() => {
    if (!buildathonId || !isAdmin) {
      setJudgeScoresByProject({});
      return;
    }

    const judgeScoresRef = query(collectionGroup(db, 'judgeScores'), where('buildathonId', '==', buildathonId));
    const unsubscribe = onSnapshot(judgeScoresRef, (snap) => {
      const grouped = {};
      snap.forEach((d) => {
        const score = d.data() || {};
        if (!score.projectId) return;
        if (!grouped[score.projectId]) {
          grouped[score.projectId] = [];
        }
        grouped[score.projectId].push(score);
      });

      const aggregate = {};
      Object.keys(grouped).forEach((projectId) => {
        const scores = grouped[projectId]
          .map((item) => Number(item.totalScore))
          .filter((value) => Number.isFinite(value));
        const judgeScoreCount = scores.length;
        const judgeScoreTotal = scores.reduce((sum, value) => sum + value, 0);
        const judgeScoreAverage = judgeScoreCount > 0 ? judgeScoreTotal / judgeScoreCount : 0;
        aggregate[projectId] = {
          judgeScoreCount,
          judgeScoreTotal,
          judgeScoreAverage,
        };
      });
      setJudgeScoresByProject(aggregate);
    }, () => setJudgeScoresByProject({}));

    return () => unsubscribe();
  }, [buildathonId, isAdmin]);

  useEffect(() => {
    if (!buildathonId) return;

    let unsubJudgeInvitations = () => {};
    if (isAdmin) {
      const judgeInvitationsRef = collection(db, 'buildathons', buildathonId, 'judgeInvitations');
      unsubJudgeInvitations = onSnapshot(judgeInvitationsRef, (snap) => {
        const data = [];
        snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
        data.sort((a, b) => String(a?.inviteeLabel || '').localeCompare(String(b?.inviteeLabel || '')));
        setJudgeInvitations(data);
      }, () => setJudgeInvitations([]));
    } else {
      setJudgeInvitations([]);
    }

    const shouldSubscribeJudges = isAdmin || (event?.mode === 'jury' || event?.juryModeEnabled === true || event?.rankingMode === 'jury');
    let unsubJudges = () => {};
    if (shouldSubscribeJudges) {
      const judgesRef = collection(db, 'buildathons', buildathonId, 'judges');
      unsubJudges = onSnapshot(judgesRef, (snap) => {
        const data = [];
        snap.forEach((d) => {
          const judge = { id: d.id, ...d.data() };
          if (judge?.active === true || isAdmin) {
            data.push(judge);
          }
        });
        data.sort((a, b) => String(a?.displayName || a?.email || '').localeCompare(String(b?.displayName || b?.email || '')));
        setActiveJudges(data);
      }, () => setActiveJudges([]));
    } else {
      setActiveJudges([]);
    }

    return () => {
      unsubJudgeInvitations();
      unsubJudges();
    };
  }, [buildathonId, isAdmin, event?.mode, event?.juryModeEnabled, event?.rankingMode]);

  useEffect(() => {
    setJuryModeEnabled(event?.mode === 'jury' || event?.juryModeEnabled === true || event?.rankingMode === 'jury');
    setJuryResultsPublished(event?.juryResultsPublished === true);
    const criteria = normalizeJudgeCriteria(event?.judgeCriteria);
    const asText = criteria.map((criterion) => criterion.label).join('\n');
    setJudgeCriteriaDraft(asText);
  }, [event?.id, event?.mode, event?.juryModeEnabled, event?.juryResultsPublished, event?.judgeCriteria, event?.rankingMode]);

  const handleRegister = async () => {
    if (!isEventOpenForParticipation(event)) {
      alert('Les inscriptions sont fermées pour ce buildathon terminé.');
      return;
    }
    try {
      await updateDoc(doc(db, 'buildathons', buildathonId), {
        participants: arrayUnion(user.uid),
      });
    } catch (error) {
      console.error('Erreur lors de l\'inscription:', error);
    }
  };

  const handleSubmitProject = async (e) => {
    e.preventDefault();
    if (!isEventOpenForParticipation(event)) {
      alert('Les soumissions sont fermées pour ce buildathon terminé.');
      return;
    }
    if (event?.submissionOpen === false) {
      alert('Les soumissions sont actuellement fermées pour ce buildathon.');
      return;
    }
    if (!submitFormData.title || !submitFormData.teamName || !submitFormData.repoUrl || !submitFormData.demoUrl) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (!isValidGitHubRepoUrl(submitFormData.repoUrl)) {
      alert('Le lien GitHub doit être un dépôt valide (https://github.com/owner/repo).');
      return;
    }

    if (!isValidDemoUrl(submitFormData.demoUrl)) {
      alert('Le lien de démo doit être une URL HTTPS valide.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'buildathonProjects'), {
        buildathonId,
        title: submitFormData.title.trim(),
        description: submitFormData.description.trim(),
        category: submitFormData.category || 'other',
        teamName: submitFormData.teamName.trim(),
        repoUrl: submitFormData.repoUrl.trim(),
        demoUrl: submitFormData.demoUrl.trim(),
        members: [{ uid: user.uid, name: user.displayName || user.email || 'Membre', email: user.email || '' }],
        votes: [],
        voteCount: 0,
        likeUserIds: [],
        likesCount: 0,
        commentsCount: 0,
        feedbackCount: 0,
        projectStatus: 'soumis',
        status: 'soumis',
        moderationStatus: 'pending',
        isPublished: false,
        isPublic: false,
        submittedBy: user.uid,
        submittedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSubmitFormData({ title: '', description: '', category: '', teamName: '', repoUrl: '', demoUrl: '' });
      setActiveTab('projects');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[BuildathonDetail] submit project error', {
          buildathonId,
          message: error?.message || String(error),
          code: error?.code || null,
        });
      }
      console.error('Erreur:', error);
      alert(error?.message ? `Erreur lors de la soumission du projet: ${error.message}` : 'Erreur lors de la soumission du projet');
    } finally {
      setSubmitting(false);
    }
  };

  const resolveUserByIdentifier = async (identifier) => {
    const raw = String(identifier || '').trim();
    if (!raw) return null;
    const lowered = raw.toLowerCase();

    if (raw.includes('@')) {
      const byEmailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', raw), limit(1)));
      if (!byEmailSnap.empty) {
        const docSnap = byEmailSnap.docs[0];
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          authUid: docSnap.id,
          legacyUid: data.uid || data.userId || data.authUid || null,
          email: data.email || raw,
          ...data,
        };
      }

      const usersSnap = await getDocs(collection(db, 'users'));
      let fallbackUser = null;
      usersSnap.forEach((snap) => {
        if (fallbackUser) return;
        const data = snap.data() || {};
        const email = String(data.email || '').toLowerCase();
        if (email === lowered) {
          fallbackUser = {
            id: snap.id,
            authUid: snap.id,
            legacyUid: data.uid || data.userId || data.authUid || null,
            email: data.email || raw,
            ...data,
          };
        }
      });
      if (fallbackUser) return fallbackUser;
    }

    const byIdSnap = await getDoc(doc(db, 'users', raw));
    if (byIdSnap.exists()) {
      const data = byIdSnap.data() || {};
      return {
        id: byIdSnap.id,
        authUid: byIdSnap.id,
        legacyUid: data.uid || data.userId || data.authUid || null,
        email: data.email || null,
        ...data,
      };
    }

    return null;
  };

  const handleInviteJudge = async () => {
    if (!isAdmin || !event?.id || !judgeIdentifier.trim()) return;

    setInvitingJudge(true);
    try {
      const targetUser = await resolveUserByIdentifier(judgeIdentifier);
      if (!targetUser?.id) {
        alert('Utilisateur introuvable (email ou uid)');
        return;
      }

      // DEBUG: Log the resolved user to see what UID we are using
      console.info('[DEBUG] Judge invitation - Resolved user:', {
        identifier: judgeIdentifier,
        resolvedUid: targetUser.id,
        email: targetUser.email,
        displayName: targetUser.displayName
      });

      const invitationData = {
        buildathonId: event.id,
        buildathonTitle: event.title || 'Buildathon',
        inviteeUid: targetUser.authUid || targetUser.id,
        invitedUid: targetUser.authUid || targetUser.id,
        inviteeLegacyUid: targetUser.legacyUid || null,
        invitedLegacyUid: targetUser.legacyUid || null,
        inviteeLabel: targetUser.displayName || targetUser.email || targetUser.id,
        inviteeEmail: targetUser.email || judgeIdentifier.trim() || null,
        inviteeEmailLower: (targetUser.email || judgeIdentifier.trim()) ? String(targetUser.email || judgeIdentifier.trim()).toLowerCase() : null,
        invitedEmail: targetUser.email || judgeIdentifier.trim() || null,
        invitedEmailLower: (targetUser.email || judgeIdentifier.trim()) ? String(targetUser.email || judgeIdentifier.trim()).toLowerCase() : null,
        invitedBy: user?.uid || null,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const invitationDocId = targetUser.authUid || targetUser.id;
      const invRef1 = doc(db, 'buildathons', event.id, 'invitations', invitationDocId);
      const invRef2 = doc(db, 'buildathons', event.id, 'judgeInvitations', invitationDocId);

      const writeResults = await Promise.allSettled([
        setDoc(invRef1, invitationData, { merge: true }),
        setDoc(invRef2, invitationData, { merge: true }),
      ]);

      const successCount = writeResults.filter((result) => result.status === 'fulfilled').length;
      if (successCount === 0) {
        const firstFailure = writeResults.find((result) => result.status === 'rejected');
        throw firstFailure?.reason || new Error('Invitation write failed');
      }

      if (import.meta.env.DEV) {
        const failures = writeResults
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason?.message || String(result.reason));
        if (failures.length > 0) {
          console.warn('[BuildathonDetail] partial invitation write failure', failures);
        }
      }

      console.info('[DEBUG] Judge invitation created successfully at:', invRef1.path);
      setJudgeIdentifier('');
      alert('Invitation envoyee');
    } catch (error) {
      console.error('[DEBUG] Error inviting judge:', error);
      const errorCode = error?.code ? String(error.code) : 'unknown';
      const errorMessage = error?.message
        ? String(error.message)
        : (typeof error === 'string' ? error : JSON.stringify(error));
      const errorStack = error?.stack ? String(error.stack) : 'n/a';
      const debugMessage = [
        'Invitation juge échouée',
        `code: ${errorCode}`,
        `message: ${errorMessage || 'n/a'}`,
        `stack: ${errorStack}`,
        `buildathonId: ${event?.id || 'n/a'}`,
        `invitee: ${judgeIdentifier || 'n/a'}`,
      ].join('\n');
      alert(debugMessage);
    } finally {
      setInvitingJudge(false);
    }
  };

  const handleSaveJuryConfig = async () => {
    if (!isAdmin || !event?.id) return;

    const criterionLines = String(judgeCriteriaDraft || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const criteria = normalizeJudgeCriteria(
      criterionLines.map((label, index) => ({ key: `criterion_${index + 1}`, label, max: 100 }))
    );

    setJuryConfigSaving(true);
    try {
      await updateDoc(doc(db, 'buildathons', event.id), {
        mode: juryModeEnabled ? 'jury' : 'public',
        juryModeEnabled,
        juryResultsPublished,
        rankingMode: juryModeEnabled ? 'jury' : 'public',
        judgeCriteria: criteria,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      alert('Erreur lors de la sauvegarde de la configuration jury');
    } finally {
      setJuryConfigSaving(false);
    }
  };

  const visibleTabs = useMemo(() => {
    return TAB_LIST.filter((tab) => !tab.adminOnly || isAdmin);
  }, [isAdmin]);

  const visibleProjects = useMemo(() => {
    if (isAdmin) return projects;
    return projects.filter((project) => isProjectVisibleForParticipant(project, event, user?.uid));
  }, [projects, event, user?.uid, isAdmin]);

  const sortedProjects = useMemo(() => sortProjectsForRanking(visibleProjects), [visibleProjects]);
  const submittedProjectsCount = useMemo(() => {
    const storedCount = Number(event?.submittedProjectsCount);
    const derivedCount = projects.filter((project) => getCanonicalProjectStatus(project) !== 'brouillon').length;
    if (Number.isFinite(storedCount) && storedCount >= 0) {
      return Math.max(storedCount, derivedCount);
    }
    return derivedCount;
  }, [event?.submittedProjectsCount, projects]);
  const rankingMode = event?.mode === 'jury' || event?.juryModeEnabled === true || event?.rankingMode === 'jury' ? 'jury' : 'public';
  const canRevealJuryRanking = rankingMode !== 'jury' || juryResultsPublished || isAdmin;
  const rankingProjects = useMemo(() => {
    const withJudgeMetrics = visibleProjects.map((project) => {
      const score = judgeScoresByProject[project.id] || {};
      return {
        ...project,
        judgeScoreAverage: Number.isFinite(Number(score.judgeScoreAverage))
          ? Number(score.judgeScoreAverage)
          : Number(project.judgeScoreAverage || 0),
        judgeScoreTotal: Number.isFinite(Number(score.judgeScoreTotal))
          ? Number(score.judgeScoreTotal)
          : Number(project.judgeScoreTotal || 0),
        judgeScoreCount: Number.isFinite(Number(score.judgeScoreCount))
          ? Number(score.judgeScoreCount)
          : Number(project.judgeScoreCount || 0),
      };
    });

    if (rankingMode === 'jury') {
      return sortProjectsForJudgeRanking(withJudgeMetrics);
    }

    return sortProjectsForRanking(withJudgeMetrics);
  }, [visibleProjects, judgeScoresByProject, rankingMode]);
  const rankingStats = useMemo(() => {
    const totalProjects = rankingProjects.length;
    const totalVotes = rankingProjects.reduce((sum, project) => sum + (Number(project?.voteCount) || 0), 0);
    const currentUserPosition = rankingProjects.findIndex((project) => isProjectOwnerOrMember(project, user?.uid));
    const currentUserProject = currentUserPosition >= 0 ? rankingProjects[currentUserPosition] : null;
    const totalJudgeEvaluations = rankingProjects.reduce((sum, project) => sum + (Number(project?.judgeScoreCount) || 0), 0);

    return {
      totalProjects,
      totalVotes,
      totalJudgeEvaluations,
      currentUserPosition: currentUserPosition >= 0 ? currentUserPosition + 1 : null,
      currentUserProject,
    };
  }, [rankingProjects, user?.uid]);

  const displayRankingStats = useMemo(() => {
    if (canRevealJuryRanking) return rankingStats;
    return {
      ...rankingStats,
      currentUserPosition: null,
      currentUserProject: null,
    };
  }, [canRevealJuryRanking, rankingStats]);
  const submissionCountdown = useMemo(
    () => getPhaseCountdown(event?.submissionStartDate, getEffectiveEventEndDate(event), nowMs),
    [event, nowMs]
  );
  const voteCountdown = useMemo(
    () => getPhaseCountdown(event?.voteStartDate, event?.voteEndDate, nowMs),
    [event?.voteStartDate, event?.voteEndDate, nowMs]
  );

  useEffect(() => {
    if (!isAdmin || !event?.id) return;

    const submittedCount = projects.filter((project) => getCanonicalProjectStatus(project) !== 'brouillon').length;
    const publishedCount = projects.filter((project) => getCanonicalProjectStatus(project) === 'publie').length;

    const currentSubmitted = Number(event?.submittedProjectsCount);
    const currentPublished = Number(event?.publishedProjectsCount);
    const hasSubmittedDrift = !Number.isFinite(currentSubmitted) || currentSubmitted !== submittedCount;
    const hasPublishedDrift = !Number.isFinite(currentPublished) || currentPublished !== publishedCount;

    if (!hasSubmittedDrift && !hasPublishedDrift) return;

    updateDoc(doc(db, 'buildathons', event.id), {
      submittedProjectsCount: submittedCount,
      publishedProjectsCount: publishedCount,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      // Silent sync: UI remains usable even if counter update fails.
    });
  }, [isAdmin, event?.id, event?.submittedProjectsCount, event?.publishedProjectsCount, projects]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-10 space-y-4">
        <div className="glass-card p-8 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
          <p className="text-heading font-medium">Chargement du classement Buildathon...</p>
          <p className="text-xs text-muted">Préparation des projets, scores et positions.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="h-28 rounded-xl border border-themed bg-black/5 dark:bg-white/5 animate-pulse" />
          <div className="h-28 rounded-xl border border-themed bg-black/5 dark:bg-white/5 animate-pulse" />
          <div className="h-28 rounded-xl border border-themed bg-black/5 dark:bg-white/5 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="glass-card p-8 text-center">
          <h1 className="text-2xl font-bold text-heading mb-2">Buildathon introuvable</h1>
          <p className="text-body mb-6">Cet événement n'existe pas ou n'est plus disponible.</p>
          <Link to="/projects" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour aux événements
          </Link>
        </div>
      </div>
    );
  }

  const status = getEventStatus(event);
  const canParticipate = isEventOpenForParticipation(event);

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="glass-card overflow-hidden mb-6">
        <div className="relative aspect-[16/6] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border-b border-themed overflow-hidden">
          <img
            src={getEventCoverImageUrl(event)}
            alt={event.title || 'Couverture du Buildathon'}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.src = '/icon-512.png';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          <div className="absolute inset-0 flex items-end p-4 sm:p-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-black/35 backdrop-blur-sm text-white text-xs font-medium">
                <span>{event.type === 'hackathon' ? '💻' : '🏗️'}</span>
                <span>{event.type === 'hackathon' ? 'Hackathon' : 'Buildathon'}</span>
                <span className="opacity-70">•</span>
                <span>{status}</span>
                <span className="opacity-70">•</span>
                <span>{event.mode === 'jury' || event.juryModeEnabled ? 'Mode jury' : 'Mode public'}</span>
              </div>
              <h1 className="mt-3 text-2xl sm:text-4xl font-bold text-white drop-shadow-sm">{event.title}</h1>
              <p className="mt-2 text-sm sm:text-base text-white/85 max-w-2xl">{event.description || 'Aucune description disponible pour cet événement.'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Retour aux événements
        </Link>

        <div className="glass-card p-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatEventDate(event.startDate)} → {formatEventDate(getEffectiveEventEndDate(event))}</span>
              <span className="inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />{formatEventDate(event.submissionStartDate)} → {formatEventDate(getEffectiveEventEndDate(event))}</span>
              <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{event.participants.length} participant{event.participants.length > 1 ? 's' : ''}</span>
              <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{submittedProjectsCount} projet{submittedProjectsCount > 1 ? 's' : ''} soumis</span>
              <span className={`inline-flex items-center gap-1 ${event.votingEnabled ? 'text-green-400' : 'text-red-400'}`}>
                <ThumbsUp className="w-3.5 h-3.5" />
                Vote {event.votingEnabled ? 'activé' : 'désactivé'}
              </span>
              <span className="badge bg-surface border border-themed text-body text-xs">{status}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-[11px] text-muted">Timer soumission</p>
                <p className="text-sm font-medium text-heading">{submissionCountdown.label}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-[11px] text-muted">Timer vote</p>
                <p className="text-sm font-medium text-heading">{voteCountdown.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-themed mt-3">
              {!event.participants.includes(user?.uid) && canParticipate && (
                <button
                  onClick={handleRegister}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-accent-600/20 text-accent-300 border border-accent-500/30 hover:bg-accent-600/30 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  S'inscrire
                </button>
              )}
              {event.participants.includes(user?.uid) && (
                <span className="text-xs text-green-400 flex items-center gap-1">✓ Inscrit</span>
              )}
              {event.participants.includes(user?.uid) && canParticipate && !projects.some((p) => p.submittedBy === user?.uid) && (
                <button
                  onClick={() => setActiveTab('submit')}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary-600/20 text-primary-300 border border-primary-500/30 hover:bg-primary-600/30 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Soumettre
                </button>
              )}
              {projects.some((p) => p.submittedBy === user?.uid) && (
                <span className="text-xs text-primary-400 flex items-center gap-1">✓ Projet soumis</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-3 mb-6">
        <div className="flex gap-2 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
                  : 'text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card p-6">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-heading">Aperçu</h2>
            <p className="text-body whitespace-pre-wrap break-words">{event.description || 'Aucune description disponible pour cet événement.'}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted">Statut</p>
                <p className="text-sm font-medium text-heading">{status}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted">Projets soumis</p>
                <p className="text-sm font-medium text-heading">{submittedProjectsCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted">Vote</p>
                <p className="text-sm font-medium text-heading">{event.votingEnabled ? 'Activé' : 'Désactivé'}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted">Publication</p>
                <p className="text-sm font-medium text-heading">{event.publicationStatus || 'published'}</p>
              </div>
            </div>

            {rankingMode === 'jury' && (
              <div className="p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-themed space-y-2">
                <p className="text-sm font-semibold text-heading">Jury Buildathon</p>
                <p className="text-sm text-body">Le classement final est basé sur les notes des juges.</p>
                <p className="text-xs text-muted">Juges actifs: {formatNumber(activeJudges.length)}</p>
                {activeJudges.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {activeJudges.slice(0, 6).map((judge) => (
                      <span key={judge.id} className="text-[11px] px-2.5 py-1 rounded-full border border-themed bg-surface text-body">
                        {judge.displayName || judge.email || judge.userId || 'Juge'}
                      </span>
                    ))}
                  </div>
                )}
                {!juryResultsPublished && (
                  <p className="text-xs text-muted">Les notes détaillées restent masquées jusqu'a la publication officielle des résultats jury.</p>
                )}
              </div>
            )}

            {isAdmin && rankingMode === 'jury' && (
              <div className="rounded-lg border border-primary-500/30 bg-primary-600/10 p-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-primary-200">Gestion du jury disponible dans l'onglet Gestion.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('management')}
                  className="text-xs px-3 py-1.5 rounded-lg border border-primary-500/30 bg-primary-600/20 text-primary-200"
                >
                  Ouvrir Gestion jury
                </button>
              </div>
            )}

            {event.rewardsVisible && event.prizes.length > 0 && (
              <div className="p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-themed space-y-2">
                <p className="text-sm font-semibold text-heading">Récompenses</p>
                <div className="flex flex-wrap gap-2">
                  {event.prizes
                    .slice()
                    .sort((a, b) => (a.place || 0) - (b.place || 0))
                    .map((prize, idx) => {
                      const rewardType = prize.rewardType || 'points';
                      const label = rewardType === 'points' ? `${Number(prize.points || 0)} pts` : (prize.label || 'Récompense');
                      return (
                        <span key={`${prize.place || idx}-${label}`} className="text-xs px-2.5 py-1 rounded-full border border-themed bg-surface text-body">
                          #{prize.place || idx + 1} - {label}
                        </span>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-heading">Calendrier</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted mb-1">Buildathon</p>
                <p className="text-sm font-medium text-heading">{formatEventDate(event.startDate)} → {formatEventDate(getEffectiveEventEndDate(event))}</p>
              </div>
              <div className="p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted mb-1">Soumission</p>
                <p className="text-sm font-medium text-heading">{formatEventDate(event.submissionStartDate)} → {formatEventDate(getEffectiveEventEndDate(event))}</p>
              </div>
              <div className="p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted mb-1">Vote</p>
                <p className="text-sm font-medium text-heading">{formatEventDate(event.voteStartDate)} → {formatEventDate(event.voteEndDate)}</p>
              </div>
              <div className="p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted mb-1">Départage</p>
                <p className="text-sm font-medium text-heading">{event.tieBreakRuleText}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-heading">Projets</h2>
            {sortedProjects.length === 0 ? (
              <div className="space-y-1">
                <p className="text-body">Aucun projet visible pour le moment.</p>
                {!isAdmin && (
                  <p className="text-xs text-muted">
                    Visibilité actuelle: {getCanonicalProjectVisibility(event) === 'all-submitted' ? 'Tous les projets soumis' : 'Projets publiés uniquement'}.
                    {isWithinSubmissionWindow(event, nowMs)
                      ? ' La phase de soumission est en cours.'
                      : ' La phase de soumission est terminée.'}
                  </p>
                )}
                {!isAdmin && submittedProjectsCount > 0 && (
                  <p className="text-xs text-muted">
                    {submittedProjectsCount} projet{submittedProjectsCount > 1 ? 's' : ''} soumis au total pour cet evenement.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {sortedProjects.map((p) => {
                  const tags = getProjectTags(p);
                  const feedbackCount = p.feedbackCount || p.commentsCount || 0;
                  return (
                    <div key={p.id} className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-themed space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-heading truncate">{p.title}</p>
                          <p className="text-xs text-muted">{getProjectTeamLabel(p, isAdmin)}</p>
                        </div>
                        <div className="text-right">
                          <span className="block text-xs text-muted whitespace-nowrap">{p.voteCount || 0} vote{(p.voteCount || 0) > 1 ? 's' : ''}</span>
                          <span className="inline-flex mt-1 text-[10px] px-2 py-0.5 rounded-full border border-themed bg-surface text-muted">
                            {getProjectStatusLabel(p)}
                          </span>
                        </div>
                      </div>

                      <p className="text-sm text-body line-clamp-2">{getProjectSummary(p)}</p>

                      <div className="flex flex-wrap gap-2">
                        {tags.length > 0 ? tags.map((tag) => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full border border-themed bg-surface text-muted">
                            {tag}
                          </span>
                        )) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-themed bg-surface text-muted">
                            Aucun tag
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span>{p.likesCount || 0} like{(p.likesCount || 0) > 1 ? 's' : ''}</span>
                        <span>{feedbackCount} feedback/commentaire{feedbackCount > 1 ? 's' : ''}</span>
                        {p.demoUrl && (
                          <a href={p.demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300">
                            <ExternalLink className="w-3 h-3" />
                            Démo
                          </a>
                        )}
                      </div>

                      <div className="flex items-center justify-end">
                        <Link
                          to={`/projects/${event.id}/project/${p.id}`}
                          className="text-xs px-3 py-1.5 rounded-lg bg-primary-600/20 text-primary-300 border border-primary-500/30 hover:bg-primary-600/30 transition-colors"
                        >
                          Voir le projet
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'ranking' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-heading inline-flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Classement Buildathon
              </h2>
              <span className="text-[11px] px-3 py-1.5 rounded-full border border-primary-500/30 bg-primary-600/10 text-primary-200">
                {rankingMode === 'jury' ? 'Classement Buildathon basé sur les notes des juges' : 'Classement basé sur les votes du public'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-themed bg-black/5 dark:bg-white/5 p-3">
                <p className="text-muted">Score principal</p>
                <p className="text-heading font-semibold mt-1 inline-flex items-center gap-1.5">
                  <ThumbsUp className="w-3.5 h-3.5 text-primary-300" />
                  {rankingMode === 'jury' ? 'Moyenne des notes des juges' : 'Votes du public'}
                </p>
              </div>
              <div className="rounded-xl border border-themed bg-black/5 dark:bg-white/5 p-3">
                <p className="text-muted">Règle d'égalité</p>
                <p className="text-heading font-semibold mt-1">En cas d’égalité, le projet soumis en premier est prioritaire</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-themed bg-black/5 dark:bg-white/5 p-3">
                <p className="text-muted">Projets classés</p>
                <p className="text-heading font-semibold text-lg mt-1">{formatNumber(displayRankingStats.totalProjects)}</p>
              </div>
              <div className="rounded-xl border border-themed bg-black/5 dark:bg-white/5 p-3">
                <p className="text-muted">{rankingMode === 'jury' ? 'Évaluations juges' : 'Total votes publics'}</p>
                <p className="text-heading font-semibold text-lg mt-1">
                  {rankingMode === 'jury'
                    ? (canRevealJuryRanking ? formatNumber(displayRankingStats.totalJudgeEvaluations) : 'Non publié')
                    : formatNumber(displayRankingStats.totalVotes)}
                </p>
              </div>
              <div className="rounded-xl border border-themed bg-black/5 dark:bg-white/5 p-3">
                <p className="text-muted">Ma position</p>
                {displayRankingStats.currentUserPosition ? (
                  <p className="text-heading font-semibold text-lg mt-1 inline-flex items-center gap-2">
                    <UserCircle2 className="w-4 h-4 text-primary-300" />
                    #{displayRankingStats.currentUserPosition}
                  </p>
                ) : (
                  <p className="text-muted mt-1">
                    {canRevealJuryRanking
                      ? 'Vous n’avez pas encore de projet classé.'
                      : 'Position masquée jusqu’à la publication des résultats jury.'}
                  </p>
                )}
                {displayRankingStats.currentUserProject?.title && (
                  <p className="text-[11px] text-muted mt-1 truncate">{displayRankingStats.currentUserProject.title}</p>
                )}
              </div>
            </div>

            {rankingMode === 'jury' && !canRevealJuryRanking ? (
              <div className="rounded-2xl border border-dashed border-themed bg-black/5 dark:bg-white/5 p-8 text-center space-y-2">
                <p className="text-heading font-semibold">Résultats jury en préparation</p>
                <p className="text-sm text-muted">Les notes des juges sont en cours de consolidation. Le classement sera publié par l'administration.</p>
              </div>
            ) : rankingProjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-themed bg-black/5 dark:bg-white/5 p-8 text-center space-y-2">
                <p className="text-heading font-semibold">Aucun projet classé pour le moment</p>
                <p className="text-sm text-muted">Le classement apparaîtra dès que des projets éligibles seront disponibles.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('projects')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-primary-500/30 bg-primary-600/20 text-primary-200"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Voir les projets
                </button>
              </div>
            ) : (
              <>
                <div className="grid md:grid-cols-12 gap-3">
                  {rankingProjects.slice(0, 3).map((project, index) => {
                    const rank = index + 1;
                    const visual = getProjectVisual(project);
                    const voteCount = Number(project.voteCount || 0);
                    const likesCount = Number(project.likesCount || 0);
                    const feedbackCount = Number(project.feedbackCount || project.commentsCount || 0);
                    const judgeAverage = Number(project.judgeScoreAverage || 0);
                    const accent = getRankingAccent(rank);
                    const colSpan = rank === 1 ? 'md:col-span-6' : 'md:col-span-3';
                    const imageSize = rank === 1 ? 'w-20 h-20' : 'w-14 h-14';
                    const titleSize = rank === 1 ? 'text-base' : 'text-sm';
                    const compactGap = rank === 1 ? 'gap-4' : 'gap-3';

                    return (
                      <article key={project.id} className={`${colSpan}`}>
                        <Link
                          to={`/projects/${event.id}/project/${project.id}`}
                          className={`group block rounded-2xl border p-4 h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl ${accent.container}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${accent.badge}`}>
                              {rank === 1 ? <Crown className="w-3.5 h-3.5" /> : <Medal className="w-3.5 h-3.5" />}
                              #{rank}
                            </span>
                            <span className="text-xs text-muted">{formatEventDate(project.submittedAt)}</span>
                          </div>

                          <div className={`flex items-center ${compactGap} mt-3`}>
                            {visual ? (
                              <img src={visual} alt={`Miniature ${project.title || 'projet'}`} className={`${imageSize} rounded-xl object-cover border border-themed`} />
                            ) : (
                              <div className={`${imageSize} rounded-xl border border-themed bg-surface flex items-center justify-center text-xs font-semibold text-body`}>
                                {getInitialsLabel(project.teamName || project.title)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className={`${titleSize} font-semibold text-heading truncate`}>{project.title || 'Projet sans titre'}</p>
                              <p className="text-xs text-muted truncate">{getProjectTeamLabel(project, isAdmin)}</p>
                              <span className="inline-flex mt-2 text-[10px] px-2 py-0.5 rounded-full border border-themed bg-surface text-muted">
                                {getProjectCategoryLabel(project)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-xs mt-4">
                            <div className="p-2 rounded-lg border border-themed bg-black/10 dark:bg-white/10">
                              <p className="text-muted">{rankingMode === 'jury' ? 'Score Jury' : 'Votes'}</p>
                              <p className={`font-semibold ${accent.score}`}>
                                {rankingMode === 'jury' ? judgeAverage.toFixed(2) : formatNumber(voteCount)}
                              </p>
                            </div>
                            <div className="p-2 rounded-lg border border-themed bg-black/10 dark:bg-white/10">
                              <p className="text-muted">Likes</p>
                              <p className="text-heading font-semibold">{formatNumber(likesCount)}</p>
                            </div>
                            <div className="p-2 rounded-lg border border-themed bg-black/10 dark:bg-white/10">
                              <p className="text-muted">Feedbacks</p>
                              <p className="text-heading font-semibold">{formatNumber(feedbackCount)}</p>
                            </div>
                          </div>

                          <div className="mt-4 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-primary-500/40 bg-primary-600/20 text-primary-200 group-hover:bg-primary-600/30">
                            <Eye className="w-3.5 h-3.5" />
                            Voir le projet
                          </div>
                        </Link>
                      </article>
                    );
                  })}
                </div>

                <div className="lg:hidden space-y-3">
                  {rankingProjects.map((project, index) => {
                    const rank = index + 1;
                    const visual = getProjectVisual(project);
                    const voteCount = Number(project.voteCount || 0);
                    const likesCount = Number(project.likesCount || 0);
                    const feedbackCount = Number(project.feedbackCount || project.commentsCount || 0);
                    const judgeAverage = Number(project.judgeScoreAverage || 0);
                    return (
                      <Link
                        key={project.id}
                        to={`/projects/${event.id}/project/${project.id}`}
                        className="block rounded-2xl border border-themed p-3.5 bg-black/5 dark:bg-white/5 space-y-3 active:scale-[0.99] transition-transform"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-heading min-w-[30px]">#{rank}</span>
                          {visual ? (
                            <img src={visual} alt={`Miniature ${project.title || 'projet'}`} className="w-12 h-12 rounded-xl object-cover border border-themed" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl border border-themed bg-surface flex items-center justify-center text-[11px] font-semibold text-body">
                              {getInitialsLabel(project.teamName || project.title)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-heading truncate">{project.title || 'Projet sans titre'}</p>
                            <p className="text-xs text-muted truncate">{getProjectTeamLabel(project, isAdmin)}</p>
                            <span className="inline-flex mt-1 text-[10px] px-2 py-0.5 rounded-full border border-themed bg-surface text-muted">
                              {getProjectCategoryLabel(project)}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-lg border border-themed p-2 bg-black/10 dark:bg-white/10">
                            <p className="text-muted inline-flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{rankingMode === 'jury' ? 'Score Jury' : 'Votes'}</p>
                            <p className="text-heading font-semibold">{rankingMode === 'jury' ? judgeAverage.toFixed(2) : formatNumber(voteCount)}</p>
                          </div>
                          <div className="rounded-lg border border-themed p-2 bg-black/10 dark:bg-white/10">
                            <p className="text-muted inline-flex items-center gap-1"><Heart className="w-3 h-3" />Likes</p>
                            <p className="text-heading font-semibold">{formatNumber(likesCount)}</p>
                          </div>
                          <div className="rounded-lg border border-themed p-2 bg-black/10 dark:bg-white/10">
                            <p className="text-muted inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" />Feedbacks</p>
                            <p className="text-heading font-semibold">{formatNumber(feedbackCount)}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted">Soumis: {formatEventDate(project.submittedAt)}</span>
                          <span className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg border border-primary-500/30 bg-primary-600/20 text-primary-200">
                            <Eye className="w-3.5 h-3.5" />
                            Voir le projet
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <div className="hidden lg:block overflow-x-auto rounded-xl border border-themed">
                  <table className="w-full text-sm">
                    <thead className="bg-black/5 dark:bg-white/5 text-xs text-muted uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-3 text-left">Rang</th>
                        <th className="px-3 py-3 text-left">Projet</th>
                        <th className="px-3 py-3 text-left">Équipe / Auteur</th>
                        <th className="px-3 py-3 text-left">Photo</th>
                        <th className="px-3 py-3 text-left">{rankingMode === 'jury' ? 'Score Jury' : 'Votes (Public)'}</th>
                        <th className="px-3 py-3 text-left">Likes</th>
                        <th className="px-3 py-3 text-left">Feedbacks</th>
                        <th className="px-3 py-3 text-left">Soumission</th>
                        <th className="px-3 py-3 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingProjects.map((project, index) => {
                        const rank = index + 1;
                        const visual = getProjectVisual(project);
                        const voteCount = Number(project.voteCount || 0);
                        const likesCount = Number(project.likesCount || 0);
                        const feedbackCount = Number(project.feedbackCount || project.commentsCount || 0);
                        const judgeAverage = Number(project.judgeScoreAverage || 0);

                        return (
                          <tr key={project.id} className="border-t border-themed">
                            <td className="px-3 py-3 text-heading font-semibold">
                              <span className="inline-flex items-center gap-1">
                                #{rank}
                                {rank <= 3 && <Star className="w-3.5 h-3.5 text-amber-400" />}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-heading font-medium">{project.title || 'Projet sans titre'}</td>
                            <td className="px-3 py-3 text-body">
                              <p className="font-medium text-heading">{getProjectTeamLabel(project, isAdmin)}</p>
                              <p className="text-[11px] text-muted">{getProjectCategoryLabel(project)}</p>
                            </td>
                            <td className="px-3 py-3">
                              {visual ? (
                                <img src={visual} alt={`Miniature ${project.title || 'projet'}`} className="w-11 h-11 rounded-lg object-cover border border-themed" />
                              ) : (
                                <div className="w-11 h-11 rounded-lg border border-themed bg-surface flex items-center justify-center text-[10px] font-semibold text-body">
                                  {getInitialsLabel(project.teamName || project.title)}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-body font-medium">{rankingMode === 'jury' ? judgeAverage.toFixed(2) : formatNumber(voteCount)}</td>
                            <td className="px-3 py-3 text-body">{formatNumber(likesCount)}</td>
                            <td className="px-3 py-3 text-body">{formatNumber(feedbackCount)}</td>
                            <td className="px-3 py-3 text-body">{formatEventDate(project.submittedAt)}</td>
                            <td className="px-3 py-3">
                              <Link
                                to={`/projects/${event.id}/project/${project.id}`}
                                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-primary-500/30 bg-primary-600/20 text-primary-200 hover:bg-primary-600/30 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Voir le projet
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'submit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-heading">Soumettre un projet</h2>
              {!event.participants.includes(user?.uid) && canParticipate && (
                <button onClick={handleRegister} className="btn-primary text-sm inline-flex items-center gap-1">
                  <UserPlus className="w-3.5 h-3.5" />
                  S'inscrire d'abord
                </button>
              )}
            </div>

            {!canParticipate ? (
              <p className="text-body">Ce buildathon est terminé: inscriptions et soumissions sont fermées.</p>
            ) : !event.participants.includes(user?.uid) ? (
              <p className="text-body">Vous devez d'abord vous inscrire au buildathon pour soumettre un projet.</p>
            ) : (
              <form onSubmit={handleSubmitProject} className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Titre du projet"
                    required
                    value={submitFormData.title}
                    onChange={(e) => setSubmitFormData({ ...submitFormData, title: e.target.value })}
                    className="w-full input-field"
                  />
                  <input
                    type="text"
                    placeholder="Nom de l'équipe"
                    required
                    value={submitFormData.teamName}
                    onChange={(e) => setSubmitFormData({ ...submitFormData, teamName: e.target.value })}
                    className="w-full input-field"
                  />
                </div>
                <textarea
                  placeholder="Description du projet"
                  value={submitFormData.description}
                  onChange={(e) => setSubmitFormData({ ...submitFormData, description: e.target.value })}
                  className="w-full input-field h-28 resize-none"
                />
                <div className="grid md:grid-cols-3 gap-3">
                  <select
                    value={submitFormData.category}
                    onChange={(e) => setSubmitFormData({ ...submitFormData, category: e.target.value })}
                    className="w-full input-field"
                  >
                    <option value="">Catégorie</option>
                    <option value="ai-ml">IA / ML</option>
                    <option value="web">Web</option>
                    <option value="mobile">Mobile</option>
                    <option value="cloud">Cloud</option>
                    <option value="data">Data</option>
                    <option value="other">Autre</option>
                  </select>
                  <input
                    type="url"
                    placeholder="Lien GitHub"
                    required
                    value={submitFormData.repoUrl}
                    onChange={(e) => setSubmitFormData({ ...submitFormData, repoUrl: e.target.value })}
                    className="w-full input-field"
                  />
                  <input
                    type="url"
                    placeholder="Lien démo / vidéo"
                    required
                    value={submitFormData.demoUrl}
                    onChange={(e) => setSubmitFormData({ ...submitFormData, demoUrl: e.target.value })}
                    className="w-full input-field"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={submitting} className="btn-primary text-sm flex items-center gap-1">
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {submitting ? 'Envoi...' : 'Soumettre'}
                  </button>
                  <button type="button" onClick={() => setActiveTab('overview')} className="btn-secondary text-sm">
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {activeTab === 'discussions' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-heading">Discussions</h2>
            {sortedProjects.length === 0 ? (
              <p className="text-body">Aucun projet disponible pour discussion pour le moment.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted">Chaque projet possède sa discussion dédiée (feedback/commentaires).</p>
                {sortedProjects.map((p) => (
                  <div key={p.id} className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-heading truncate">{p.title || 'Projet sans titre'}</p>
                      <p className="text-xs text-muted">{getProjectTeamLabel(p, isAdmin)} • {p.feedbackCount || p.commentsCount || 0} commentaire(s)</p>
                    </div>
                    <Link
                      to={`/projects/${event.id}/project/${p.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-primary-600/20 text-primary-300 border border-primary-500/30 hover:bg-primary-600/30 transition-colors"
                    >
                      Ouvrir la discussion
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-heading">Règles</h2>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted mb-1">Participation</p>
                <p className="text-sm text-body whitespace-pre-wrap break-words">{event.participationRules || 'Aucune règle de participation détaillée pour cet événement.'}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted mb-1">Critères d'évaluation</p>
                <p className="text-sm text-body whitespace-pre-wrap break-words">{event.evaluationCriteria || 'Aucun critère d\'évaluation détaillé pour cet événement.'}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted mb-1">Règle de départage</p>
                <p className="text-sm text-body whitespace-pre-wrap break-words">{event.tieBreakRuleText}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'management' && isAdmin && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-heading inline-flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary-400" />
              Gestion
            </h2>
            <p className="text-body">Administration Buildathon: activation du mode jury, critères, invitations et suivi des évaluations.</p>

            <div className="rounded-xl border border-themed bg-black/5 dark:bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-heading">Configuration du mode jury</h3>
                  <p className="text-xs text-muted">Le mode courant est {rankingMode === 'jury' ? 'Jury' : 'Public'}.</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${rankingMode === 'jury' ? 'border-primary-500/30 bg-primary-500/10 text-primary-200' : 'border-themed bg-black/10 text-muted'}`}>
                  {rankingMode === 'jury' ? 'Mode jury actif' : 'Mode public actif'}
                </span>
              </div>

              {rankingMode === 'jury' ? (
                <>
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    <label className="inline-flex items-center gap-2 text-body">
                      <input
                        type="checkbox"
                        checked={juryModeEnabled}
                        onChange={(e) => setJuryModeEnabled(e.target.checked)}
                      />
                      Activer le mode jury (classement Buildathon basé sur les notes des juges)
                    </label>
                    <label className="inline-flex items-center gap-2 text-body">
                      <input
                        type="checkbox"
                        checked={juryResultsPublished}
                        onChange={(e) => setJuryResultsPublished(e.target.checked)}
                      />
                      Publier les résultats jury
                    </label>
                  </div>
                  <div>
                    <label className="text-xs text-muted">Critères jury (une ligne = un critère, max 100 par critère)</label>
                    <textarea
                      value={judgeCriteriaDraft}
                      onChange={(e) => setJudgeCriteriaDraft(e.target.value)}
                      className="input-field w-full h-32 mt-1 resize-none"
                      placeholder={'Innovation\nImpact\nQualité technique\nClarté du projet\nDesign / UX\nDéploiement sur Cloud Run'}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveJuryConfig}
                      disabled={juryConfigSaving}
                      className="px-4 py-2 rounded-lg border border-primary-500/30 bg-primary-600/20 text-primary-200 text-sm disabled:opacity-60"
                    >
                      {juryConfigSaving ? 'Sauvegarde...' : 'Enregistrer la configuration jury'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-themed p-4 text-sm text-body">
                  Active le mode jury dans la configuration du Buildathon pour afficher ici la gestion des juges.
                </div>
              )}
            </div>

            {rankingMode === 'jury' && (
              <div className="rounded-xl border border-themed bg-black/5 dark:bg-white/5 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-heading">Gestion du jury</h3>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    value={judgeIdentifier}
                    onChange={(e) => setJudgeIdentifier(e.target.value)}
                    className="input-field flex-1 min-w-[220px]"
                    placeholder="Email ou UID utilisateur"
                  />
                  <button
                    type="button"
                    onClick={handleInviteJudge}
                    disabled={invitingJudge || !judgeIdentifier.trim()}
                    className="px-4 py-2 rounded-lg border border-primary-500/30 bg-primary-600/20 text-primary-200 text-sm disabled:opacity-60"
                  >
                    {invitingJudge ? 'Invitation...' : 'Inviter'}
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-themed p-3 bg-black/10 dark:bg-white/10 space-y-2">
                    <p className="text-muted mb-1">Invitations juges</p>
                    {judgeInvitations.length === 0 ? (
                      <p className="text-muted">Aucune invitation envoyée.</p>
                    ) : (
                      <div className="space-y-2">
                        {judgeInvitations.map((invitation) => (
                          <div key={invitation.id} className="rounded-lg border border-themed/60 bg-black/5 dark:bg-white/5 p-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-body truncate">{invitation.inviteeLabel || invitation.inviteeEmail || invitation.inviteeUid}</p>
                              <p className="text-muted text-[11px] capitalize">{invitation.status || 'pending'}</p>
                              <p className="text-muted text-[11px]">{formatEventDate(normalizeDateLike(invitation.createdAt) || invitation.createdAt)}</p>
                            </div>
                            <button
                              type="button"
                              className="text-red-400 hover:text-red-300 text-[11px]"
                              onClick={async () => {
                                try {
                                  const tasks = [
                                    deleteDoc(doc(db, 'buildathons', event.id, 'invitations', invitation.id)),
                                    deleteDoc(doc(db, 'buildathons', event.id, 'judgeInvitations', invitation.id)),
                                  ];
                                  if (invitation.status === 'accepted') {
                                    tasks.push(deleteDoc(doc(db, 'buildathons', event.id, 'judges', invitation.id)));
                                  }
                                  await Promise.all(tasks);
                                } catch {
                                  alert('Impossible de supprimer cette invitation');
                                }
                              }}
                            >
                              {invitation.status === 'accepted' ? 'Révoquer' : 'Supprimer'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-themed p-3 bg-black/10 dark:bg-white/10 space-y-2">
                    <p className="text-muted mb-1">Juges actifs</p>
                    {activeJudges.length === 0 ? (
                      <p className="text-muted">Aucun juge actif.</p>
                    ) : (
                      <div className="space-y-2">
                        {activeJudges.map((judge) => (
                          <div key={judge.id} className="rounded-lg border border-themed/60 bg-black/5 dark:bg-white/5 p-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-body truncate">{judge.displayName || judge.email || judge.userId || judge.id}</p>
                              <p className="text-muted text-[11px]">Accepté {formatEventDate(normalizeDateLike(judge.acceptedAt) || judge.acceptedAt)}</p>
                            </div>
                            <button
                              type="button"
                              className="text-red-400 hover:text-red-300 text-[11px]"
                              onClick={async () => {
                                try {
                                  await deleteDoc(doc(db, 'buildathons', event.id, 'judges', judge.id));
                                } catch {
                                  alert('Impossible de supprimer ce juge');
                                }
                              }}
                            >
                              Supprimer
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted">Projets</p>
                <p className="text-sm font-medium text-heading">{projects.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted">Mode classement Buildathon</p>
                <p className="text-sm font-medium text-heading">{rankingMode === 'jury' ? 'Jury' : 'Public'}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-themed">
                <p className="text-xs text-muted">Résultats jury</p>
                <p className="text-sm font-medium text-heading">{juryResultsPublished ? 'Publiés' : 'Brouillon'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-themed bg-black/5 dark:bg-white/5 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-heading">Notes par projet</h3>
              {rankingProjects.length === 0 ? (
                <p className="text-xs text-muted">Aucun projet à afficher.</p>
              ) : (
                <div className="space-y-1">
                  {rankingProjects.map((project, index) => (
                    <div key={project.id} className="flex items-center justify-between gap-3 text-xs border-b border-themed/40 py-1.5 last:border-b-0">
                      <p className="text-body truncate">#{index + 1} {project.title || 'Projet sans titre'}</p>
                      <p className="text-muted whitespace-nowrap">
                        Jury: {Number(project.judgeScoreAverage || 0).toFixed(2)} ({Number(project.judgeScoreCount || 0)} note(s))
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
