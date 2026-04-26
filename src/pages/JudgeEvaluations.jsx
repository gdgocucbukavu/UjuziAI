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
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState([]);
  const [progressByBuildathon, setProgressByBuildathon] = useState({});

  useEffect(() => {
    if (!user?.uid) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    const legacyUid = String(userProfile?.uid || '').trim();
    const email = String(user.email || userProfile?.email || '').trim();
    const emailLower = email.toLowerCase();

    // DEBUG: Log current user info to see what we are matching against
    console.info('[DEBUG] JudgeEvaluations - Current User:', {
      uid: user.uid,
      legacyUid,
      email: user.email,
      emailLower
    });

    // SIMPLIFIED QUERIES: 
    // 1. By UID (primary)
    // 2. By Lowercase Email (fallback)
    // We check both 'invitations' and 'judgeInvitations' collections
    
    const queries = [
      query(collectionGroup(db, 'invitations'), where('inviteeUid', '==', user.uid)),
      query(collectionGroup(db, 'judgeInvitations'), where('inviteeUid', '==', user.uid)),
      query(collectionGroup(db, 'invitations'), where('invitedUid', '==', user.uid)),
      query(collectionGroup(db, 'judgeInvitations'), where('invitedUid', '==', user.uid)),
      query(collectionGroup(db, 'invitations'), where('inviteeEmailLower', '==', emailLower)),
      query(collectionGroup(db, 'judgeInvitations'), where('inviteeEmailLower', '==', emailLower)),
      query(collectionGroup(db, 'invitations'), where('invitedEmailLower', '==', emailLower)),
      query(collectionGroup(db, 'judgeInvitations'), where('invitedEmailLower', '==', emailLower)),
      query(collectionGroup(db, 'invitations'), where('inviteeEmail', '==', email)),
      query(collectionGroup(db, 'judgeInvitations'), where('inviteeEmail', '==', email)),
      query(collectionGroup(db, 'invitations'), where('invitedEmail', '==', email)),
      query(collectionGroup(db, 'judgeInvitations'), where('invitedEmail', '==', email))
    ];

    if (legacyUid && legacyUid !== user.uid) {
      queries.push(
        query(collectionGroup(db, 'invitations'), where('inviteeUid', '==', legacyUid)),
        query(collectionGroup(db, 'judgeInvitations'), where('inviteeUid', '==', legacyUid)),
        query(collectionGroup(db, 'invitations'), where('invitedUid', '==', legacyUid)),
        query(collectionGroup(db, 'judgeInvitations'), where('invitedUid', '==', legacyUid)),
        query(collectionGroup(db, 'invitations'), where('inviteeLegacyUid', '==', legacyUid)),
        query(collectionGroup(db, 'judgeInvitations'), where('inviteeLegacyUid', '==', legacyUid)),
        query(collectionGroup(db, 'invitations'), where('invitedLegacyUid', '==', legacyUid)),
        query(collectionGroup(db, 'judgeInvitations'), where('invitedLegacyUid', '==', legacyUid))
      );
    }

    const unsubscribers = [];
    const results = new Map();

    const getStatusPriority = (status) => {
      if (status === 'accepted') return 3;
      if (status === 'pending') return 2;
      if (status === 'declined') return 1;
      return 0;
    };

    const setMergedInvitation = (incoming) => {
      const existing = results.get(incoming.buildathonId);
      if (!existing) {
        results.set(incoming.buildathonId, incoming);
        return;
      }

      const existingPriority = getStatusPriority(existing.status);
      const incomingPriority = getStatusPriority(incoming.status);

      if (incomingPriority > existingPriority) {
        results.set(incoming.buildathonId, incoming);
      }
    };

    const updateInvitations = () => {
      const merged = Array.from(results.values()).sort((a, b) => {
        const aDate = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });

      console.info('[DEBUG] JudgeEvaluations - Merged Invitations:', merged.length, merged.map(i => ({
        id: i.id,
        buildathonId: i.buildathonId,
        status: i.status
      })));

      setInvitations(merged);
      setLoading(false);
    };

    queries.forEach((q, index) => {
      const unsub = onSnapshot(q, (snap) => {
        console.info(`[DEBUG] Query ${index} snapshot size:`, snap.size);
        snap.forEach((d) => {
          const data = { id: d.id, __sourcePath: d.ref.path, __sourceCollection: d.ref.parent.id, ...d.data() };
          if (!data.buildathonId) return;
          // Key by buildathonId to avoid duplicates from different queries/collections.
          // Keep the strongest status when duplicates exist.
          setMergedInvitation(data);
        });
        updateInvitations();
      }, (err) => {
        console.error(`[DEBUG] Query ${index} error:`, err);
        updateInvitations();
      });
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, [user?.uid, user?.email, userProfile?.uid, userProfile?.email]);

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

    const invitationData = {
      status,
      updatedAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
    };

    if (import.meta.env.DEV) {
      console.info('[JudgeEvaluations] invitation decision', {
        uid: user.uid,
        buildathonId: invitation.buildathonId,
        status,
        invitationId: invitation.id || null,
        inviteeUid: invitation.inviteeUid || null,
        invitedUid: invitation.invitedUid || null,
      });
    }

    const invitationCollection = invitation.__sourceCollection === 'judgeInvitations' ? 'judgeInvitations' : 'invitations';
    const invitationDocId = invitation.id || user.uid;

    await Promise.all([
      setDoc(doc(db, 'buildathons', invitation.buildathonId, invitationCollection, invitationDocId), invitationData, { merge: true }),
      setDoc(doc(db, 'buildathons', invitation.buildathonId, 'invitations', invitationDocId), invitationData, { merge: true }),
      setDoc(doc(db, 'buildathons', invitation.buildathonId, 'judgeInvitations', invitationDocId), invitationData, { merge: true }),
    ]);

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
