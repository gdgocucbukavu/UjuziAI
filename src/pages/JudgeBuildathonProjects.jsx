import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, collectionGroup, doc, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

function normalizeDate(value) {
  if (!value) return null;
  if (value?.toDate) {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function JudgeBuildathonProjects() {
  const { buildathonId } = useParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState(null);
  const [projects, setProjects] = useState([]);
  const [judgeScores, setJudgeScores] = useState([]);
  const [hasJudgeAccess, setHasJudgeAccess] = useState(false);

  useEffect(() => {
    if (!buildathonId || !user?.uid) {
      setLoading(false);
      return;
    }

    const invitationRef = doc(db, 'buildathons', buildathonId, 'judgeInvitations', user.uid);
    const judgeRef = doc(db, 'buildathons', buildathonId, 'judges', user.uid);

    const unsubInvitation = onSnapshot(invitationRef, (snap) => {
      const data = snap.data();
      const accepted = data?.status === 'accepted';
      setHasJudgeAccess(Boolean(accepted));
    });

    const unsubJudge = onSnapshot(judgeRef, (snap) => {
      const active = snap.data()?.active === true;
      setHasJudgeAccess((prev) => prev || active);
    });

    const unsubEvent = onSnapshot(doc(db, 'buildathons', buildathonId), (snap) => {
      setEvent(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    }, () => setLoading(false));

    const unsubProjects = onSnapshot(
      query(collection(db, 'buildathonProjects'), where('buildathonId', '==', buildathonId)),
      (snap) => {
        const items = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
          const aDate = normalizeDate(a.submittedAt || a.createdAt)?.getTime() || Number.MAX_SAFE_INTEGER;
          const bDate = normalizeDate(b.submittedAt || b.createdAt)?.getTime() || Number.MAX_SAFE_INTEGER;
          return aDate - bDate;
        });
        setProjects(items);
      }
    );

    const unsubJudgeScores = onSnapshot(
      query(
        collectionGroup(db, 'judgeScores'),
        where('buildathonId', '==', buildathonId),
        where('judgeId', '==', user.uid)
      ),
      (snap) => {
        const items = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        setJudgeScores(items);
      }
    );

    return () => {
      unsubInvitation();
      unsubJudge();
      unsubEvent();
      unsubProjects();
      unsubJudgeScores();
    };
  }, [buildathonId, user?.uid]);

  const scoreByProjectId = useMemo(() => {
    const map = {};
    judgeScores.forEach((score) => {
      if (!score.projectId) return;
      map[score.projectId] = score;
    });
    return map;
  }, [judgeScores]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-10">
        <div className="glass-card p-8 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
          <p className="text-heading font-medium">Chargement des projets à évaluer...</p>
        </div>
      </div>
    );
  }

  if (!hasJudgeAccess) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="glass-card p-8 text-center">
          <h1 className="text-2xl font-bold text-heading mb-2">Accès juge requis</h1>
          <p className="text-body mb-6">Vous devez accepter l'invitation juge pour accéder à cette section.</p>
          <Link to="/judge/evaluations" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour à Mes évaluations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="glass-card p-6 space-y-2">
        <Link to="/judge/evaluations" className="text-sm text-primary-300 inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Retour à Mes évaluations
        </Link>
        <h1 className="text-2xl font-bold text-heading">{event?.title || 'Buildathon'}</h1>
        <p className="text-sm text-muted">Sélectionnez un projet pour saisir vos notes par critères.</p>
      </div>

      {projects.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-body">Aucun projet à évaluer pour le moment.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {projects.map((project) => {
            const score = scoreByProjectId[project.id];
            const isScored = Boolean(score);
            return (
              <Link
                key={project.id}
                to={`/judge/buildathon/${buildathonId}/project/${project.id}`}
                className="rounded-xl border border-themed p-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-heading truncate">{project.title || 'Projet sans titre'}</p>
                    <p className="text-xs text-muted truncate">{project.teamName || 'Equipe participante'}</p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${isScored ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' : 'border-amber-500/30 text-amber-300 bg-amber-500/10'}`}>
                    {isScored ? 'Noté' : 'En attente'}
                  </span>
                </div>
                <div className="mt-3 text-xs">
                  {isScored ? (
                    <p className="text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Score total: {Number(score.totalScore || 0).toFixed(1)}
                    </p>
                  ) : (
                    <p className="text-amber-400 inline-flex items-center gap-1">
                      <Clock3 className="w-3.5 h-3.5" />
                      Évaluation non soumise
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
