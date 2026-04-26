import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Calendar,
  Copy,
  ExternalLink,
  FileText,
  Flag,
  Github,
  Heart,
  Loader2,
  MessageSquare,
  Share2,
  Send,
  Trash2,
  ThumbsUp,
  Users,
} from 'lucide-react';

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

function formatDate(value) {
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

function normalizeEvent(raw) {
  const mode = raw?.mode === 'jury' || raw?.juryModeEnabled === true || raw?.rankingMode === 'jury'
    ? 'jury'
    : 'public';
  return {
    ...raw,
    mode,
    rankingMode: mode,
    votingEnabled: raw.votingEnabled !== false,
    participants: Array.isArray(raw.participants) ? raw.participants : [],
    maxVotesPerUser: 1,
    projectVisibility: raw.projectVisibility || 'published-only',
    juryModeEnabled: mode === 'jury',
  };
}

function getCanonicalProjectStatus(project = {}) {
  const raw = String(project.projectStatus || project.status || '').toLowerCase();
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

  if (project?.moderationStatus === 'rejected') return 'rejete';
  if (project?.isPublished === true || project?.isPublic === true) return 'publie';
  if (project?.moderationStatus === 'approved') return 'valide';
  return 'soumis';
}

function isProjectOwnerOrMember(project, uid) {
  if (!uid) return false;
  if (project?.submittedBy === uid) return true;
  return Array.isArray(project?.members) && project.members.some((member) => member?.uid === uid);
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

function isProjectVisibleForParticipant(project, event, uid) {
  const status = getCanonicalProjectStatus(project);
  if (isProjectOwnerOrMember(project, uid)) return true;

  if (status === 'rejete') return false;
  const projectVisibility = getCanonicalProjectVisibility(event);
  if (projectVisibility === 'all-submitted') {
    return status === 'soumis' || status === 'valide' || status === 'publie';
  }
  return status === 'publie';
}

function normalizeProject(raw) {
  const projectStatus = getCanonicalProjectStatus(raw);
  const votes = Array.isArray(raw.votes) ? raw.votes : [];
  const likeUserIds = Array.isArray(raw.likeUserIds) ? raw.likeUserIds : [];
  const voteCount = Number.isFinite(Number(raw.voteCount)) ? Number(raw.voteCount) : votes.length;
  const likesCount = Number.isFinite(Number(raw.likesCount)) ? Number(raw.likesCount) : likeUserIds.length;
  const feedbackCount = Number.isFinite(Number(raw.feedbackCount))
    ? Number(raw.feedbackCount)
    : (Number.isFinite(Number(raw.commentsCount)) ? Number(raw.commentsCount) : 0);

  return {
    ...raw,
    votes,
    voteCount,
    likeUserIds,
    likesCount,
    feedbackCount,
    commentsCount: Number.isFinite(Number(raw.commentsCount)) ? Number(raw.commentsCount) : feedbackCount,
    submittedAt: normalizeDateLike(raw.submittedAt) || normalizeDateLike(raw.createdAt),
    projectStatus,
    statusLabel: projectStatus,
  };
}

function normalizeFeedback(raw) {
  return {
    ...raw,
    message: raw.message || '',
    authorName: raw.authorName || 'Participant',
    createdAt: normalizeDateLike(raw.createdAt),
    hidden: raw.hidden === true,
    hiddenAt: normalizeDateLike(raw.hiddenAt),
    hiddenBy: raw.hiddenBy || null,
    moderationReason: raw.moderationReason || null,
  };
}

function normalizeFeedbackReport(raw) {
  return {
    ...raw,
    feedbackId: raw.feedbackId || null,
    projectId: raw.projectId || null,
    reportedBy: raw.reportedBy || null,
    reason: raw.reason || 'spam',
    details: raw.details || '',
    status: raw.status || 'open',
    createdAt: normalizeDateLike(raw.createdAt),
    updatedAt: normalizeDateLike(raw.updatedAt),
  };
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

function getTeamLabel(project, allowMemberNames = false) {
  if (project?.teamName) return project.teamName;
  const members = Array.isArray(project?.members) ? project.members : [];
  if (members.length === 0) return 'Équipe non définie';
  if (!allowMemberNames) return 'Équipe participante';
  const names = members.map((m) => m.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'Équipe non définie';
}

function getProjectTags(project) {
  const tags = Array.isArray(project?.tags) ? project.tags.filter(Boolean) : [];
  if (tags.length > 0) return tags;
  if (project?.category) return [project.category];
  return [];
}

function getProjectStack(project) {
  if (Array.isArray(project?.stack) && project.stack.length > 0) return project.stack.filter(Boolean);
  if (Array.isArray(project?.techStack) && project.techStack.length > 0) return project.techStack.filter(Boolean);
  if (typeof project?.techStack === 'string' && project.techStack.trim()) {
    return project.techStack.split(',').map((x) => x.trim()).filter(Boolean);
  }
  return getProjectTags(project);
}

export default function BuildathonProjectDetail() {
  const { buildathonId, projectId } = useParams();
  const { user, userProfile, isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [event, setEvent] = useState(null);
  const [project, setProject] = useState(null);
  const [allEventProjects, setAllEventProjects] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [visibleFeedbackList, setVisibleFeedbackList] = useState([]);
  const [feedbackReports, setFeedbackReports] = useState([]);
  const [newFeedback, setNewFeedback] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [updatingVote, setUpdatingVote] = useState(false);
  const [updatingLike, setUpdatingLike] = useState(false);
  const [reportingCommentId, setReportingCommentId] = useState(null);
  const [submittingReportId, setSubmittingReportId] = useState(null);
  const [reportReasons, setReportReasons] = useState({});
  const [reportDetails, setReportDetails] = useState({});
  const [moderatingCommentId, setModeratingCommentId] = useState(null);
  const [expandedReportsCommentId, setExpandedReportsCommentId] = useState(null);
  const [copyingShareLink, setCopyingShareLink] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingProject, setSavingProject] = useState(false);

  useEffect(() => {
    if (!buildathonId || !projectId) {
      setLoading(false);
      return;
    }
    setLoadError('');

    const eventRef = doc(db, 'buildathons', buildathonId);
    const unsubEvent = onSnapshot(
      eventRef,
      (snap) => {
        if (!snap.exists()) {
          setEvent(null);
          return;
        }
        setEvent(normalizeEvent({ id: snap.id, ...snap.data() }));
      },
      () => {
        setLoadError('Impossible de charger les informations du buildathon.');
      }
    );

    const projectRef = doc(db, 'buildathonProjects', projectId);
    const unsubProject = onSnapshot(
      projectRef,
      (snap) => {
        if (!snap.exists()) {
          setProject(null);
          setLoading(false);
          return;
        }
        const data = normalizeProject({ id: snap.id, ...snap.data() });
        if (data.buildathonId && data.buildathonId !== buildathonId) {
          setProject(null);
        } else {
          setProject(data);
        }
        setLoading(false);
      },
      () => {
        setLoadError('Accès refusé ou projet indisponible.');
        setLoading(false);
      }
    );

    const eventProjectsRef = query(collection(db, 'buildathonProjects'), where('buildathonId', '==', buildathonId));
    const unsubEventProjects = onSnapshot(
      eventProjectsRef,
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push(normalizeProject({ id: d.id, ...d.data() })));
        setAllEventProjects(data);
      },
      () => {
        // Best-effort list, individual project page remains usable.
        setAllEventProjects([]);
      }
    );

    const feedbackRef = collection(db, 'buildathonProjects', projectId, 'feedback');
    const unsubFeedback = onSnapshot(
      feedbackRef,
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push(normalizeFeedback({ id: d.id, ...d.data() })));
        data.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        setFeedbackList(data);
      },
      () => {
        // Keep page usable even if comments stream fails.
      }
    );

    const feedbackReportsRef = collection(db, 'buildathonProjects', projectId, 'feedbackReports');
    const unsubFeedbackReports = onSnapshot(
      feedbackReportsRef,
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push(normalizeFeedbackReport({ id: d.id, ...d.data() })));
        data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        setFeedbackReports(data);
      },
      () => {
        // Reports are admin support data; ignore stream failures silently.
      }
    );

    return () => {
      unsubEvent();
      unsubProject();
      unsubEventProjects();
      unsubFeedback();
      unsubFeedbackReports();
    };
  }, [buildathonId, projectId]);

  const hasVoted = useMemo(() => {
    return Boolean(user?.uid && project?.votes?.includes(user.uid));
  }, [user?.uid, project?.votes]);

  const hasLiked = useMemo(() => {
    return Boolean(user?.uid && project?.likeUserIds?.includes(user.uid));
  }, [user?.uid, project?.likeUserIds]);

  const hasVotedForAnotherProjectInEvent = useMemo(() => {
    if (!user?.uid) return false;
    return allEventProjects.some((p) => p.id !== projectId && p.votes?.includes(user.uid));
  }, [allEventProjects, projectId, user?.uid]);

  const openReportsByFeedbackId = useMemo(() => {
    const map = {};
    feedbackReports
      .filter((report) => report.status === 'open')
      .forEach((report) => {
        if (!report.feedbackId) return;
        if (!map[report.feedbackId]) {
          map[report.feedbackId] = [];
        }
        map[report.feedbackId].push(report);
      });
    return map;
  }, [feedbackReports]);

  const openReportsCount = useMemo(() => {
    return feedbackReports.filter((report) => report.status === 'open').length;
  }, [feedbackReports]);

  useEffect(() => {
    const visible = isAdmin
      ? feedbackList
      : feedbackList.filter((item) => !item.hidden);
    setVisibleFeedbackList(visible);
  }, [feedbackList, isAdmin]);

  useEffect(() => {
    if (!project?.id) return;
    setEditForm({
      title: project.title || '',
      description: project.description || '',
      category: project.category || 'other',
      teamName: project.teamName || '',
      repoUrl: project.repoUrl || '',
      demoUrl: project.demoUrl || '',
    });
    setIsEditingProject(false);
  }, [project?.id]);

  useEffect(() => {
    if (!project?.id) return;

    const realCount = feedbackList.filter((item) => !item.hidden).length;
    const storedFeedbackCount = Number.isFinite(Number(project.feedbackCount)) ? Number(project.feedbackCount) : 0;
    const storedCommentsCount = Number.isFinite(Number(project.commentsCount)) ? Number(project.commentsCount) : 0;

    if (storedFeedbackCount === realCount && storedCommentsCount === realCount) {
      return;
    }

    updateDoc(doc(db, 'buildathonProjects', project.id), {
      feedbackCount: realCount,
      commentsCount: realCount,
    }).catch(() => {
      // Best-effort consistency sync for legacy/mismatched counters.
    });
  }, [feedbackList, project?.id, project?.feedbackCount, project?.commentsCount]);

  async function handleVote() {
    if (!user?.uid || !project || updatingVote) return;
    if (!event?.votingEnabled) {
      toast.error('Le vote est désactivé pour ce buildathon');
      return;
    }

    const isOwnProject = project.submittedBy === user.uid;
    if (isOwnProject && event?.allowSelfVote === false) {
      toast.error('Le vote pour son propre projet est désactivé');
      return;
    }

    if (!hasVoted && hasVotedForAnotherProjectInEvent && (event?.maxVotesPerUser || 1) <= 1) {
      toast.error('Vous avez déjà voté pour un autre projet de cet événement');
      return;
    }

    setUpdatingVote(true);
    try {
      const ref = doc(db, 'buildathonProjects', project.id);
      const voteLockRef = doc(db, 'buildathons', buildathonId, 'votes', user.uid);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Projet introuvable');
        const voteLockSnap = await tx.get(voteLockRef);

        const data = snap.data() || {};
        const votes = Array.isArray(data.votes) ? data.votes : [];
        const alreadyVoted = votes.includes(user.uid);
        const lockedProjectId = voteLockSnap.exists() ? voteLockSnap.data()?.projectId : null;

        if (alreadyVoted) {
          const nextVotes = votes.filter((uid) => uid !== user.uid);
          tx.update(ref, {
            votes: nextVotes,
            voteCount: nextVotes.length,
            updatedAt: serverTimestamp(),
          });
          tx.delete(voteLockRef);
          return { action: 'removed' };
        }

        if (lockedProjectId && lockedProjectId !== project.id) {
          throw new Error('Vous avez déjà voté pour un autre projet de cet événement');
        }

        const nextVotes = [...votes, user.uid];
        tx.update(ref, {
          votes: nextVotes,
          voteCount: nextVotes.length,
          updatedAt: serverTimestamp(),
        });
        tx.set(voteLockRef, {
          projectId: project.id,
          buildathonId,
          userId: user.uid,
          updatedAt: serverTimestamp(),
        });
        return { action: 'added' };
      });

      if (result.action === 'removed') {
        toast.success('Vote retiré');
      } else {
        const isJuryMode = event?.mode === 'jury' || event?.juryModeEnabled === true || event?.rankingMode === 'jury';
        toast.success(isJuryMode
          ? 'Vote enregistré (+10 points UjuziAI global)'
          : 'Vote enregistré (impacte le classement Buildathon public)');
      }
    } catch (error) {
      if (error?.message) {
        toast.error(error.message);
      } else {
        toast.error('Erreur lors du vote');
      }
    } finally {
      setUpdatingVote(false);
    }
  }

  async function handleLike() {
    if (!user?.uid || !project || updatingLike) return;
    setUpdatingLike(true);
    try {
      const ref = doc(db, 'buildathonProjects', project.id);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Projet introuvable');

        const data = snap.data() || {};
        const likeUserIds = Array.isArray(data.likeUserIds) ? data.likeUserIds : [];
        const alreadyLiked = likeUserIds.includes(user.uid);

        if (alreadyLiked) {
          const nextLikeUserIds = likeUserIds.filter((uid) => uid !== user.uid);
          tx.update(ref, {
            likeUserIds: nextLikeUserIds,
            likesCount: nextLikeUserIds.length,
            updatedAt: serverTimestamp(),
          });
          return { action: 'removed' };
        }

        const nextLikeUserIds = [...likeUserIds, user.uid];
        tx.update(ref, {
          likeUserIds: nextLikeUserIds,
          likesCount: nextLikeUserIds.length,
          updatedAt: serverTimestamp(),
        });
        return { action: 'added' };
      });

      if (result.action === 'removed') {
        toast.success('Like retiré');
      } else {
        toast.success('Like enregistré (popularité uniquement)');
      }
    } catch (error) {
      toast.error('Erreur lors du like');
    } finally {
      setUpdatingLike(false);
    }
  }

  async function handleSubmitFeedback(e) {
    e.preventDefault();
    const message = newFeedback.trim();
    if (!message || !project || !user?.uid) return;

    setSubmittingFeedback(true);
    try {
      const feedbackRef = doc(collection(db, 'buildathonProjects', project.id, 'feedback'));
      const projectRef = doc(db, 'buildathonProjects', project.id);

      await runTransaction(db, async (tx) => {
        const projectSnap = await tx.get(projectRef);
        if (!projectSnap.exists()) throw new Error('Projet introuvable');

        const projectData = projectSnap.data() || {};
        const currentFeedback = Number.isFinite(Number(projectData.feedbackCount))
          ? Number(projectData.feedbackCount)
          : 0;
        const currentComments = Number.isFinite(Number(projectData.commentsCount))
          ? Number(projectData.commentsCount)
          : 0;
        const nextCount = Math.max(currentFeedback, currentComments) + 1;

        tx.set(feedbackRef, {
          userId: user.uid,
          authorName: userProfile?.displayName || user.displayName || user.email || 'Participant',
          authorEmail: user.email || null,
          message,
          createdAt: serverTimestamp(),
        });

        tx.update(projectRef, {
          feedbackCount: nextCount,
          commentsCount: nextCount,
        });
      });

      setNewFeedback('');
      toast.success('Feedback publié (discussion uniquement)');
    } catch (error) {
      toast.error('Erreur lors de la publication du feedback');
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function handleReportComment(item) {
    if (!user?.uid || !project?.id || !item?.id) return;

    const reason = reportReasons[item.id] || 'spam';
    const details = (reportDetails[item.id] || '').trim();
    const reportId = `${item.id}_${user.uid}`;

    setSubmittingReportId(item.id);
    try {
      await setDoc(doc(db, 'buildathonProjects', project.id, 'feedbackReports', reportId), {
        feedbackId: item.id,
        projectId: project.id,
        reportedBy: user.uid,
        reason,
        details,
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: null,
      });

      setReportingCommentId(null);
      toast.success('Commentaire signale');
    } catch (error) {
      toast.error('Erreur lors du signalement');
    } finally {
      setSubmittingReportId(null);
    }
  }

  async function resolveReportsForComment(feedbackId, resolution) {
    if (!project?.id || !feedbackId || !user?.uid) return;
    const openReports = feedbackReports.filter((report) => report.feedbackId === feedbackId && report.status === 'open');

    await Promise.all(openReports.map((report) => (
      setDoc(doc(db, 'buildathonProjects', project.id, 'feedbackReports', report.id), {
        status: 'resolved',
        resolution,
        resolvedBy: user.uid,
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
    )));
  }

  async function handleToggleHideComment(item) {
    if (!isAdmin || !project?.id || !item?.id || moderatingCommentId) return;
    const nextHidden = !item.hidden;

    setModeratingCommentId(item.id);
    try {
      await updateDoc(doc(db, 'buildathonProjects', project.id, 'feedback', item.id), {
        hidden: nextHidden,
        hiddenAt: nextHidden ? serverTimestamp() : null,
        hiddenBy: nextHidden ? user?.uid || null : null,
        moderationReason: nextHidden ? 'reported-content' : null,
      });

      await resolveReportsForComment(item.id, nextHidden ? 'hidden' : 'unhidden');
      toast.success(nextHidden ? 'Commentaire masque' : 'Commentaire rendu visible');
    } catch (error) {
      toast.error('Erreur lors de la moderation');
    } finally {
      setModeratingCommentId(null);
    }
  }

  async function handleDeleteComment(item) {
    if (!isAdmin || !project?.id || !item?.id || moderatingCommentId) return;

    setModeratingCommentId(item.id);
    try {
      await deleteDoc(doc(db, 'buildathonProjects', project.id, 'feedback', item.id));
      await resolveReportsForComment(item.id, 'deleted');
      toast.success('Commentaire supprime');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setModeratingCommentId(null);
    }
  }

  async function handleDeleteProject() {
    if (!isAdmin || !project?.id) return;
    if (!window.confirm('Supprimer ce projet ? Cette action est irreversible.')) return;

    try {
      await deleteDoc(doc(db, 'buildathonProjects', project.id));
      toast.success('Projet supprimé');
      window.location.assign(`/projects/${buildathonId}`);
    } catch (error) {
      toast.error('Erreur lors de la suppression du projet');
    }
  }

  async function handleCopyShareLink(shareUrl) {
    if (!shareUrl || copyingShareLink) return;
    setCopyingShareLink(true);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const tempInput = document.createElement('textarea');
        tempInput.value = shareUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      toast.success('Lien du projet copié');
    } catch (error) {
      toast.error('Impossible de copier le lien');
    } finally {
      setCopyingShareLink(false);
    }
  }

  async function handleSaveProjectEdits() {
    if (!project?.id || !editForm || savingProject) return;
    if (!canEditProject) {
      toast.error('La modification est fermée après la date limite');
      return;
    }

    const nextTitle = editForm.title.trim();
    const nextTeamName = editForm.teamName.trim();
    const nextRepoUrl = editForm.repoUrl.trim();
    const nextDemoUrl = editForm.demoUrl.trim();

    if (!nextTitle || !nextTeamName || !nextRepoUrl || !nextDemoUrl) {
      toast.error('Titre, équipe, GitHub et démo sont obligatoires');
      return;
    }

    if (!isValidGitHubRepoUrl(nextRepoUrl)) {
      toast.error('Le lien GitHub doit être un dépôt valide (https://github.com/owner/repo)');
      return;
    }

    if (!isValidDemoUrl(nextDemoUrl)) {
      toast.error('Le lien démo doit être une URL HTTPS valide');
      return;
    }

    setSavingProject(true);
    try {
      await updateDoc(doc(db, 'buildathonProjects', project.id), {
        title: nextTitle,
        description: editForm.description.trim(),
        category: editForm.category || 'other',
        teamName: nextTeamName,
        repoUrl: nextRepoUrl,
        demoUrl: nextDemoUrl,
        updatedAt: serverTimestamp(),
      });
      toast.success('Projet mis à jour');
      setIsEditingProject(false);
    } catch (error) {
      toast.error('Erreur lors de la mise à jour du projet');
    } finally {
      setSavingProject(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="glass-card p-8 text-center">
          <h1 className="text-2xl font-bold text-heading mb-2">Chargement impossible</h1>
          <p className="text-body mb-6">{loadError}</p>
          <Link to={`/projects/${buildathonId}`} className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour au buildathon
          </Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="glass-card p-8 text-center">
          <h1 className="text-2xl font-bold text-heading mb-2">Projet introuvable</h1>
          <p className="text-body mb-6">Ce projet n'existe pas ou n'est plus accessible.</p>
          <Link to={`/projects/${buildathonId}`} className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour au buildathon
          </Link>
        </div>
      </div>
    );
  }

  const canViewProject = isAdmin || isProjectVisibleForParticipant(project, event, user?.uid);
  if (!canViewProject) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="glass-card p-8 text-center">
          <h1 className="text-2xl font-bold text-heading mb-2">Projet non accessible</h1>
          <p className="text-body mb-6">Ce projet n'est pas public pour le moment.</p>
          <Link to={`/projects/${buildathonId}`} className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour au buildathon
          </Link>
        </div>
      </div>
    );
  }

  const tags = getProjectTags(project);
  const stack = getProjectStack(project);
  const projectStatus = getCanonicalProjectStatus(project);
  const projectDeadlineValue = event?.voteEndDate || event?.endDate || event?.submissionEndDate || null;
  const projectDeadlineMs = projectDeadlineValue ? new Date(projectDeadlineValue).getTime() : null;
  const canEditProject = Boolean(
    isAdmin || (
      isProjectOwnerOrMember(project, user?.uid) && (
        !Number.isFinite(projectDeadlineMs) || Date.now() <= projectDeadlineMs
      )
    )
  );
  const canShareProject = isAdmin || isProjectOwnerOrMember(project, user?.uid) || projectStatus === 'publie';
  const visibilityLabel = projectStatus === 'publie'
    ? 'Public'
    : (projectStatus === 'rejete' ? 'Non public (rejete)' : 'Non public');
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/projects/${buildathonId}/project/${project.id}`
    : '';
  const shareText = `Découvrez ce projet Buildathon: ${project.title}`;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const feedbackCount = Math.max(
    Number(project.feedbackCount || 0),
    Number(project.commentsCount || 0),
    visibleFeedbackList.length
  );
  const isJuryMode = event?.mode === 'jury' || event?.juryModeEnabled === true || event?.rankingMode === 'jury';

  return (
    <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
      <div>
        <Link to={`/projects/${buildathonId}`} className="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Retour au buildathon
        </Link>

        <div className="glass-card p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-heading">{project.title}</h1>
              <p className="text-sm text-muted mt-1 inline-flex items-center gap-2">
                <Users className="w-4 h-4" />
                {getTeamLabel(project, isAdmin)}
              </p>
            </div>
            <div className="flex items-center gap-2 self-start flex-wrap">
              <span className="text-xs px-3 py-1 rounded-full border border-themed bg-surface text-muted">{project.statusLabel}</span>
              <span className={`text-xs px-3 py-1 rounded-full border ${visibilityLabel === 'Public' ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'}`}>
                {visibilityLabel}
              </span>
            </div>
          </div>

          <p className="text-body whitespace-pre-wrap break-words">{project.description || 'Aucune description fournie.'}</p>

          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full border border-themed bg-surface text-muted">
                {tag}
              </span>
            ))}
            {tags.length === 0 && <span className="text-xs text-muted">Aucun tag</span>}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-themed bg-black/5 dark:bg-white/5">
              <p className="text-muted">Date de soumission</p>
              <p className="text-heading font-medium inline-flex items-center gap-1 mt-1"><Calendar className="w-3.5 h-3.5" />{formatDate(project.submittedAt)}</p>
            </div>
            <div className="p-3 rounded-lg border border-themed bg-black/5 dark:bg-white/5">
              <p className="text-muted">Vote (classement)</p>
              <p className="text-heading font-medium mt-1">{project.voteCount || 0}</p>
            </div>
            <div className="p-3 rounded-lg border border-themed bg-black/5 dark:bg-white/5">
              <p className="text-muted">Like (popularité)</p>
              <p className="text-heading font-medium mt-1">{project.likesCount || 0}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <a
              href={project.repoUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${project.repoUrl ? 'border-themed text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5' : 'border-themed text-muted pointer-events-none opacity-60'}`}
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
            <a
              href={project.demoUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${project.demoUrl ? 'border-themed text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5' : 'border-themed text-muted pointer-events-none opacity-60'}`}
            >
              <ExternalLink className="w-4 h-4" />
              Démo
            </a>
          </div>

          <div>
            <p className="text-xs text-muted mb-2">Stack</p>
            <div className="flex flex-wrap gap-2">
              {stack.length > 0 ? (
                stack.map((item) => (
                  <span key={item} className="text-[11px] px-2.5 py-1 rounded-full border border-themed bg-surface text-body">
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted">Stack non renseignée.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-5">
        <h2 className="text-lg font-semibold text-heading">Actions séparées</h2>
        <p className="text-xs text-muted">
          Vote = {isJuryMode ? 'score global UjuziAI uniquement' : 'impacte le classement Buildathon'};
          {' '}Like = score global UjuziAI uniquement; Feedback = discussion uniquement.
        </p>
        <p className="text-xs text-muted">
          1 vote = 10 points (global UjuziAI). {isJuryMode ? 'Le classement Buildathon est basé sur les juges.' : 'Le classement Buildathon public utilise les votes.'}
        </p>
        <p className="text-xs text-muted">Départage classement: {event?.tieBreakRuleText || 'En cas d\'égalité, le projet soumis le plus tôt est prioritaire.'}</p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleVote}
            disabled={!event?.votingEnabled || updatingVote}
            className={`px-4 py-2 rounded-lg border text-sm inline-flex items-center gap-2 transition-colors ${hasVoted ? 'border-primary-500/40 bg-primary-500/10 text-primary-300' : 'border-themed text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5'} ${!event?.votingEnabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <ThumbsUp className={`w-4 h-4 ${hasVoted ? 'fill-current' : ''}`} />
            {hasVoted ? 'Retirer le vote' : 'Voter'} ({project.voteCount || 0})
          </button>

          <button
            onClick={handleLike}
            disabled={updatingLike}
            className={`px-4 py-2 rounded-lg border text-sm inline-flex items-center gap-2 transition-colors ${hasLiked ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-themed text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5'}`}
          >
            <Heart className={`w-4 h-4 ${hasLiked ? 'fill-current' : ''}`} />
            {hasLiked ? 'Retirer le like' : 'Liker'} ({project.likesCount || 0})
          </button>

          <span className="px-4 py-2 rounded-lg border border-themed text-sm text-muted inline-flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Feedback ({feedbackCount})
          </span>

          {isAdmin && (
            <button
              type="button"
              onClick={handleDeleteProject}
              className="px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm inline-flex items-center gap-2 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer le projet
            </button>
          )}
        </div>

        <div className="pt-3 border-t border-themed space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted inline-flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5" />
              Partage du projet
            </p>
            {!canShareProject && (
              <p className="text-[11px] text-amber-400">Seul l'auteur du projet ou l'admin peut le partager pour le moment.</p>
            )}
          </div>

          {canShareProject ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleCopyShareLink(shareUrl)}
                disabled={copyingShareLink}
                className="px-3 py-1.5 rounded-lg border border-themed text-xs text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                {copyingShareLink ? 'Copie...' : 'Copier le lien'}
              </button>
              <a
                href={whatsappShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg border border-themed text-xs text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5"
              >
                WhatsApp
              </a>
              <a
                href={xShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg border border-themed text-xs text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5"
              >
                X
              </a>
              <a
                href={linkedinShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg border border-themed text-xs text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5"
              >
                LinkedIn
              </a>
            </div>
          ) : (
            <p className="text-xs text-muted">Le partage est réservé à l'auteur du projet ou à l'admin pour obtenir des votes via le lien de partage.</p>
          )}
        </div>
      </div>

      {canEditProject && editForm && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold text-heading">Modifier le projet</h2>
            <p className="text-xs text-muted">
              Modifiable jusqu'au {formatDate(projectDeadlineValue || event?.endDate)}
            </p>
          </div>

          {!isEditingProject ? (
            <button
              type="button"
              onClick={() => setIsEditingProject(true)}
              className="btn-secondary inline-flex items-center gap-2 text-sm"
            >
              Modifier le projet
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Titre du projet"
                />
                <input
                  type="text"
                  value={editForm.teamName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, teamName: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Nom de l'équipe"
                />
              </div>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                className="input-field w-full h-28 resize-none"
                placeholder="Description du projet"
              />
              <div className="grid md:grid-cols-3 gap-3">
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="input-field w-full"
                >
                  <option value="ai-ml">IA / ML</option>
                  <option value="web">Web</option>
                  <option value="mobile">Mobile</option>
                  <option value="cloud">Cloud</option>
                  <option value="data">Data</option>
                  <option value="other">Autre</option>
                </select>
                <input
                  type="url"
                  value={editForm.repoUrl}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, repoUrl: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Lien GitHub"
                />
                <input
                  type="url"
                  value={editForm.demoUrl}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, demoUrl: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Lien démo / vidéo"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveProjectEdits}
                  disabled={savingProject}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {savingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {savingProject ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditForm({
                      title: project.title || '',
                      description: project.description || '',
                      category: project.category || 'other',
                      teamName: project.teamName || '',
                      repoUrl: project.repoUrl || '',
                      demoUrl: project.demoUrl || '',
                    });
                    setIsEditingProject(false);
                  }}
                  className="btn-secondary"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!canEditProject && isProjectOwnerOrMember(project, user?.uid) && (
        <div className="glass-card p-4 border border-amber-500/20 bg-amber-500/5 text-sm text-amber-200">
          La modification de ce projet est fermée après la date limite du buildathon.
        </div>
      )}

      <div className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-heading inline-flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-400" />
          Discussion
        </h2>
        {isAdmin && (
          <p className="text-xs text-amber-300">
            Signalements ouverts: {openReportsCount}
          </p>
        )}

        <form onSubmit={handleSubmitFeedback} className="space-y-3">
          <textarea
            value={newFeedback}
            onChange={(e) => setNewFeedback(e.target.value)}
            className="input-field w-full h-28 resize-none"
            placeholder="Partagez un feedback utile sur le projet..."
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submittingFeedback || !newFeedback.trim()}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submittingFeedback ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Publier
            </button>
          </div>
        </form>

        <div className="space-y-3">
          {visibleFeedbackList.length === 0 ? (
            <p className="text-sm text-muted">Aucun commentaire pour le moment.</p>
          ) : (
            visibleFeedbackList.map((item) => (
              <div key={item.id} className="p-3 rounded-lg border border-themed bg-black/5 dark:bg-white/5">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-sm font-medium text-heading">{item.authorName}</p>
                  <p className="text-[11px] text-muted">{formatDate(item.createdAt)}</p>
                </div>
                <p className="text-sm text-body whitespace-pre-wrap">{item.message}</p>
                {isAdmin && item.hidden && (
                  <p className="text-[11px] text-amber-400 mt-2">Commentaire masque</p>
                )}

                {isAdmin && (openReportsByFeedbackId[item.id]?.length || 0) > 0 && (
                  <div className="mt-2 p-2 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-amber-300">
                        {openReportsByFeedbackId[item.id].length} signalement(s) ouvert(s)
                      </p>
                      <button
                        type="button"
                        onClick={() => setExpandedReportsCommentId((current) => current === item.id ? null : item.id)}
                        className="text-[11px] text-amber-200 hover:text-amber-100"
                      >
                        {expandedReportsCommentId === item.id ? 'Masquer details' : 'Voir details'}
                      </button>
                    </div>

                    {expandedReportsCommentId === item.id && (
                      <div className="space-y-1">
                        {openReportsByFeedbackId[item.id].map((report) => (
                          <div key={report.id} className="text-[11px] text-muted border border-themed rounded p-2 bg-surface">
                            <p>Raison: {report.reason}</p>
                            {report.details && <p>Details: {report.details}</p>}
                            <p>Date: {formatDate(report.createdAt)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleHideComment(item)}
                        disabled={moderatingCommentId === item.id}
                        className="text-xs px-2.5 py-1.5 rounded border border-amber-500/30 text-amber-300 bg-amber-500/10 disabled:opacity-60"
                      >
                        {moderatingCommentId === item.id ? 'Traitement...' : item.hidden ? 'Reafficher' : 'Masquer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(item)}
                        disabled={moderatingCommentId === item.id}
                        className="text-xs px-2.5 py-1.5 rounded border border-red-500/30 text-red-300 bg-red-500/10 disabled:opacity-60"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}

                {!isAdmin && user?.uid && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setReportingCommentId((current) => current === item.id ? null : item.id)}
                      className="text-[11px] text-red-400 hover:text-red-300 inline-flex items-center gap-1"
                    >
                      <Flag className="w-3 h-3" />
                      Signaler
                    </button>

                    {reportingCommentId === item.id && (
                      <div className="mt-2 p-2 rounded-lg border border-red-500/20 bg-red-500/5 space-y-2">
                        <select
                          value={reportReasons[item.id] || 'spam'}
                          onChange={(e) => setReportReasons((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="input-field w-full text-xs"
                        >
                          <option value="spam">Spam</option>
                          <option value="inappropriate">Inappropriate</option>
                          <option value="harassment">Harassment</option>
                          <option value="other">Other</option>
                        </select>
                        <input
                          type="text"
                          value={reportDetails[item.id] || ''}
                          onChange={(e) => setReportDetails((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="input-field w-full text-xs"
                          placeholder="Details optionnels"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setReportingCommentId(null)}
                            className="text-xs px-2.5 py-1.5 rounded border border-themed text-muted"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReportComment(item)}
                            disabled={submittingReportId === item.id}
                            className="text-xs px-2.5 py-1.5 rounded border border-red-500/30 text-red-300 bg-red-500/10 disabled:opacity-60"
                          >
                            {submittingReportId === item.id ? 'Envoi...' : 'Envoyer signalement'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
