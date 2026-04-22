import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  arrayUnion,
  increment,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import AdminBuildathonEventForm from '../components/buildathon/AdminBuildathonEventForm';
import toast from 'react-hot-toast';
import {
  Trophy,
  Plus,
  Pencil,
  Trash2,
  ThumbsUp,
  Loader2,
  Search,
  Crown,
  Calendar,
  Link2,
  FileText,
  X,
  Send,
  Sparkles,
  Clock,
  Users,
  Zap,
  Award,
  CheckCircle,
  Timer,
  ChevronDown,
  ChevronUp,
  Globe,
  Video,
  Rocket,
  UserPlus,
  Mail,
  UserCheck,
  XCircle,
  Gift,
} from 'lucide-react';

const EVENT_TYPES = [
  { value: 'buildathon', label: 'Buildathon', icon: '🏗️' },
  { value: 'hackathon', label: 'Hackathon', icon: '💻' },
];

const PROJECT_CATEGORIES = [
  { value: 'ai-ml', label: 'IA / ML', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { value: 'web', label: 'Web', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: 'mobile', label: 'Mobile', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
  { value: 'cloud', label: 'Cloud', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { value: 'data', label: 'Data', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  { value: 'other', label: 'Autre', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
];

function getEventStatus(b) {
  const now = new Date();
  const startDate = b.startDate ? new Date(b.startDate) : null;
  const voteEndDate = getEffectiveEventEndDate(b);

  if (startDate && startDate > now) return 'upcoming';
  if (voteEndDate && voteEndDate < now) return 'completed';
  return 'active';
}

const STATUS_CONFIG = {
  upcoming: { label: 'À venir', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
  active: { label: 'En cours', color: 'bg-green-500/10 text-green-400 border-green-500/30', dot: 'bg-green-400' },
  ended: { label: 'Vote ouvert', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', dot: 'bg-amber-400' },
  completed: { label: 'Terminé', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30', dot: 'bg-gray-400' },
};

const DEFAULT_PRIZES = [
  { place: 1, rewardType: 'points', points: '50', label: '' },
  { place: 2, rewardType: 'points', points: '30', label: '' },
  { place: 3, rewardType: 'points', points: '10', label: '' },
];

function toInputDateTime(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    // Preserve local datetime strings as-is to avoid timezone drift in datetime-local inputs.
    const localNoTimezonePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;
    if (localNoTimezonePattern.test(value)) {
      return value.slice(0, 16);
    }
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatEventDate(value) {
  if (!value) return 'Date non définie';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date non définie';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function getEffectiveEventEndDate(event) {
  const candidateDates = [event?.voteEndDate, event?.submissionEndDate, event?.endDate]
    .map((value) => (value ? new Date(value) : null))
    .filter((date) => date && !Number.isNaN(date.getTime()));

  if (candidateDates.length === 0) return null;
  return candidateDates.reduce((latest, current) => (current > latest ? current : latest));
}

function normalizePrizeInput(prize, idx) {
  const rewardType = prize.rewardType || 'points';
  const pointsRaw = rewardType === 'points' ? String(prize.points ?? '').trim() : '';
  const points = pointsRaw === '' ? 0 : Number(pointsRaw);
  return {
    place: prize.place || idx + 1,
    rewardType,
    points: Number.isFinite(points) ? points : 0,
    label: (prize.label || '').trim(),
  };
}

function normalizeDateLike(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?.toDate && typeof value.toDate === 'function') {
    const asDate = value.toDate();
    return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
  }
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
}

const DEFAULT_BUILDATHON_CONFIG = {
  votingEnabled: true,
  maxVotesPerUser: 1,
  allowSelfVote: false,
  shortDescription: '',
  fullDescription: '',
  coverImageUrl: '',
  submissionStartDate: null,
  submissionEndDate: null,
  voteStartDate: null,
  voteEndDate: null,
  participationRules: '',
  evaluationCriteria: '',
  tieBreakRuleText: 'En cas d\'égalité, le projet soumis le plus tôt est prioritaire.',
  rewardsVisible: true,
  projectVisibility: 'published-only',
  submissionOpen: true,
  publicationStatus: 'published',
  juryModeEnabled: false,
  juryResultsPublished: false,
  rankingMode: 'public',
  judgeCriteria: [],
};

const DEFAULT_BUILDATHON_PROJECT_META = {
  projectStatus: 'soumis',
  moderationStatus: 'pending',
  moderationNote: '',
  isPublished: false,
  isPublic: false,
  likesCount: 0,
  commentsCount: 0,
  feedbackCount: 0,
  likeUserIds: [],
  validatedAt: null,
  validatedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  publishedAt: null,
  publishedBy: null,
};

const PROJECT_STATUSES = ['brouillon', 'soumis', 'valide', 'rejete', 'publie'];

function getCanonicalProjectStatus(project = {}) {
  const raw = String(project.projectStatus || '').toLowerCase();
  const normalizedRaw = raw
    .replace('é', 'e')
    .replace('à', 'a')
    .replace('û', 'u')
    .trim();

  if (normalizedRaw === 'brouillon' || normalizedRaw === 'draft') return 'brouillon';
  if (normalizedRaw === 'soumis' || normalizedRaw === 'submitted' || normalizedRaw === 'pending') return 'soumis';
  if (normalizedRaw === 'valide' || normalizedRaw === 'validated' || normalizedRaw === 'approved') return 'valide';
  if (normalizedRaw === 'rejete' || normalizedRaw === 'rejected') return 'rejete';
  if (normalizedRaw === 'publie' || normalizedRaw === 'published') return 'publie';

  // Legacy fallback mapping for old documents.
  if (project?.moderationStatus === 'rejected') return 'rejete';
  if (project?.isPublished === true || project?.isPublic === true) return 'publie';
  if (project?.moderationStatus === 'approved') return 'valide';
  return 'soumis';
}

function getModerationStatusFromProjectStatus(projectStatus) {
  if (projectStatus === 'valide' || projectStatus === 'publie') return 'approved';
  if (projectStatus === 'rejete') return 'rejected';
  return 'pending';
}

function getProjectStatusBadge(status) {
  if (status === 'publie') return { label: 'Publie', className: 'bg-green-500/10 text-green-400 border-green-500/30' };
  if (status === 'valide') return { label: 'Valide', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
  if (status === 'rejete') return { label: 'Rejete', className: 'bg-red-500/10 text-red-400 border-red-500/30' };
  if (status === 'brouillon') return { label: 'Brouillon', className: 'bg-gray-500/10 text-gray-400 border-gray-500/30' };
  return { label: 'Soumis', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
}

function isProjectOwnerOrMember(project, uid) {
  if (!uid) return false;
  if (project?.submittedBy === uid) return true;
  return Array.isArray(project?.members) && project.members.some((member) => member?.uid === uid);
}

function isProjectVisibleForParticipant(project, event, uid) {
  const status = getCanonicalProjectStatus(project);
  const isOwner = isProjectOwnerOrMember(project, uid);
  if (isOwner) return true;

  if (status === 'rejete') return false;

  if ((event?.projectVisibility || 'published-only') === 'all-submitted') {
    return status !== 'brouillon';
  }

  // Validation/publication-gated mode.
  return status === 'publie';
}

function normalizeBuildathonEvent(event) {
  const safeVoteStartDate = normalizeDateLike(event.voteStartDate) || normalizeDateLike(event.startDate);
  const safeVoteEndDate = normalizeDateLike(event.voteEndDate) || normalizeDateLike(event.endDate);

  return {
    ...event,
    shortDescription: event.shortDescription || '',
    fullDescription: event.fullDescription || event.description || '',
    coverImageUrl: event.coverImageUrl || '',
    votingEnabled: event.votingEnabled !== false,
    maxVotesPerUser: 1,
    allowSelfVote: event.allowSelfVote === true,
    submissionStartDate: normalizeDateLike(event.submissionStartDate) || normalizeDateLike(event.startDate),
    submissionEndDate: normalizeDateLike(event.submissionEndDate) || normalizeDateLike(event.endDate),
    voteStartDate: safeVoteStartDate,
    voteEndDate: safeVoteEndDate,
    participationRules: event.participationRules || '',
    evaluationCriteria: event.evaluationCriteria || '',
    tieBreakRuleText: event.tieBreakRuleText || 'En cas d\'égalité, le projet soumis le plus tôt est prioritaire.',
    rewardsVisible: event.rewardsVisible !== false,
    projectVisibility: event.projectVisibility || 'published-only',
    submissionOpen: event.submissionOpen !== false,
    publicationStatus: event.publicationStatus || 'published',
    juryModeEnabled: event.juryModeEnabled === true,
    juryResultsPublished: event.juryResultsPublished === true,
    rankingMode: event.rankingMode || 'public',
    judgeCriteria: Array.isArray(event.judgeCriteria) ? event.judgeCriteria : [],
    finalizationAwards: Array.isArray(event.finalizationAwards) ? event.finalizationAwards : [],
  };
}

function normalizeBuildathonProject(project) {
  const votes = Array.isArray(project.votes) ? project.votes : [];
  const voteCountRaw = Number(project.voteCount);
  const voteCount = Number.isFinite(voteCountRaw) ? voteCountRaw : votes.length;
  const projectStatus = getCanonicalProjectStatus(project);

  return {
    ...project,
    votes,
    voteCount,
    projectStatus,
    moderationStatus: getModerationStatusFromProjectStatus(projectStatus),
    moderationNote: project.moderationNote || '',
    isPublished: projectStatus === 'publie' ? true : project.isPublished === true,
    isPublic: projectStatus === 'publie' ? true : project.isPublic === true,
    likesCount: Number.isFinite(Number(project.likesCount)) ? Number(project.likesCount) : 0,
    commentsCount: Number.isFinite(Number(project.commentsCount)) ? Number(project.commentsCount) : 0,
    feedbackCount: Number.isFinite(Number(project.feedbackCount)) ? Number(project.feedbackCount) : 0,
    likeUserIds: Array.isArray(project.likeUserIds) ? project.likeUserIds : [],
  };
}

function toTimestampMs(value) {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value?.toDate && typeof value.toDate === 'function') {
    const d = value.toDate();
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

function getProjectSubmissionTimestamp(project) {
  const submittedAt = toTimestampMs(project?.submittedAt);
  if (submittedAt !== null) return submittedAt;

  const createdAt = toTimestampMs(project?.createdAt);
  if (createdAt !== null) return createdAt;

  // Backward compatibility: unknown submission time should rank after known dates.
  return Number.MAX_SAFE_INTEGER;
}

function formatProjectSubmittedAt(value) {
  if (!value) return 'Non defini';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Non defini';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function compareProjectsForRanking(a, b) {
  const voteDiff = (b?.voteCount || 0) - (a?.voteCount || 0);
  if (voteDiff !== 0) return voteDiff;

  const timeDiff = getProjectSubmissionTimestamp(a) - getProjectSubmissionTimestamp(b);
  if (timeDiff !== 0) return timeDiff;

  // Stable final fallback for deterministic ordering when data is incomplete.
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function compareProjectsForJudgeRanking(a, b) {
  const judgeDiff = Number(b?.judgeScoreAverage || 0) - Number(a?.judgeScoreAverage || 0);
  if (judgeDiff !== 0) return judgeDiff;

  const timeDiff = getProjectSubmissionTimestamp(a) - getProjectSubmissionTimestamp(b);
  if (timeDiff !== 0) return timeDiff;

  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function sortProjectsForRanking(projectList = []) {
  return [...projectList].sort(compareProjectsForRanking);
}

function sortProjectsForEventRanking(event, projectList = []) {
  const rankingMode = event?.juryModeEnabled === true || event?.rankingMode === 'jury' ? 'jury' : 'public';
  return rankingMode === 'jury'
    ? [...projectList].sort(compareProjectsForJudgeRanking)
    : [...projectList].sort(compareProjectsForRanking);
}

export default function Buildathon() {
  const { user, userProfile, isAdmin } = useAuth();
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [filterPopularity, setFilterPopularity] = useState('all');

  // Admin: create event
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    type: 'buildathon',
    title: '',
    description: '',
    status: 'active',
    startDate: '',
    endDate: '',
    workDuration: '',
    maxTeamSize: 4,
    prizes: DEFAULT_PRIZES,
    ...DEFAULT_BUILDATHON_CONFIG,
  });
  const [showEditEvent, setShowEditEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editEvent, setEditEvent] = useState({
    type: 'buildathon',
    title: '',
    description: '',
    status: 'active',
    startDate: '',
    endDate: '',
    workDuration: '',
    maxTeamSize: 4,
    prizes: DEFAULT_PRIZES,
    ...DEFAULT_BUILDATHON_CONFIG,
  });

  // User: submit project
  const [showSubmitProject, setShowSubmitProject] = useState(null);
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    category: 'ai-ml',
    teamName: '',
    repoUrl: '',
    demoUrl: '',
    inviteIdentifier: '',
  });

  const [showAdminProjectForm, setShowAdminProjectForm] = useState(null);
  const [adminProject, setAdminProject] = useState({
    userIdentifier: '',
    title: '',
    description: '',
    category: 'web',
    teamName: '',
    repoUrl: '',
    demoUrl: '',
  });
  const [invitations, setInvitations] = useState([]);
  const [moderationNotes, setModerationNotes] = useState({});

  useEffect(() => {
    const unsubEvents = onSnapshot(
      query(collection(db, 'buildathons'), orderBy('createdAt', 'desc')),
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push(normalizeBuildathonEvent({ id: d.id, ...d.data() })));
        setEvents(data);
        setLoading(false);
      },
      (err) => { console.error('Events error:', err); setLoading(false); },
    );

    const unsubProjects = onSnapshot(
      collection(db, 'buildathonProjects'),
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push(normalizeBuildathonProject({ id: d.id, ...d.data() })));
        setProjects(data);
      },
      (err) => console.error('Projects error:', err),
    );

    // Listen for invitations addressed to current user
    let unsubInvitations = () => {};
    if (user?.uid) {
      unsubInvitations = onSnapshot(
        query(collection(db, 'projectInvitations'), where('invitedUid', '==', user.uid), where('status', '==', 'pending')),
        (snap) => {
          const data = [];
          snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
          setInvitations(data);
        },
        (err) => console.error('Invitations error:', err),
      );
    }

    return () => { unsubEvents(); unsubProjects(); unsubInvitations(); };
  }, [user?.uid]);

  // ---- Admin: Create Event ----
  async function handleCreateEvent(e) {
    e.preventDefault();
    if (!newEvent.title || !newEvent.startDate || !newEvent.endDate) {
      toast.error('Titre, date de début et date de fin sont obligatoires');
      return;
    }
    try {
      const normalizedPrizes = (newEvent.prizes || [])
        .map((p, i) => normalizePrizeInput(p, i))
        .filter((p) => (p.rewardType === 'points' ? p.points > 0 : Boolean(p.label)));
      const id = `event-${Date.now().toString(36)}`;
      await setDoc(doc(db, 'buildathons', id), {
        type: newEvent.type,
        title: newEvent.title,
        shortDescription: (newEvent.shortDescription || '').trim(),
        fullDescription: (newEvent.fullDescription || '').trim(),
        description: (newEvent.fullDescription || newEvent.shortDescription || newEvent.description || '').trim(),
        coverImageUrl: (newEvent.coverImageUrl || '').trim(),
        status: newEvent.status || 'active',
        startDate: newEvent.startDate,
        endDate: newEvent.endDate,
        submissionStartDate: normalizeDateLike(newEvent.submissionStartDate) || normalizeDateLike(newEvent.startDate),
        submissionEndDate: normalizeDateLike(newEvent.submissionEndDate) || normalizeDateLike(newEvent.endDate),
        workDuration: newEvent.workDuration,
        maxTeamSize: Number(newEvent.maxTeamSize) || 4,
        prizes: normalizedPrizes,
        votingEnabled: newEvent.votingEnabled !== false,
        maxVotesPerUser: 1,
        allowSelfVote: newEvent.allowSelfVote === true,
        voteStartDate: normalizeDateLike(newEvent.voteStartDate) || normalizeDateLike(newEvent.startDate),
        voteEndDate: normalizeDateLike(newEvent.voteEndDate) || normalizeDateLike(newEvent.endDate),
        participationRules: (newEvent.participationRules || '').trim(),
        evaluationCriteria: (newEvent.evaluationCriteria || '').trim(),
        tieBreakRuleText: (newEvent.tieBreakRuleText || '').trim() || 'En cas d\'égalité, le projet soumis le plus tôt est prioritaire.',
        rewardsVisible: newEvent.rewardsVisible !== false,
        projectVisibility: newEvent.projectVisibility || 'published-only',
        submissionOpen: newEvent.submissionOpen !== false,
        publicationStatus: newEvent.publicationStatus || 'published',
        juryModeEnabled: newEvent.juryModeEnabled === true,
        juryResultsPublished: newEvent.juryResultsPublished === true,
        rankingMode: newEvent.juryModeEnabled ? 'jury' : 'public',
        judgeCriteria: Array.isArray(newEvent.judgeCriteria) ? newEvent.judgeCriteria : [],
        participants: [],
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        archivedAt: null,
        publishedAt: serverTimestamp(),
        finalized: false,
      });
      toast.success(`${newEvent.type === 'hackathon' ? 'Hackathon' : 'Buildathon'} créé !`);
      setShowCreateEvent(false);
      setNewEvent({ type: 'buildathon', title: '', description: '', status: 'active', startDate: '', endDate: '', workDuration: '', maxTeamSize: 4, prizes: DEFAULT_PRIZES, ...DEFAULT_BUILDATHON_CONFIG });
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  // ---- Admin: Edit Event ----
  function handleOpenEditEvent(event) {
    setEditingEventId(event.id);
    setEditEvent({
      type: event.type || 'buildathon',
      title: event.title || '',
      description: event.description || '',
      shortDescription: event.shortDescription || '',
      fullDescription: event.fullDescription || event.description || '',
      coverImageUrl: event.coverImageUrl || '',
      status: event.status || 'active',
      startDate: toInputDateTime(event.startDate),
      endDate: toInputDateTime(event.endDate),
      submissionStartDate: toInputDateTime(event.submissionStartDate || event.startDate),
      submissionEndDate: toInputDateTime(event.submissionEndDate || event.endDate),
      workDuration: event.workDuration || '',
      maxTeamSize: Number(event.maxTeamSize) || 4,
      votingEnabled: event.votingEnabled !== false,
      maxVotesPerUser: 1,
      allowSelfVote: event.allowSelfVote === true,
      voteStartDate: toInputDateTime(event.voteStartDate || event.startDate),
      voteEndDate: toInputDateTime(event.voteEndDate || event.endDate),
      participationRules: event.participationRules || '',
      evaluationCriteria: event.evaluationCriteria || '',
      tieBreakRuleText: event.tieBreakRuleText || 'En cas d\'égalité, le projet soumis le plus tôt est prioritaire.',
      rewardsVisible: event.rewardsVisible !== false,
      projectVisibility: event.projectVisibility || 'published-only',
      submissionOpen: event.submissionOpen !== false,
      publicationStatus: event.publicationStatus || 'published',
      juryModeEnabled: event.juryModeEnabled === true,
      juryResultsPublished: event.juryResultsPublished === true,
      judgeCriteria: Array.isArray(event.judgeCriteria) ? event.judgeCriteria : [],
      prizes: (event.prizes && event.prizes.length > 0)
        ? [...event.prizes]
            .sort((a, b) => a.place - b.place)
            .map((p) => ({
              place: p.place,
              rewardType: p.rewardType || 'points',
              points: p.rewardType === 'points' || !p.rewardType ? String(p.points ?? '') : '',
              label: p.label || '',
            }))
        : DEFAULT_PRIZES,
    });
    setShowEditEvent(true);
  }

  async function handleUpdateEvent(e) {
    e.preventDefault();
    if (!editingEventId) return;
    if (!editEvent.title || !editEvent.startDate || !editEvent.endDate) {
      toast.error('Titre, date de début et date de fin sont obligatoires');
      return;
    }
    try {
      const normalizedPrizes = (editEvent.prizes || [])
        .map((p, i) => normalizePrizeInput(p, i))
        .filter((p) => (p.rewardType === 'points' ? p.points > 0 : Boolean(p.label)));
      await updateDoc(doc(db, 'buildathons', editingEventId), {
        type: editEvent.type,
        title: editEvent.title,
        shortDescription: (editEvent.shortDescription || '').trim(),
        fullDescription: (editEvent.fullDescription || '').trim(),
        description: (editEvent.fullDescription || editEvent.shortDescription || editEvent.description || '').trim(),
        coverImageUrl: (editEvent.coverImageUrl || '').trim(),
        status: editEvent.status || 'active',
        startDate: editEvent.startDate,
        endDate: editEvent.endDate,
        submissionStartDate: normalizeDateLike(editEvent.submissionStartDate) || normalizeDateLike(editEvent.startDate),
        submissionEndDate: normalizeDateLike(editEvent.submissionEndDate) || normalizeDateLike(editEvent.endDate),
        workDuration: editEvent.workDuration,
        maxTeamSize: Number(editEvent.maxTeamSize) || 4,
        prizes: normalizedPrizes,
        votingEnabled: editEvent.votingEnabled !== false,
        maxVotesPerUser: 1,
        allowSelfVote: editEvent.allowSelfVote === true,
        voteStartDate: normalizeDateLike(editEvent.voteStartDate) || normalizeDateLike(editEvent.startDate),
        voteEndDate: normalizeDateLike(editEvent.voteEndDate) || normalizeDateLike(editEvent.endDate),
        participationRules: (editEvent.participationRules || '').trim(),
        evaluationCriteria: (editEvent.evaluationCriteria || '').trim(),
        tieBreakRuleText: (editEvent.tieBreakRuleText || '').trim() || 'En cas d\'égalité, le projet soumis le plus tôt est prioritaire.',
        rewardsVisible: editEvent.rewardsVisible !== false,
        projectVisibility: editEvent.projectVisibility || 'published-only',
        submissionOpen: editEvent.submissionOpen !== false,
        publicationStatus: editEvent.publicationStatus || 'published',
        juryModeEnabled: editEvent.juryModeEnabled === true,
        juryResultsPublished: editEvent.juryResultsPublished === true,
        rankingMode: editEvent.juryModeEnabled ? 'jury' : 'public',
        judgeCriteria: Array.isArray(editEvent.judgeCriteria) ? editEvent.judgeCriteria : [],
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      toast.success('Événement mis à jour avec succès');
      setShowEditEvent(false);
      setEditingEventId(null);
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  async function resolveUserByIdentifier(identifier) {
    const raw = (identifier || '').trim();
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    const shortId = raw.toUpperCase().replace(/^UZA-/, '');

    const usersSnap = await getDocs(collection(db, 'users'));
    let match = null;
    usersSnap.forEach((d) => {
      if (match) return;
      const data = d.data();
      const uid = d.id;
      const generatedShort = `UZA-${uid.slice(0, 8).toUpperCase()}`;
      const uniqueId = (data.uniqueId || '').toUpperCase();
      const email = (data.email || '').toLowerCase();
      const displayName = (data.displayName || '').toLowerCase();

      if (
        email === normalized ||
        uid.toLowerCase() === normalized ||
        uniqueId === raw.toUpperCase() ||
        generatedShort === raw.toUpperCase() ||
        uid.slice(0, 8).toUpperCase() === shortId ||
        displayName === normalized
      ) {
        match = {
          uid,
          name: data.displayName || data.email || uid,
          email: data.email || '',
          uniqueId: data.uniqueId || generatedShort,
        };
      }
    });
    return match;
  }

  async function handleAdminAddProject(eventId) {
    if (!adminProject.userIdentifier || !adminProject.title || !adminProject.teamName || !adminProject.repoUrl || !adminProject.demoUrl) {
      toast.error('Complétez utilisateur, titre, équipe, GitHub et démo');
      return;
    }
    if (!isValidGitHubRepoUrl(adminProject.repoUrl)) {
      toast.error('Le lien GitHub doit être un dépôt valide (https://github.com/owner/repo)');
      return;
    }
    if (!isValidDemoUrl(adminProject.demoUrl)) {
      toast.error('Le lien démo doit être une URL HTTPS valide');
      return;
    }
    try {
      const targetUser = await resolveUserByIdentifier(adminProject.userIdentifier);
      if (!targetUser?.uid) {
        toast.error('Utilisateur introuvable (email ou ID UZA...)');
        return;
      }

      const id = `project-${Date.now().toString(36)}-${targetUser.uid.slice(0, 6)}`;
      await setDoc(doc(db, 'buildathonProjects', id), {
        buildathonId: eventId,
        title: adminProject.title,
        description: adminProject.description,
        category: adminProject.category,
        teamName: adminProject.teamName,
        repoUrl: adminProject.repoUrl.trim(),
        demoUrl: adminProject.demoUrl.trim(),
        members: [{ uid: targetUser.uid, name: targetUser.name, email: targetUser.email }],
        votes: [],
        voteCount: 0,
        likesCount: 0,
        commentsCount: 0,
        feedbackCount: 0,
        likeUserIds: [],
        projectStatus: 'publie',
        moderationStatus: 'approved',
        moderationNote: '',
        isPublished: true,
        isPublic: true,
        validatedAt: serverTimestamp(),
        validatedBy: user.uid,
        rejectedAt: null,
        rejectedBy: null,
        publishedAt: serverTimestamp(),
        publishedBy: user.uid,
        submittedBy: targetUser.uid,
        submittedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'buildathons', eventId), { participants: arrayUnion(targetUser.uid) });
      toast.success(`Projet ajouté pour ${targetUser.name}`);
      setShowAdminProjectForm(null);
      setAdminProject({ userIdentifier: '', title: '', description: '', category: 'web', teamName: '', repoUrl: '', demoUrl: '' });
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  async function handleGrantProjectBonus(eventId, projectId, rankIndex) {
    if (!isAdmin || !user?.uid) return;
    const event = events.find((e) => e.id === eventId);
    const project = projects.find((p) => p.id === projectId);
    if (!event || !project || project.manualPrizeGrantedAt) return;

    const sortedPrizes = [...(event.prizes || [])].sort((a, b) => a.place - b.place);
    const prize = sortedPrizes[rankIndex];
    if (!prize || (prize.rewardType || 'points') !== 'points') return;

    const totalPoints = Number(prize.points || 0);
    if (totalPoints <= 0) return;

    const memberCount = project.members?.length || 1;
    const pointsPerMember = Math.round(totalPoints / memberCount);
    if (pointsPerMember <= 0) return;

    try {
      const grantedEntries = [];
      for (const member of project.members || []) {
        if (!member.uid) continue;
        const userRef = doc(db, 'users', member.uid);
        await updateDoc(userRef, { bonusPoints: increment(pointsPerMember) });
        const logRef = doc(collection(db, 'users', member.uid, 'bonusLogs'));
        await setDoc(logRef, {
          points: pointsPerMember,
          reason: `${event.type === 'hackathon' ? 'Hackathon' : 'Buildathon'} "${event.title}" - Attribution manuelle place ${rankIndex + 1} (${totalPoints} pts à ${memberCount} membre${memberCount > 1 ? 's' : ''})`,
          grantedBy: user.uid,
          grantedAt: serverTimestamp(),
          source: 'buildathon-manual-bonus',
          buildathonId: eventId,
          projectId,
        });
        grantedEntries.push({ uid: member.uid, points: pointsPerMember });
      }

      await updateDoc(doc(db, 'buildathonProjects', projectId), {
        manualPrizeGrantedAt: serverTimestamp(),
        manualPrizeGrantedBy: user.uid,
        manualPrizeGrantedPoints: totalPoints,
        manualPrizeLogEntries: grantedEntries,
        manualPrizeRevokedAt: null,
        manualPrizeRevokedBy: null,
      });
      toast.success(`Bonus attribué: +${totalPoints} pts`);
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  async function handleRevokeProjectBonus(eventId, projectId, rankIndex) {
    if (!isAdmin || !user?.uid) return;
    const event = events.find((e) => e.id === eventId);
    const project = projects.find((p) => p.id === projectId);
    if (!event || !project || !project.manualPrizeGrantedAt) return;

    const savedEntries = Array.isArray(project.manualPrizeLogEntries) ? project.manualPrizeLogEntries : [];
    let entriesToRevoke = savedEntries.filter((entry) => entry?.uid && Number(entry?.points) > 0);

    if (entriesToRevoke.length === 0) {
      const sortedPrizes = [...(event.prizes || [])].sort((a, b) => a.place - b.place);
      const prize = sortedPrizes[rankIndex];
      const totalPoints = Number(prize?.points || 0);
      const memberCount = project.members?.length || 1;
      const pointsPerMember = Math.round(totalPoints / memberCount);
      if (pointsPerMember <= 0) {
        toast.error('Impossible de calculer les points à retirer');
        return;
      }
      entriesToRevoke = (project.members || [])
        .filter((member) => member?.uid)
        .map((member) => ({ uid: member.uid, points: pointsPerMember }));
    }

    try {
      for (const entry of entriesToRevoke) {
        await updateDoc(doc(db, 'users', entry.uid), { bonusPoints: increment(-Math.abs(Number(entry.points || 0))) });
        const logRef = doc(collection(db, 'users', entry.uid, 'bonusLogs'));
        await setDoc(logRef, {
          points: -Math.abs(Number(entry.points || 0)),
          reason: `${event.type === 'hackathon' ? 'Hackathon' : 'Buildathon'} "${event.title}" - Annulation bonus manuel`,
          grantedBy: user.uid,
          grantedAt: serverTimestamp(),
          source: 'buildathon-manual-bonus-revoke',
          buildathonId: eventId,
          projectId,
        });
      }

      await updateDoc(doc(db, 'buildathonProjects', projectId), {
        manualPrizeGrantedAt: null,
        manualPrizeGrantedBy: null,
        manualPrizeGrantedPoints: 0,
        manualPrizeLogEntries: [],
        manualPrizeRevokedAt: serverTimestamp(),
        manualPrizeRevokedBy: user.uid,
      });
      toast.success('Bonus manuel annulé');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!confirm('Supprimer cet événement ? Cette action supprimera aussi les projets et invitations liés.')) return;
    try {
      const projectSnap = await getDocs(query(collection(db, 'buildathonProjects'), where('buildathonId', '==', eventId)));
      for (const projectDoc of projectSnap.docs) {
        await deleteDoc(doc(db, 'buildathonProjects', projectDoc.id));
      }

      const inviteSnap = await getDocs(query(collection(db, 'projectInvitations'), where('buildathonId', '==', eventId)));
      for (const inviteDoc of inviteSnap.docs) {
        await deleteDoc(doc(db, 'projectInvitations', inviteDoc.id));
      }

      await deleteDoc(doc(db, 'buildathons', eventId));
      toast.success('Événement supprimé');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  async function handleModerateProject(project, targetStatus) {
    if (!isAdmin || !user?.uid || !project?.id) return;
    if (!PROJECT_STATUSES.includes(targetStatus)) return;

    const currentStatus = getCanonicalProjectStatus(project);
    if (currentStatus === targetStatus) return;

    if (targetStatus === 'publie' && currentStatus !== 'valide') {
      toast.error('Un projet doit etre valide avant publication');
      return;
    }

    const note = (moderationNotes[project.id] ?? project.moderationNote ?? '').trim();
    const payload = {
      projectStatus: targetStatus,
      moderationStatus: getModerationStatusFromProjectStatus(targetStatus),
      moderationNote: note,
      updatedAt: serverTimestamp(),
      moderatedBy: user.uid,
      moderatedAt: serverTimestamp(),
      isPublished: targetStatus === 'publie',
      isPublic: targetStatus === 'publie',
    };

    if (targetStatus === 'valide') {
      payload.validatedAt = serverTimestamp();
      payload.validatedBy = user.uid;
      payload.rejectedAt = null;
      payload.rejectedBy = null;
      if (currentStatus === 'publie') {
        payload.publishedAt = null;
        payload.publishedBy = null;
      }
    }

    if (targetStatus === 'rejete') {
      payload.rejectedAt = serverTimestamp();
      payload.rejectedBy = user.uid;
      payload.publishedAt = null;
      payload.publishedBy = null;
    }

    if (targetStatus === 'publie') {
      payload.publishedAt = serverTimestamp();
      payload.publishedBy = user.uid;
      payload.validatedAt = project.validatedAt || serverTimestamp();
      payload.validatedBy = project.validatedBy || user.uid;
    }

    try {
      await updateDoc(doc(db, 'buildathonProjects', project.id), payload);
      toast.success(`Projet passe a l'etat ${getProjectStatusBadge(targetStatus).label}`);
    } catch (err) {
      toast.error('Erreur moderation: ' + err.message);
    }
  }

  // ---- User: Register ----
  async function handleRegister(eventId) {
    try {
      await updateDoc(doc(db, 'buildathons', eventId), { participants: arrayUnion(user.uid) });
      toast.success('Inscrit avec succès !');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  // ---- User: Submit Project (GitHub + demo video mandatory) ----
  async function handleSubmitProject(eventId) {
    if (!newProject.title || !newProject.teamName) {
      toast.error('Le titre et le nom d\'équipe sont obligatoires');
      return;
    }
    if (!newProject.repoUrl) {
      toast.error('Le lien GitHub est obligatoire');
      return;
    }
    if (!newProject.demoUrl) {
      toast.error('Le lien vidéo démo est obligatoire');
      return;
    }
    if (!isValidGitHubRepoUrl(newProject.repoUrl)) {
      toast.error('Le lien GitHub doit être un dépôt valide (https://github.com/owner/repo)');
      return;
    }
    if (!isValidDemoUrl(newProject.demoUrl)) {
      toast.error('Le lien vidéo démo doit être une URL HTTPS valide');
      return;
    }
    try {
      const id = `project-${Date.now().toString(36)}-${user.uid.slice(0, 6)}`;
      await setDoc(doc(db, 'buildathonProjects', id), {
        buildathonId: eventId,
        title: newProject.title,
        description: newProject.description,
        category: newProject.category,
        teamName: newProject.teamName,
        repoUrl: newProject.repoUrl.trim(),
        demoUrl: newProject.demoUrl.trim(),
        members: [{ uid: user.uid, name: userProfile?.displayName || user.email, email: user.email }],
        votes: [],
        voteCount: 0,
        likesCount: 0,
        commentsCount: 0,
        feedbackCount: 0,
        likeUserIds: [],
        projectStatus: DEFAULT_BUILDATHON_PROJECT_META.projectStatus,
        moderationStatus: DEFAULT_BUILDATHON_PROJECT_META.moderationStatus,
        moderationNote: DEFAULT_BUILDATHON_PROJECT_META.moderationNote,
        isPublished: DEFAULT_BUILDATHON_PROJECT_META.isPublished,
        isPublic: DEFAULT_BUILDATHON_PROJECT_META.isPublic,
        validatedAt: DEFAULT_BUILDATHON_PROJECT_META.validatedAt,
        validatedBy: DEFAULT_BUILDATHON_PROJECT_META.validatedBy,
        rejectedAt: DEFAULT_BUILDATHON_PROJECT_META.rejectedAt,
        rejectedBy: DEFAULT_BUILDATHON_PROJECT_META.rejectedBy,
        publishedAt: DEFAULT_BUILDATHON_PROJECT_META.publishedAt,
        publishedBy: DEFAULT_BUILDATHON_PROJECT_META.publishedBy,
        submittedBy: user.uid,
        submittedAt: serverTimestamp(),
      });
      toast.success('Projet soumis !');
      setShowSubmitProject(null);
      setNewProject({ title: '', description: '', category: 'ai-ml', teamName: '', repoUrl: '', demoUrl: '', inviteIdentifier: '' });
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  // ---- User: Vote (1 vote per user per event, 1 vote = 10 pts) ----
  async function handleVote(projectId, buildathonId, currentVotes) {
    if (!user) return;
    const hasVoted = currentVotes?.includes(user.uid);

    if (!hasVoted) {
      const eventProjects = projects.filter((p) => p.buildathonId === buildathonId);
      const alreadyVoted = eventProjects.some((p) => p.id !== projectId && p.votes?.includes(user.uid));
      if (alreadyVoted) {
        toast.error('Vous ne pouvez voter que pour un seul projet par événement');
        return;
      }
    }

    try {
      const projRef = doc(db, 'buildathonProjects', projectId);
      const voteLockRef = doc(db, 'buildathons', buildathonId, 'votes', user.uid);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(projRef);
        if (!snap.exists()) throw new Error('Projet introuvable');
        const voteLockSnap = await tx.get(voteLockRef);

        const data = snap.data() || {};
        const votes = Array.isArray(data.votes) ? data.votes : [];
        const alreadyVoted = votes.includes(user.uid);
        const lockedProjectId = voteLockSnap.exists() ? voteLockSnap.data()?.projectId : null;

        if (alreadyVoted) {
          const nextVotes = votes.filter((uid) => uid !== user.uid);
          tx.update(projRef, {
            votes: nextVotes,
            voteCount: nextVotes.length,
            updatedAt: serverTimestamp(),
          });
          tx.delete(voteLockRef);
          return { action: 'removed' };
        }

        if (lockedProjectId && lockedProjectId !== projectId) {
          throw new Error('Vous ne pouvez voter que pour un seul projet par événement');
        }

        const nextVotes = [...votes, user.uid];
        tx.update(projRef, {
          votes: nextVotes,
          voteCount: nextVotes.length,
          updatedAt: serverTimestamp(),
        });
        tx.set(voteLockRef, {
          projectId,
          buildathonId,
          userId: user.uid,
          updatedAt: serverTimestamp(),
        });
        return { action: 'added' };
      });

      if (result.action === 'removed') {
        toast.success('Vote retiré');
      } else {
        toast.success('Vote enregistré ! (+10 pts pour ce projet)');
      }
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  // ---- Admin: Finalize Event (manual confirmation only) ----
  async function handleFinalize(eventId) {
    if (!isAdmin || !user?.uid) return;
    const event = events.find((e) => e.id === eventId);
    if (!event || event.finalized) return;

    const status = getEventStatus(event);
    if (status !== 'ended' && status !== 'completed') {
      toast.error('Attribution impossible: attendez la fin du challenge');
      return;
    }

    if (!confirm('Confirmer l\'attribution finale des points ?')) return;

    const eventProjects = sortProjectsForEventRanking(event, projects.filter((p) => p.buildathonId === eventId));
    if (eventProjects.length === 0) {
      toast.error('Aucun projet soumis');
      return;
    }

    const prizes = (event.prizes || []).sort((a, b) => a.place - b.place);
    try {
      const finalizationAwards = [];
      for (let i = 0; i < Math.min(prizes.length, eventProjects.length); i++) {
        const project = eventProjects[i];
        const prize = prizes[i];
        if ((prize.rewardType || 'points') !== 'points') continue;
        const memberCount = project.members?.length || 1;
        const totalPoints = Number(prize.points || 0);
        const pointsPerMember = Math.round(totalPoints / memberCount);
        if (pointsPerMember <= 0) continue;
        for (const member of project.members || []) {
          if (member.uid) {
            const userRef = doc(db, 'users', member.uid);
            await updateDoc(userRef, { bonusPoints: increment(pointsPerMember) });
            const logRef = doc(collection(db, 'users', member.uid, 'bonusLogs'));
            await setDoc(logRef, {
              points: pointsPerMember,
              reason: `${event.type === 'hackathon' ? 'Hackathon' : 'Buildathon'} "${event.title}" - Place ${prize.place} (${totalPoints} pts à ${memberCount} membre${memberCount > 1 ? 's' : ''})`,
              grantedBy: user.uid,
              grantedAt: serverTimestamp(),
              source: 'buildathon-finalize',
              buildathonId: eventId,
              projectId: project.id,
              place: prize.place,
            });
            finalizationAwards.push({
              uid: member.uid,
              projectId: project.id,
              place: prize.place,
              points: pointsPerMember,
            });
          }
        }
      }

      await updateDoc(doc(db, 'buildathons', eventId), {
        status: 'completed',
        finalized: true,
        finalizedAt: serverTimestamp(),
        finalizedBy: user.uid,
        finalizationAwards,
        finalizationRevokedAt: null,
        finalizationRevokedBy: null,
      });
      toast.success('Attribution finale effectuée');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
      console.error('Finalize error:', err);
    }
  }

  async function handleRevokeFinalization(eventId) {
    if (!isAdmin || !user?.uid) return;
    const event = events.find((e) => e.id === eventId);
    if (!event || !event.finalized) return;
    if (!confirm('Annuler les points attribués pour cet événement ?')) return;

    let awardsToRevoke = Array.isArray(event.finalizationAwards)
      ? event.finalizationAwards.filter((award) => award?.uid && Number(award?.points) > 0)
      : [];

    if (awardsToRevoke.length === 0) {
      const eventProjects = sortProjectsForEventRanking(event, projects.filter((p) => p.buildathonId === eventId));
      const prizes = (event.prizes || []).sort((a, b) => a.place - b.place);
      awardsToRevoke = [];

      for (let i = 0; i < Math.min(prizes.length, eventProjects.length); i++) {
        const project = eventProjects[i];
        const prize = prizes[i];
        if ((prize.rewardType || 'points') !== 'points') continue;
        const memberCount = project.members?.length || 1;
        const totalPoints = Number(prize.points || 0);
        const pointsPerMember = Math.round(totalPoints / memberCount);
        if (pointsPerMember <= 0) continue;

        for (const member of project.members || []) {
          if (!member.uid) continue;
          awardsToRevoke.push({
            uid: member.uid,
            projectId: project.id,
            place: prize.place,
            points: pointsPerMember,
          });
        }
      }
    }

    try {
      for (const award of awardsToRevoke) {
        await updateDoc(doc(db, 'users', award.uid), {
          bonusPoints: increment(-Math.abs(Number(award.points || 0))),
        });
        const logRef = doc(collection(db, 'users', award.uid, 'bonusLogs'));
        await setDoc(logRef, {
          points: -Math.abs(Number(award.points || 0)),
          reason: `${event.type === 'hackathon' ? 'Hackathon' : 'Buildathon'} "${event.title}" - Annulation attribution finale`,
          grantedBy: user.uid,
          grantedAt: serverTimestamp(),
          source: 'buildathon-finalize-revoke',
          buildathonId: eventId,
          projectId: award.projectId || null,
          place: award.place || null,
        });
      }

      await updateDoc(doc(db, 'buildathons', eventId), {
        status: 'ended',
        finalized: false,
        finalizedAt: null,
        finalizedBy: null,
        finalizationRevokedAt: serverTimestamp(),
        finalizationRevokedBy: user.uid,
      });

      toast.success('Attribution annulée, points retirés');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  // ---- Invite friend (creates a pending invitation) ----
  async function handleInviteFriend(projectId, buildathonId) {
    if (!newProject.inviteIdentifier) { toast.error('Entrez l\'email ou ID de votre ami'); return; }
    try {
      const targetUser = await resolveUserByIdentifier(newProject.inviteIdentifier);
      const friendUid = targetUser?.uid;
      const friendName = targetUser?.name;
      const friendEmail = targetUser?.email;
      if (!friendUid) { toast.error('Utilisateur non trouvé'); return; }
      if (friendUid === user.uid) { toast.error('Vous ne pouvez pas vous inviter vous-même'); return; }

      // Check if already a member
      const project = projects.find((p) => p.id === projectId);
      if (project?.members?.some((m) => m.uid === friendUid)) {
        toast.error('Cet utilisateur est déjà membre de l\'équipe');
        return;
      }

      // Check if invitation already pending
      const existingInvSnap = await getDocs(
        query(collection(db, 'projectInvitations'), where('projectId', '==', projectId), where('invitedUid', '==', friendUid), where('status', '==', 'pending'))
      );
      if (!existingInvSnap.empty) {
        toast.error('Une invitation est déjà en attente pour cet utilisateur');
        return;
      }

      const invId = `inv-${Date.now().toString(36)}-${friendUid.slice(0, 6)}`;
      await setDoc(doc(db, 'projectInvitations', invId), {
        projectId,
        buildathonId,
        projectTitle: project?.title || '',
        teamName: project?.teamName || '',
        invitedUid: friendUid,
        invitedEmail: friendEmail || newProject.inviteIdentifier,
        invitedName: friendName,
        invitedBy: user.uid,
        invitedByName: userProfile?.displayName || user.email,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      toast.success(`Invitation envoyée à ${friendName} !`);
      setNewProject((p) => ({ ...p, inviteIdentifier: '' }));
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  // ---- Accept invitation ----
  async function handleAcceptInvitation(invitation) {
    try {
      // Add user to project members
      await updateDoc(doc(db, 'buildathonProjects', invitation.projectId), {
        members: arrayUnion({ uid: user.uid, name: userProfile?.displayName || user.email, email: user.email }),
      });
      // Also register user for the event if not already
      if (invitation.buildathonId) {
        await updateDoc(doc(db, 'buildathons', invitation.buildathonId), {
          participants: arrayUnion(user.uid),
        });
      }
      // Delete the invitation
      await deleteDoc(doc(db, 'projectInvitations', invitation.id));
      toast.success(`Vous avez rejoint l'équipe "${invitation.teamName}" !`);
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  // ---- Decline invitation ----
  async function handleDeclineInvitation(invitation) {
    try {
      await deleteDoc(doc(db, 'projectInvitations', invitation.id));
      toast.success('Invitation refusée');
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  }

  // ---- Get pending invitations for a project (sent by owner) ----
  const [projectPendingInvites, setProjectPendingInvites] = useState([]);
  useEffect(() => {
    if (!user?.uid) return;
    const unsubSent = onSnapshot(
      query(collection(db, 'projectInvitations'), where('invitedBy', '==', user.uid), where('status', '==', 'pending')),
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
        setProjectPendingInvites(data);
      },
    );
    return () => unsubSent();
  }, [user?.uid]);

  function getSafeDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function getEventDateCategory(event) {
    const now = new Date();
    const start = getSafeDate(event.startDate);
    const end = getSafeDate(event.endDate);

    if (!start && !end) return 'undated';
    if (end && end < now) return 'past';

    const upcomingWindow = new Date(now);
    upcomingWindow.setDate(upcomingWindow.getDate() + 30);
    if (start && start >= now && start <= upcomingWindow) return 'upcoming-30';

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const startsThisMonth = start && start.getFullYear() === currentYear && start.getMonth() === currentMonth;
    const endsThisMonth = end && end.getFullYear() === currentYear && end.getMonth() === currentMonth;
    if (startsThisMonth || endsThisMonth) return 'this-month';

    return 'all';
  }

  function getEventPopularityMetrics(eventId, eventParticipants = []) {
    const eventProjects = projects.filter((p) => p.buildathonId === eventId);
    const submittedProjects = eventProjects.length;
    const participantsCount = Array.isArray(eventParticipants) ? eventParticipants.length : 0;
    const totalVotes = eventProjects.reduce((sum, p) => sum + (p.voteCount || 0), 0);
    const popularityScore = (submittedProjects * 3) + participantsCount + totalVotes;

    return { submittedProjects, participantsCount, totalVotes, popularityScore };
  }

  function getSafeCountFromPair(primary, secondary) {
    const primaryCount = Number(primary);
    const secondaryCount = Number(secondary);
    const safePrimary = Number.isFinite(primaryCount) ? primaryCount : 0;
    const safeSecondary = Number.isFinite(secondaryCount) ? secondaryCount : 0;
    return Math.max(safePrimary, safeSecondary);
  }

  function getBuildathonSupervisionMetrics(event, eventProjects = []) {
    const participantsCount = Array.isArray(event?.participants) ? event.participants.length : 0;
    const submittedProjects = eventProjects.length;

    let publishedProjects = 0;
    let rejectedProjects = 0;
    let totalVotes = 0;
    let totalLikes = 0;
    let totalFeedback = 0;

    const uniqueTeamNames = new Set();

    eventProjects.forEach((project) => {
      const status = getCanonicalProjectStatus(project);
      if (status === 'publie') publishedProjects += 1;
      if (status === 'rejete') rejectedProjects += 1;

      const voteCount = Number.isFinite(Number(project?.voteCount))
        ? Number(project.voteCount)
        : (Array.isArray(project?.votes) ? project.votes.length : 0);
      const likesCount = Number.isFinite(Number(project?.likesCount))
        ? Number(project.likesCount)
        : (Array.isArray(project?.likeUserIds) ? project.likeUserIds.length : 0);

      totalVotes += voteCount;
      totalLikes += likesCount;
      totalFeedback += getSafeCountFromPair(project?.feedbackCount, project?.commentsCount);

      const teamName = (project?.teamName || '').trim();
      if (teamName) {
        uniqueTeamNames.add(teamName.toLowerCase());
      }
    });

    return {
      submittedProjects,
      publishedProjects,
      rejectedProjects,
      totalVotes,
      totalLikes,
      totalFeedback,
      participantsCount,
      teamsCount: uniqueTeamNames.size > 0 ? uniqueTeamNames.size : submittedProjects,
      votingEnabled: event?.votingEnabled !== false,
      submissionOpen: event?.submissionOpen !== false,
    };
  }

  function getProjectIntegrityWarnings(project) {
    const warnings = [];
    const status = getCanonicalProjectStatus(project);
    const title = (project?.title || '').trim();
    const teamName = (project?.teamName || '').trim();
    const hasRepo = Boolean((project?.repoUrl || '').trim());
    const hasDemo = Boolean((project?.demoUrl || '').trim());

    if (!title) warnings.push('Titre manquant');
    if (!teamName) warnings.push('Equipe manquante');
    if (!hasRepo) warnings.push('Repo manquant');
    if (!hasDemo) warnings.push('Demo manquante');

    const submittedAtMs = toTimestampMs(project?.submittedAt);
    const createdAtMs = toTimestampMs(project?.createdAt);
    if (submittedAtMs === null && createdAtMs === null) {
      warnings.push('submittedAt/createdAt manquant');
    }

    if (status === 'publie' && (project?.isPublished !== true || project?.isPublic !== true)) {
      warnings.push('Statut publie mais flags public/published incoherents');
    }

    if (status !== 'publie' && (project?.isPublished === true || project?.isPublic === true)) {
      warnings.push('Flags public/published actifs hors statut publie');
    }

    const voteCount = Number.isFinite(Number(project?.voteCount)) ? Number(project.voteCount) : 0;
    const votesLength = Array.isArray(project?.votes) ? project.votes.length : 0;
    if (Number.isFinite(Number(project?.voteCount)) && Array.isArray(project?.votes) && voteCount !== votesLength) {
      warnings.push('voteCount different de votes.length');
    }

    const likesCount = Number.isFinite(Number(project?.likesCount)) ? Number(project.likesCount) : 0;
    const likeUserIdsLength = Array.isArray(project?.likeUserIds) ? project.likeUserIds.length : 0;
    if (Number.isFinite(Number(project?.likesCount)) && Array.isArray(project?.likeUserIds) && likesCount !== likeUserIdsLength) {
      warnings.push('likesCount different de likeUserIds.length');
    }

    const commentsCount = Number.isFinite(Number(project?.commentsCount)) ? Number(project.commentsCount) : 0;
    const feedbackCount = Number.isFinite(Number(project?.feedbackCount)) ? Number(project.feedbackCount) : 0;
    if (commentsCount > 0 && feedbackCount > 0 && Math.abs(commentsCount - feedbackCount) > 3) {
      warnings.push('Ecart notable entre commentsCount et feedbackCount');
    }

    return warnings;
  }

  function getPopularityBucket(event) {
    const { popularityScore } = getEventPopularityMetrics(event.id, event.participants);
    if (popularityScore >= 20) return 'high';
    if (popularityScore >= 8) return 'medium';
    return 'low';
  }

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const status = getEventStatus(e);
      if (filterStatus !== 'all' && status !== filterStatus) return false;

      const dateCategory = getEventDateCategory(e);
      if (filterDate !== 'all' && dateCategory !== filterDate) return false;

      const popularityBucket = getPopularityBucket(e);
      if (filterPopularity !== 'all' && popularityBucket !== filterPopularity) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return e.title?.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [events, filterStatus, filterDate, filterPopularity, searchQuery, projects]);

  function CountdownTimer({ endDate }) {
    const [timeLeft, setTimeLeft] = useState('');
    useEffect(() => {
      function update() {
        const now = new Date();
        const end = new Date(endDate);
        const diff = end - now;
        if (diff <= 0) { setTimeLeft('Terminé'); return; }
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff / 3600000) % 24);
        const m = Math.floor((diff / 60000) % 60);
        setTimeLeft(`${d}j ${h}h ${m}m`);
      }
      update();
      const interval = setInterval(update, 60000);
      return () => clearInterval(interval);
    }, [endDate]);
    return <span className="flex items-center gap-1 text-sm font-medium"><Timer className="w-3.5 h-3.5" />{timeLeft}</span>;
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  }

  const selectedSubmitEvent = events.find((e) => e.id === showSubmitProject);
  const selectedAdminEvent = events.find((e) => e.id === showAdminProjectForm);

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Rocket className="w-8 h-8 text-primary-400" />
          <div>
            <h1 className="section-title">Événements</h1>
            <p className="section-subtitle">Buildathons & Hackathons — participez, votez, gagnez !</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreateEvent(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Créer un événement
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher un événement..." className="input-field pl-11 w-full" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ value: 'all', label: 'Tous' }, { value: 'active', label: 'En cours' }, { value: 'upcoming', label: 'À venir' }, { value: 'ended', label: 'Vote' }, { value: 'completed', label: 'Passés' }].map(({ value, label }) => (
            <button key={value} onClick={() => setFilterStatus(value)} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${filterStatus === value ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30' : 'text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ value: 'all', label: 'Date: toutes' }, { value: 'upcoming-30', label: 'Date: 30 jours' }, { value: 'this-month', label: 'Date: ce mois' }, { value: 'past', label: 'Date: passés' }, { value: 'undated', label: 'Date: non définie' }].map(({ value, label }) => (
            <button key={value} onClick={() => setFilterDate(value)} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${filterDate === value ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30' : 'text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ value: 'all', label: 'Popularité: toutes' }, { value: 'high', label: 'Populaire' }, { value: 'medium', label: 'Intermédiaire' }, { value: 'low', label: 'Faible' }].map(({ value, label }) => (
            <button key={value} onClick={() => setFilterPopularity(value)} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${filterPopularity === value ? 'bg-accent-600/20 text-accent-300 border border-accent-500/30' : 'text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Pending Invitations Banner */}
      {invitations.length > 0 && (
        <div className="mb-6 space-y-3">
          <h3 className="text-sm font-semibold text-heading uppercase tracking-wider flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary-400" />
            Invitations en attente ({invitations.length})
          </h3>
          {invitations.map((inv) => (
            <div key={inv.id} className="glass-card p-4 border-2 border-primary-500/30 bg-primary-500/5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-heading font-medium">
                    <span className="text-primary-400">{inv.invitedByName}</span> vous invite à rejoindre l'équipe <span className="font-bold">"{inv.teamName}"</span>
                  </p>
                  <p className="text-sm text-muted mt-0.5">Projet : {inv.projectTitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleAcceptInvitation(inv)} className="btn-primary text-sm flex items-center gap-1.5 px-4 py-2">
                    <UserCheck className="w-4 h-4" />Rejoindre
                  </button>
                  <button onClick={() => handleDeclineInvitation(inv)} className="btn-secondary text-sm flex items-center gap-1.5 px-3 py-2">
                    <XCircle className="w-4 h-4" />Refuser
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin: Create Event Form */}
      {showCreateEvent && isAdmin && (
        <div className="glass-card p-8 mb-6 border-2 border-primary-500/30">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-heading flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary-400" />
              Nouvel événement
            </h2>
            <button onClick={() => setShowCreateEvent(false)} className="text-muted hover:text-heading"><X className="w-5 h-5" /></button>
          </div>

          <AdminBuildathonEventForm
            mode="create"
            value={newEvent}
            onChange={setNewEvent}
            onSubmit={handleCreateEvent}
            onCancel={() => setShowCreateEvent(false)}
            eventTypes={EVENT_TYPES}
          />
        </div>
      )}

      {/* Admin: Edit Event Form */}
      {showEditEvent && isAdmin && (
        <div className="glass-card p-8 mb-6 border-2 border-amber-500/30">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-heading flex items-center gap-2">
              <Pencil className="w-5 h-5 text-amber-400" />
              Modifier l'événement
            </h2>
            <button
              onClick={() => { setShowEditEvent(false); setEditingEventId(null); }}
              className="text-muted hover:text-heading"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <AdminBuildathonEventForm
            mode="edit"
            value={editEvent}
            onChange={setEditEvent}
            onSubmit={handleUpdateEvent}
            onCancel={() => { setShowEditEvent(false); setEditingEventId(null); }}
            eventTypes={EVENT_TYPES}
          />
        </div>
      )}

      {/* Dedicated Submit Section */}
      {showSubmitProject && selectedSubmitEvent && (
        <div className="glass-card p-8 mb-6 border-2 border-accent-500/30">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-heading flex items-center gap-2">
              <Send className="w-5 h-5 text-accent-400" />
              Soumettre un projet - {selectedSubmitEvent.title}
            </h2>
            <button onClick={() => setShowSubmitProject(null)} className="text-muted hover:text-heading"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-body mb-1">Titre *</label>
                <input type="text" value={newProject.title} onChange={(e) => setNewProject((p) => ({ ...p, title: e.target.value }))} className="input-field w-full" placeholder="Nom du projet" />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Nom d'équipe *</label>
                <input type="text" value={newProject.teamName} onChange={(e) => setNewProject((p) => ({ ...p, teamName: e.target.value }))} className="input-field w-full" placeholder="Votre équipe" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Description</label>
              <textarea value={newProject.description} onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))} className="input-field w-full h-24 resize-none" placeholder="Technologies, problème résolu..." />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-body mb-1">Catégorie</label>
                <select value={newProject.category} onChange={(e) => setNewProject((p) => ({ ...p, category: e.target.value }))} className="input-field w-full">
                  {PROJECT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1"><Link2 className="w-3 h-3 inline mr-1" />Lien GitHub *</label>
                <input type="url" value={newProject.repoUrl} onChange={(e) => setNewProject((p) => ({ ...p, repoUrl: e.target.value }))} className="input-field w-full" placeholder="https://github.com/..." required />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1"><Video className="w-3 h-3 inline mr-1" />Vidéo démo *</label>
                <input type="url" value={newProject.demoUrl} onChange={(e) => setNewProject((p) => ({ ...p, demoUrl: e.target.value }))} className="input-field w-full" placeholder="https://youtube.com/..." required />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => handleSubmitProject(selectedSubmitEvent.id)} className="btn-primary flex items-center gap-2"><Send className="w-4 h-4" />Soumettre</button>
              <button onClick={() => setShowSubmitProject(null)} className="btn-secondary">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Admin Add Project Section */}
      {isAdmin && showAdminProjectForm && selectedAdminEvent && (
        <div className="glass-card p-8 mb-6 border-2 border-primary-500/30">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-heading flex items-center gap-2"><Plus className="w-5 h-5 text-primary-400" />Ajouter un projet (admin) - {selectedAdminEvent.title}</h2>
            <button onClick={() => setShowAdminProjectForm(null)} className="text-muted hover:text-heading"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <input type="text" value={adminProject.userIdentifier} onChange={(e) => setAdminProject((p) => ({ ...p, userIdentifier: e.target.value }))} className="input-field" placeholder="Email ou ID (UZA-0SOM3ZSZ)" />
            <input type="text" value={adminProject.teamName} onChange={(e) => setAdminProject((p) => ({ ...p, teamName: e.target.value }))} className="input-field" placeholder="Nom d'équipe" />
            <input type="text" value={adminProject.title} onChange={(e) => setAdminProject((p) => ({ ...p, title: e.target.value }))} className="input-field" placeholder="Titre du projet" />
            <select value={adminProject.category} onChange={(e) => setAdminProject((p) => ({ ...p, category: e.target.value }))} className="input-field">
              {PROJECT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input type="url" value={adminProject.repoUrl} onChange={(e) => setAdminProject((p) => ({ ...p, repoUrl: e.target.value }))} className="input-field" placeholder="Lien GitHub" />
            <input type="url" value={adminProject.demoUrl} onChange={(e) => setAdminProject((p) => ({ ...p, demoUrl: e.target.value }))} className="input-field" placeholder="Lien démo" />
          </div>
          <textarea value={adminProject.description} onChange={(e) => setAdminProject((p) => ({ ...p, description: e.target.value }))} className="input-field w-full h-24 resize-none mb-3" placeholder="Description du projet" />
          <div className="flex gap-3 pt-2">
            <button onClick={() => handleAdminAddProject(selectedAdminEvent.id)} className="btn-primary text-sm">Ajouter ce projet</button>
            <button onClick={() => setShowAdminProjectForm(null)} className="btn-secondary text-sm">Annuler</button>
          </div>
        </div>
      )}

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Rocket className="w-20 h-20 text-muted mx-auto mb-4 opacity-30" />
          <h3 className="text-xl font-bold text-heading mb-2">
            {searchQuery || filterStatus !== 'all' ? 'Aucun événement trouvé' : 'Aucun événement prévu pour le moment'}
          </h3>
          <p className="text-body max-w-md mx-auto">
            {isAdmin
              ? 'Créez le premier Buildathon ou Hackathon pour lancer la compétition !'
              : 'Il n\'y a pas encore de Buildathon ou Hackathon prévu. Revenez bientôt pour découvrir les prochains événements !'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredEvents.map((event) => {
            const status = getEventStatus(event);
            const statusInfo = STATUS_CONFIG[status];
            const allEventProjects = sortProjectsForEventRanking(event, projects.filter((p) => p.buildathonId === event.id));
            const eventProjects = isAdmin
              ? allEventProjects
              : allEventProjects.filter((p) => isProjectVisibleForParticipant(p, event, user?.uid));
            const metrics = getEventPopularityMetrics(event.id, event.participants);
            const adminSupervisionMetrics = getBuildathonSupervisionMetrics(event, allEventProjects);
            const adminRankingProjects = sortProjectsForEventRanking(event, allEventProjects);
            const integrityWarningsByProject = allEventProjects
              .map((project) => ({
                projectId: project.id,
                title: project.title || 'Sans titre',
                warnings: getProjectIntegrityWarnings(project),
              }))
              .filter((entry) => entry.warnings.length > 0);
            const isExpanded = expandedEvent === event.id;
            const isRegistered = event.participants?.includes(user?.uid);
            const userHasSubmitted = allEventProjects.some((p) => p.submittedBy === user?.uid);
            const canSubmit = status === 'active' && isRegistered;
            const canVote = status === 'active' || status === 'ended';
            const canRegister = (status === 'upcoming' || status === 'active') && !isRegistered;
            const typeLabel = event.type === 'hackathon' ? 'Hackathon' : 'Buildathon';
            const typeIcon = event.type === 'hackathon' ? '💻' : '🏗️';
            const userVotedProject = allEventProjects.find((p) => p.votes?.includes(user?.uid));

            return (
              <div key={event.id} className="glass-card overflow-hidden">
                {/* Event Header */}
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-2xl">{typeIcon}</span>
                        <h2 className="text-xl font-bold text-heading">{event.title}</h2>
                        <span className={`badge border ${statusInfo.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot} mr-1 inline-block`} />
                          {statusInfo.label}
                        </span>
                        <span className="badge bg-surface text-body border border-themed text-xs">{typeLabel}</span>
                      </div>
                      <p className="text-body text-sm mb-4 line-clamp-2">{event.description || 'Aucune description disponible.'}</p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                        <div className="rounded-lg border border-themed bg-black/5 dark:bg-white/5 px-3 py-2">
                          <p className="text-muted mb-1">Début</p>
                          <p className="text-heading font-medium">{formatEventDate(event.startDate)}</p>
                        </div>
                        <div className="rounded-lg border border-themed bg-black/5 dark:bg-white/5 px-3 py-2">
                          <p className="text-muted mb-1">Fin</p>
                          <p className="text-heading font-medium">{formatEventDate(getEffectiveEventEndDate(event))}</p>
                        </div>
                        <div className="rounded-lg border border-themed bg-black/5 dark:bg-white/5 px-3 py-2">
                          <p className="text-muted mb-1">Participants</p>
                          <p className="text-heading font-medium">{metrics.participantsCount}</p>
                        </div>
                        <div className="rounded-lg border border-themed bg-black/5 dark:bg-white/5 px-3 py-2">
                          <p className="text-muted mb-1">Projets</p>
                          <p className="text-heading font-medium">{metrics.submittedProjects}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {event.rewardsVisible !== false && event.prizes?.length > 0 && (
                        <div className="hidden sm:flex items-center gap-1.5 flex-wrap max-w-[240px] justify-end">
                          {event.prizes.slice(0, 3).map((p, i) => (
                            <span key={i} className="flex items-center gap-0.5 badge bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                              {(p.rewardType || 'points') === 'points' ? <Zap className="w-3 h-3" /> : <Gift className="w-3 h-3" />}
                              {(p.rewardType || 'points') === 'points' ? `${p.points || 0} pts` : (p.label || 'Récompense')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link
                      to={`/projects/${event.id}`}
                      className="btn-primary text-sm inline-flex items-center gap-1"
                    >
                      Voir le buildathon
                    </Link>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleOpenEditEvent(event); }}
                        className="btn-secondary text-sm inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Modifier l'événement
                      </button>
                    )}
                    {isAdmin && !event.finalized && status === 'ended' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleFinalize(event.id); }}
                        className="btn-secondary text-sm inline-flex items-center gap-1"
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        Confirmer attribution points
                      </button>
                    )}
                    {isAdmin && event.finalized && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRevokeFinalization(event.id); }}
                        className="btn-secondary text-sm inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Annuler les points attribués
                      </button>
                    )}
                    {canRegister && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRegister(event.id); }}
                        className="btn-secondary text-sm inline-flex items-center gap-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        S'inscrire
                      </button>
                    )}
                    {isRegistered && (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Inscrit
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


