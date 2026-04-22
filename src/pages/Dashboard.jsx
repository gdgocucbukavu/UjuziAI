import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAllProgress } from '../hooks/useFirestore';
import { MODULES, TRACKS, getModulesByTrack, getTrackProgress } from '../config/modules';
import ModuleCard from '../components/ModuleCard';
import ProgressRing from '../components/ProgressRing';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BookOpen, Trophy, Target, TrendingUp, Sparkles, ChevronRight, ArrowLeft, Calendar, Rocket } from 'lucide-react';

const INITIAL_MODULE_COUNT = 4;

function getSafeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEffectiveEventEndDate(event) {
  const candidateDates = [event?.voteEndDate, event?.submissionEndDate, event?.endDate]
    .map((value) => getSafeDate(value))
    .filter(Boolean);

  if (candidateDates.length === 0) return null;
  return candidateDates.reduce((latest, current) => (current > latest ? current : latest));
}

export default function Dashboard() {
  const { user, userProfile } = useAuth();
  const { progressMap, loading } = useAllProgress();

  // View state: null = overview, trackId = track detail
  const [activeTrack, setActiveTrack] = useState(null);
  const [buildathonEvents, setBuildathonEvents] = useState([]);

  useEffect(() => {
    const unsubEvents = onSnapshot(
      query(collection(db, 'buildathons'), orderBy('createdAt', 'desc')),
      (snap) => {
        const data = [];
        snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
        setBuildathonEvents(data);
      }
    );
    return () => unsubEvents();
  }, []);

  const completedCount = Object.values(progressMap).filter((p) => p.examScore >= 6).length;
  const submittedCount = Object.values(progressMap).filter((p) => p.submitted).length;
  const totalScore = Object.values(progressMap).reduce((sum, p) => sum + (p.examScore || 0), 0);
  const overallProgress = MODULES.length > 0 ? (completedCount / MODULES.length) * 100 : 0;

  // Displayed modules depending on view
  const displayedModules = useMemo(() => {
    if (activeTrack) {
      return getModulesByTrack(activeTrack);
    }
    // Default overview: show first 4 modules
    return MODULES.slice(0, INITIAL_MODULE_COUNT);
  }, [activeTrack]);

  const activeTrackData = activeTrack ? TRACKS.find((t) => t.id === activeTrack) : null;

  const highlightedEvents = useMemo(() => {
    const now = new Date();
    const withStatus = buildathonEvents.map((event) => {
      const startDate = getSafeDate(event.startDate);
      const effectiveEndDate = getEffectiveEventEndDate(event);
      let status = 'active';
      if (startDate && startDate > now) status = 'upcoming';
      else if (effectiveEndDate && effectiveEndDate < now) status = 'ended';
      return { ...event, status };
    });

    const prioritized = withStatus
      .filter((event) => event.status === 'active' || event.status === 'upcoming')
      .sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));

    return prioritized.slice(0, 3);
  }, [buildathonEvents]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-heading">
            Bon retour, <span className="gradient-text">{user?.displayName || 'Apprenant'}</span>
          </h1>
          <p className="text-body mt-1">Continuez votre parcours Build with AI</p>
        </div>

        <div className="flex items-center gap-4">
          <ProgressRing progress={overallProgress} size={80} strokeWidth={6}>
            <div className="text-center">
              <span className="text-lg font-bold text-heading">{Math.round(overallProgress)}%</span>
            </div>
          </ProgressRing>
          <div>
            <p className="text-sm text-body">Progression globale</p>
            <p className="text-lg font-semibold text-heading">
              {completedCount}/{MODULES.length} modules
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: BookOpen,
            label: 'Modules commencés',
            value: submittedCount,
            color: 'primary',
          },
          {
            icon: Trophy,
            label: 'Complétés',
            value: completedCount,
            color: 'accent',
          },
          {
            icon: Target,
            label: 'Score total',
            value: totalScore,
            color: 'primary',
          },
          {
            icon: TrendingUp,
            label: 'Rang global',
            value: userProfile?.rank ? `#${userProfile.rank}` : '—',
            color: 'accent',
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  color === 'accent'
                    ? 'bg-accent-500/20 text-accent-400'
                    : 'bg-primary-500/20 text-primary-400'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-bold text-heading">{value}</p>
            <p className="text-sm text-body">{label}</p>
          </div>
        ))}
      </div>

      {/* Buildathon/Hackathon quick section */}
      <div className="glass-card p-6 border border-primary-500/20 bg-gradient-to-r from-primary-500/10 via-surface to-accent-500/10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-xs font-semibold mb-2">
              <Rocket className="w-3.5 h-3.5" />
              Buildathon & Hackathon
            </div>
            <h2 className="text-xl font-bold text-heading">Événements en cours et à venir</h2>
            <p className="text-sm text-body mt-1">Inscrivez-vous, soumettez vos projets et gagnez des bonus.</p>
          </div>
          <Link to="/projects" className="btn-primary inline-flex items-center gap-2 w-fit">
            Voir tous les événements
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {highlightedEvents.length === 0 ? (
          <div className="p-4 rounded-xl border border-themed bg-black/5 dark:bg-white/5 text-sm text-body">
            Aucun événement actif/à venir pour le moment.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {highlightedEvents.map((event) => (
              <div key={event.id} className="p-4 rounded-xl border border-themed bg-black/5 dark:bg-white/5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="font-semibold text-heading truncate">{event.title}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${event.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>
                    {event.status === 'active' ? 'En cours' : 'À venir'}
                  </span>
                </div>
                <p className="text-xs text-muted mb-2">{event.type === 'hackathon' ? 'Hackathon' : 'Buildathon'}</p>
                <p className="text-xs text-body flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary-400" />
                  {event.startDate ? new Date(event.startDate).toLocaleDateString('fr-FR') : 'Date à définir'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* TRACK DETAIL VIEW */}
      {/* ============================================ */}
      {activeTrack && activeTrackData ? (
        <div>
          {/* Back button + Track header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setActiveTrack(null)}
              className="p-2 rounded-xl border border-themed text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-label="Retour aux parcours"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <img
                src={activeTrackData.logo}
                alt={activeTrackData.name}
                className="w-10 h-10 rounded-xl object-cover"
              />
              <div>
                <h2 className="section-title">{activeTrackData.name}</h2>
                <p className="text-xs text-body">{activeTrackData.description}</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-card p-6 h-64 animate-pulse">
                  <div className="w-12 h-12 bg-gray-200 dark:bg-neutral-700 rounded-xl mb-4" />
                  <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded w-3/4 mb-3" />
                  <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-full mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedModules.map((module) => (
                <ModuleCard
                  key={module.id}
                  module={module}
                  progress={progressMap[module.id]}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ============================================ */}
          {/* TRACK CARDS — Google Skills style with logos */}
          {/* ============================================ */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="w-6 h-6 text-primary-400" />
              <h2 className="section-title">Parcours d'apprentissage</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
              {TRACKS.map((track) => {
                const trackProgress = getTrackProgress(track.id, progressMap);

                return (
                  <button
                    key={track.id}
                    onClick={() => { setActiveTrack(track.id); }}
                    className="glass-card-hover p-5 text-left transition-all duration-300 group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <img
                        src={track.logo}
                        alt={track.shortName}
                        className="w-10 h-10 rounded-xl object-cover"
                      />
                      <ChevronRight className="w-4 h-4 text-muted transition-transform duration-200 group-hover:translate-x-0.5" />
                    </div>
                    <h3 className="font-semibold text-heading text-sm mb-1">{track.shortName}</h3>
                    <p className="text-xs text-body line-clamp-2 mb-3">{track.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted">{trackProgress.completed}/{trackProgress.total}</span>
                      <div className="w-16 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${track.gradient} transition-all duration-500`}
                          style={{ width: `${trackProgress.percentage}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ============================================ */}
          {/* MODULES SECTION — "Voir tout" opens separate view */}
          {/* ============================================ */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <BookOpen className="w-6 h-6 text-primary-400" />
                <h2 className="section-title">Modules recommandés</h2>
              </div>
            </div>

            {loading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: INITIAL_MODULE_COUNT }).map((_, i) => (
                  <div key={i} className="glass-card p-6 h-64 animate-pulse">
                    <div className="w-12 h-12 bg-gray-200 dark:bg-neutral-700 rounded-xl mb-4" />
                    <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded w-3/4 mb-3" />
                    <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-full mb-2" />
                    <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {displayedModules.map((module) => (
                    <ModuleCard
                      key={module.id}
                      module={module}
                      progress={progressMap[module.id]}
                    />
                  ))}
                </div>

                {/* "Voir tout" button — navigates to dedicated /modules page */}
                {MODULES.length > INITIAL_MODULE_COUNT && (
                  <div className="flex justify-center mt-8">
                    <Link
                      to="/modules"
                      className="flex items-center gap-2 px-6 py-3 rounded-xl border border-themed text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 text-sm font-medium"
                    >
                      Voir les {MODULES.length} modules
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}