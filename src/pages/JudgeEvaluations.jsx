import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, collectionGroup, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { ClipboardCheck, Loader2, Trophy, CheckCircle2, Clock3 } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

function formatCount(value) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('fr-FR').format(safeValue);
}

export default function JudgeEvaluations() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState([]);
  const [progressByBuildathon, setProgressByBuildathon] = useState({});

  useEffect(() => {
    if (!user?.uid) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    const invitationsQuery = query(
      collectionGroup(db, 'judgeInvitations'),
      where('inviteeUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(invitationsQuery, (snap) => {
      const nextInvitations = [];
      snap.forEach((d) => nextInvitations.push({ id: d.id, ...d.data() }));
      nextInvitations.sort((a, b) => {
        const aDate = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      setInvitations(nextInvitations);
      setLoading(false);
    }, () => {
      setInvitations([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;

    async function fetchProgress() {
      const acceptedInvitations = invitations.filter((item) => item.status === 'accepted');
      if (acceptedInvitations.length === 0) {
        setProgressByBuildathon({});
        return;
      }

      const nextProgress = {};

      for (const invitation of acceptedInvitations) {
        const buildathonId = invitation.buildathonId;
        if (!buildathonId) continue;

        const projectsSnap = await getDocs(query(collection(db, 'buildathonProjects'), where('buildathonId', '==', buildathonId)));
        const totalProjects = projectsSnap.size;

        const scoresSnap = await getDocs(query(
          collectionGroup(db, 'judgeScores'),
          where('buildathonId', '==', buildathonId),
          where('judgeId', '==', user.uid)
        ));

        nextProgress[buildathonId] = {
          totalProjects,
          scoredProjects: scoresSnap.size,
        };
      }

      if (!cancelled) {
        setProgressByBuildathon(nextProgress);
      }
    }

    if (user?.uid) {
      fetchProgress();
    }

    return () => {
      cancelled = true;
    };
  }, [invitations, user?.uid]);

  const pendingInvitations = useMemo(
    () => invitations.filter((item) => item.status === 'pending'),
    [invitations]
  );

  const acceptedInvitations = useMemo(
    () => invitations.filter((item) => item.status === 'accepted'),
    [invitations]
  );

  async function handleInvitationDecision(invitation, status) {
    if (!user?.uid || !invitation?.buildathonId) return;

    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');

    const invitationRef = doc(db, 'buildathons', invitation.buildathonId, 'judgeInvitations', user.uid);
    await setDoc(invitationRef, {
      status,
      updatedAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
    }, { merge: true });

    if (status === 'accepted') {
      const judgeRef = doc(db, 'buildathons', invitation.buildathonId, 'judges', user.uid);
      await setDoc(judgeRef, {
        userId: user.uid,
        buildathonId: invitation.buildathonId,
        buildathonTitle: invitation.buildathonTitle || 'Buildathon',
        active: true,
        acceptedAt: serverTimestamp(),
        invitedBy: invitation.invitedBy || null,
      }, { merge: true });
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-10">
        <div className="glass-card p-8 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
          <p className="text-heading font-medium">Chargement de vos évaluations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="glass-card p-6">
        <h1 className="text-2xl font-bold text-heading inline-flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-400" />
          Mes évaluations
        </h1>
        <p className="text-sm text-muted mt-2">Suivez vos invitations et votre progression de notation par Buildathon.</p>
      </div>

      {pendingInvitations.length > 0 && (
        <div className="glass-card p-6 space-y-3">
          <h2 className="text-lg font-semibold text-heading inline-flex items-center gap-2">
            <Clock3 className="w-5 h-5 text-amber-400" />
            Invitations en attente
          </h2>
          <div className="space-y-3">
            {pendingInvitations.map((invitation) => (
              <div key={`${invitation.buildathonId}_${invitation.inviteeUid}`} className="rounded-xl border border-themed p-4 bg-black/5 dark:bg-white/5 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-heading font-medium">{invitation.buildathonTitle || 'Buildathon'}</p>
                  <p className="text-xs text-muted">Invitation juge</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleInvitationDecision(invitation, 'declined')}
                    className="px-3 py-1.5 rounded-lg border border-themed text-xs text-body hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    Refuser
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInvitationDecision(invitation, 'accepted')}
                    className="px-3 py-1.5 rounded-lg border border-primary-500/30 bg-primary-600/20 text-primary-200 text-xs"
                  >
                    Accepter
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-lg font-semibold text-heading inline-flex items-center gap-2">
          <Trophy className="w-5 h-5 text-emerald-400" />
          Buildathons assignés
        </h2>

        {acceptedInvitations.length === 0 ? (
          <p className="text-sm text-muted">Aucun Buildathon assigné pour le moment.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {acceptedInvitations.map((invitation) => {
              const progress = progressByBuildathon[invitation.buildathonId] || { totalProjects: 0, scoredProjects: 0 };
              return (
                <Link
                  key={`${invitation.buildathonId}_${invitation.inviteeUid}`}
                  to={`/judge/buildathon/${invitation.buildathonId}`}
                  className="rounded-xl border border-themed p-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  <p className="font-semibold text-heading">{invitation.buildathonTitle || 'Buildathon'}</p>
                  <p className="text-xs text-muted mt-1">
                    Progression: {formatCount(progress.scoredProjects)}/{formatCount(progress.totalProjects)} projets évalués
                  </p>
                  <p className="text-xs text-emerald-400 mt-2 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Accès juge actif
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
