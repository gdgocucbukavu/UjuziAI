import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, collectionGroup, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { aggregateJudgeScores, computeJudgeScore, normalizeJudgeCriteria } from '../lib/judging';

function asMultilineText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

export default function JudgeProjectScoring() {
  const { buildathonId, projectId } = useParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState(null);
  const [project, setProject] = useState(null);
  const [judgeScoreDoc, setJudgeScoreDoc] = useState(null);
  const [formScores, setFormScores] = useState({});
  const [comment, setComment] = useState('');
  const [touchedScores, setTouchedScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [hasJudgeAccess, setHasJudgeAccess] = useState(false);

  const criteria = useMemo(() => normalizeJudgeCriteria(event?.judgeCriteria), [event?.judgeCriteria]);

  useEffect(() => {
    if (!buildathonId || !projectId || !user?.uid) {
      setLoading(false);
      return;
    }

    const invitationRef = doc(db, 'buildathons', buildathonId, 'judgeInvitations', user.uid);
    const judgeRef = doc(db, 'buildathons', buildathonId, 'judges', user.uid);

    const unsubInvitation = onSnapshot(invitationRef, (snap) => {
      const accepted = snap.data()?.status === 'accepted';
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

    const unsubProject = onSnapshot(doc(db, 'buildathonProjects', projectId), (snap) => {
      const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      if (data && data.buildathonId === buildathonId) {
        setProject(data);
      } else {
        setProject(null);
      }
    });

    const unsubJudgeScore = onSnapshot(doc(db, 'buildathonProjects', projectId, 'judgeScores', user.uid), (snap) => {
      const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      setJudgeScoreDoc(data);
      if (data?.criteriaScores) {
        setFormScores(data.criteriaScores);
      }
      if (typeof data?.comment === 'string') {
        setComment(data.comment);
      }
    });

    return () => {
      unsubInvitation();
      unsubJudge();
      unsubEvent();
      unsubProject();
      unsubJudgeScore();
    };
  }, [buildathonId, projectId, user?.uid]);

  useEffect(() => {
    if (judgeScoreDoc?.criteriaScores) return;
    const initial = {};
    criteria.forEach((criterion) => {
      initial[criterion.key] = '';
    });
    setFormScores(initial);
    setTouchedScores({});
  }, [criteria, judgeScoreDoc?.criteriaScores]);

  useEffect(() => {
    if (!judgeScoreDoc?.criteriaScores) return;
    const allTouched = {};
    criteria.forEach((criterion) => {
      allTouched[criterion.key] = true;
    });
    setTouchedScores(allTouched);
  }, [judgeScoreDoc?.id, criteria]);

  const computed = useMemo(() => computeJudgeScore(criteria, formScores), [criteria, formScores]);
  const missingCriteria = useMemo(() => {
    return criteria.filter((criterion) => {
      const value = formScores?.[criterion.key];
      if (value === '' || value === null || value === undefined) return true;
      const numericValue = Number(value);
      return !Number.isFinite(numericValue);
    });
  }, [criteria, formScores]);

  const hasCompleteGrid = missingCriteria.length === 0;

  async function handleSubmitScore() {
    if (!hasJudgeAccess || !user?.uid || !project?.id) return;

    if (!hasCompleteGrid) {
      toast.error('Veuillez noter tous les critères avant la soumission.');
      return;
    }

    if (judgeScoreDoc) {
      const confirmed = window.confirm('Vous avez déjà soumis une notation. Voulez-vous la mettre à jour ?');
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const judgeScoreRef = doc(db, 'buildathonProjects', project.id, 'judgeScores', user.uid);
      await setDoc(judgeScoreRef, {
        judgeId: user.uid,
        buildathonId,
        projectId: project.id,
        criteriaScores: computed.scoreByCriterion,
        totalScore: computed.totalScore,
        averageScore: computed.averageScore,
        comment: asMultilineText(comment),
        updatedAt: serverTimestamp(),
        createdAt: judgeScoreDoc?.createdAt || serverTimestamp(),
      }, { merge: true });

      const scoresSnap = await getDocs(query(collection(db, 'buildathonProjects', project.id, 'judgeScores')));
      const allScores = [];
      scoresSnap.forEach((d) => allScores.push(d.data()));
      const aggregate = aggregateJudgeScores(allScores);

      await updateDoc(doc(db, 'buildathonProjects', project.id), {
        judgeScoreTotal: aggregate.judgeScoreTotal,
        judgeScoreAverage: aggregate.judgeScoreAverage,
        judgeScoreCount: aggregate.judgeScoreCount,
        updatedAt: serverTimestamp(),
      });

      toast.success('Notation enregistrée');
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde de la notation');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="glass-card p-8 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
          <p className="text-heading font-medium">Chargement de la fiche de notation...</p>
        </div>
      </div>
    );
  }

  if (!hasJudgeAccess) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="glass-card p-8 text-center">
          <h1 className="text-2xl font-bold text-heading mb-2">Accès juge requis</h1>
          <p className="text-body mb-6">Vous devez être juge actif pour noter ce projet.</p>
          <Link to="/judge/evaluations" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour à Mes évaluations
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
          <p className="text-body mb-6">Impossible de charger ce projet pour la notation.</p>
          <Link to={`/judge/buildathon/${buildathonId}`} className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour aux projets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="glass-card p-6 space-y-2">
        <Link to={`/judge/buildathon/${buildathonId}`} className="text-sm text-primary-300 inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Retour à la liste des projets
        </Link>
        <h1 className="text-2xl font-bold text-heading">Notation juge</h1>
        <p className="text-body font-medium">{project.title || 'Projet sans titre'}</p>
        <p className="text-xs text-muted">{project.teamName || 'Équipe participante'} • {event?.title || 'Buildathon'}</p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-heading">Critères (0 - 100)</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {criteria.map((criterion) => (
            <label key={criterion.key} className="rounded-xl border border-themed p-3 bg-black/5 dark:bg-white/5 space-y-2">
              <span className="text-sm text-heading font-medium">{criterion.label}</span>
              <input
                type="number"
                min="0"
                max={criterion.max}
                value={formScores?.[criterion.key] ?? ''}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  const nextValue = rawValue === '' ? '' : Number(rawValue);
                  setFormScores((prev) => ({
                    ...prev,
                    [criterion.key]: Number.isFinite(nextValue) ? nextValue : '',
                  }));
                  setTouchedScores((prev) => ({ ...prev, [criterion.key]: true }));
                }}
                className="input-field w-full"
              />
              {touchedScores?.[criterion.key] && (formScores?.[criterion.key] === '' || formScores?.[criterion.key] === null || formScores?.[criterion.key] === undefined) && (
                <p className="text-[11px] text-amber-300">Ce critère est obligatoire.</p>
              )}
            </label>
          ))}
        </div>

        {!hasCompleteGrid && (
          <p className="text-xs text-amber-300">
            Grille incomplète: {missingCriteria.length} critère(s) restant(s) à noter.
          </p>
        )}

        <div className="rounded-xl border border-themed p-4 bg-black/5 dark:bg-white/5">
          <p className="text-xs text-muted">Score total</p>
          <p className="text-2xl font-bold text-heading">{computed.totalScore.toFixed(1)}</p>
          <p className="text-xs text-muted mt-1">Score moyen par critère: {computed.averageScore.toFixed(2)}</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-heading">Commentaire global</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="input-field w-full h-32 resize-none"
            placeholder="Commentaire d'évaluation (forces, axes d'amélioration, recommandations...)"
          />
        </div>

        {judgeScoreDoc && (
          <p className="text-xs text-emerald-400 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Notation déjà soumise. Vous pouvez mettre à jour après confirmation.
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmitScore}
            disabled={saving || !hasCompleteGrid}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary-500/30 bg-primary-600/20 text-primary-200 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Enregistrement...' : 'Soumettre la notation'}
          </button>
        </div>
      </div>
    </div>
  );
}
