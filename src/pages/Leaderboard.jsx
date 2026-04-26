import { useState, useMemo, useEffect } from 'react';
import { useLeaderboard, useAllProgress } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { MODULES } from '../config/modules';
import { getAvatarUrl } from '../config/avatars';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ProgressRing from '../components/ProgressRing';
import {
  Trophy,
  Medal,
  Crown,
  Loader2,
  Flame,
  Target,
  Award,
  Zap,
  Shield,
  BarChart3,
  Users,
  Sparkles,
  Search,
} from 'lucide-react';

const ROLE_BADGE_COLORS = {
  Organizer: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  'Lead Track': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Mentor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'GDG On Campus UCB Member': 'bg-green-500/10 text-green-400 border-green-500/30',
};

export default function Leaderboard() {
  const { leaderboard, userRank, totalUsers, loading } = useLeaderboard();
  const { user } = useAuth();
  const { progressMap } = useAllProgress();
  const [searchQuery, setSearchQuery] = useState('');
  const [userStats, setUserStats] = useState({});

  // Count modules completed (score >= 6) and certificates (score >= 7) dynamically
  useEffect(() => {
    async function fetchUserStats() {
      if (leaderboard.length === 0) return;
      const stats = {};
      const targetEntries = [...leaderboard.slice(0, 20)];
      const meOutsideTop20 = user?.uid && !targetEntries.some((entry) => entry.id === user.uid);
      if (meOutsideTop20) {
        const meEntry = leaderboard.find((entry) => entry.id === user.uid);
        if (meEntry) targetEntries.push(meEntry);
      }
      await Promise.all(
        targetEntries.map(async (entry) => {
          try {
            const progressRef = collection(db, 'users', entry.id, 'progress');
            const snap = await getDocs(progressRef);
            let certCount = 0;
            let moduleCount = 0;
            snap.forEach((d) => {
              const score = d.data().examScore || 0;
              if (score >= 6) moduleCount++;
              if (score >= 7) certCount++;
            });
            stats[entry.id] = { certCount, moduleCount };
          } catch {
            stats[entry.id] = { certCount: 0, moduleCount: 0 };
          }
        })
      );
      setUserStats(stats);
    }
    fetchUserStats();
  }, [leaderboard, user?.uid]);

  const myCompletedCount = Object.values(progressMap).filter((p) => p.examScore >= 6).length;
  const myCertCount = Object.values(progressMap).filter((p) => p.examScore >= 7).length;
  const totalScore = Object.values(progressMap).reduce((sum, p) => sum + (p.examScore || 0), 0);
  const overallProgress = MODULES.length > 0 ? (myCompletedCount / MODULES.length) * 100 : 0;

  // Top 3 for podium
  const podium = leaderboard.slice(0, 3);

  // Top 10 for main list (excluding top 3 shown in podium)
  const top10List = leaderboard.slice(3, 10);

  // Check if user is outside top 10
  const myIndex = leaderboard.findIndex((e) => e.id === user?.uid);
  const userOutsideTop10 = myIndex >= 10;

  // Filtered list for search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return leaderboard.filter(
      (e) =>
        (e.displayName || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (`UZA-${e.id.slice(0, 8)}`).toLowerCase().includes(q)
    );
  }, [searchQuery, leaderboard]);

  const getRankIcon = (index) => {
    if (index === 0) return <Crown className="w-7 h-7 text-amber-400 drop-shadow-lg" />;
    if (index === 1) return <Medal className="w-6 h-6 text-gray-300 drop-shadow-lg" />;
    if (index === 2) return <Medal className="w-6 h-6 text-amber-600 drop-shadow-lg" />;
    return (
      <span className="w-8 h-8 flex items-center justify-center text-sm font-bold text-body bg-surface rounded-full">
        #{index + 1}
      </span>
    );
  };

  const getRankBg = (index) => {
    if (index === 0) return 'bg-gradient-to-r from-amber-500/15 to-amber-500/5 border-amber-500/40 shadow-amber-500/10 shadow-lg';
    if (index === 1) return 'bg-gradient-to-r from-gray-400/10 to-gray-400/5 border-gray-400/30';
    if (index === 2) return 'bg-gradient-to-r from-amber-700/10 to-amber-700/5 border-amber-700/30';
    return 'border-themed hover:border-themed';
  };

  const getPodiumHeight = (index) => {
    if (index === 0) return 'h-36';
    if (index === 1) return 'h-28';
    return 'h-24';
  };

  const getPodiumColor = (index) => {
    if (index === 0) return 'from-amber-500/30 to-amber-600/10 border-amber-500/50';
    if (index === 1) return 'from-gray-400/20 to-gray-500/10 border-gray-400/40';
    return 'from-amber-700/20 to-amber-800/10 border-amber-700/40';
  };

  const getPodiumOrder = () => {
    if (podium.length < 3) return podium;
    return [podium[1], podium[0], podium[2]];
  };

  const getPodiumOriginalIndex = (displayIndex) => {
    if (podium.length < 3) return displayIndex;
    const map = [1, 0, 2];
    return map[displayIndex];
  };

  // Render a single leaderboard row
  const renderRow = (entry, index) => {
    const isCurrentUser = entry.id === user?.uid;
    return (
      <div
        key={entry.id}
        className={`glass-card p-4 sm:p-5 border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
          getRankBg(index)
        } ${isCurrentUser ? 'ring-2 ring-primary-500/30 bg-primary-500/5' : ''}`}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 flex-shrink-0 flex justify-center">
            {getRankIcon(index)}
          </div>

          <div
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 border overflow-hidden ${
              isCurrentUser
                ? 'bg-primary-600/20 text-primary-300 border-primary-500/30'
                : 'bg-surface text-body border-themed'
            }`}
          >
            {(entry.photoURL || getAvatarUrl(entry.avatarId)) ? (
              <img src={entry.photoURL || getAvatarUrl(entry.avatarId)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              entry.displayName?.[0]?.toUpperCase() || 'U'
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-semibold truncate ${isCurrentUser ? 'text-primary-300' : 'text-heading'}`}>
                {entry.displayName || 'Anonymous'}
              </p>
              {isCurrentUser && (
                <span className="badge-primary text-[10px]">Vous</span>
              )}
              {entry.communityRole && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${ROLE_BADGE_COLORS[entry.communityRole] || 'bg-gray-500/10 text-gray-400'}`}>
                  {entry.communityRole}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs text-muted flex items-center gap-1">
                <Award className="w-3 h-3" />
                {userStats[entry.id]?.certCount ?? '...'} cert.
              </p>
              <p className="text-xs text-muted">
                {userStats[entry.id]?.moduleCount ?? '...'}/{MODULES.length} modules
              </p>
              {(entry.bonusPoints || 0) > 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-0.5">
                  <Zap className="w-3 h-3" />+{entry.bonusPoints}
                </p>
              )}
              {(entry.communityPoints || 0) > 0 && (
                <p className="text-xs text-primary-300 flex items-center gap-0.5">
                  <Trophy className="w-3 h-3" />+{entry.communityPoints} Ujuzi
                </p>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <p className="text-xl font-bold text-heading">
              {entry.leaderboardScore || ((entry.totalScore || 0) + (entry.bonusPoints || 0))}
            </p>
            <p className="text-[10px] text-muted uppercase tracking-wide">points</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full mb-4">
          <Flame className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-600 dark:text-amber-300">Classement en direct</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-heading mb-3 flex items-center justify-center gap-3">
          <Trophy className="w-10 h-10 text-amber-400" />
          <span className="gradient-text">Classement</span>
        </h1>
        <p className="text-body text-lg max-w-md mx-auto">
          Compétez, grimpez dans les rangs et prouvez votre expertise IA
        </p>
        <p className="text-xs text-muted mt-2">
          Score global UjuziAI = modules + bonus + communauté (votes x10, likes x1)
        </p>
      </div>

      {/* Your Stats Banner */}
      <div className="glass-card p-6 mb-8 border-primary-500/30 bg-gradient-to-r from-primary-600/10 via-surface to-accent-600/10">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex items-center gap-5">
            <ProgressRing progress={overallProgress} size={90} strokeWidth={6}>
              <div className="text-center">
                <span className="text-xl font-bold text-heading">
                  {userRank ? `#${userRank}` : '—'}
                </span>
              </div>
            </ProgressRing>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide font-medium">Votre position</p>
              <p className="text-2xl font-bold text-heading mt-1">
                {userRank ? (
                  <>Top <span className="gradient-text">{userRank}</span></>
                ) : 'Non classé'}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                {myCertCount} certificat{myCertCount !== 1 ? 's' : ''} obtenu{myCertCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-4 sm:gap-6 w-full sm:w-auto">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto bg-primary-600/20 rounded-xl flex items-center justify-center mb-2">
                <Target className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <p className="text-xl font-bold text-heading">{totalScore}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Points totaux</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto bg-accent-600/20 rounded-xl flex items-center justify-center mb-2">
                <Award className="w-5 h-5 text-accent-600 dark:text-accent-400" />
              </div>
              <p className="text-xl font-bold text-heading">{myCertCount}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Certificats</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto bg-amber-600/20 rounded-xl flex items-center justify-center mb-2">
                <BarChart3 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-xl font-bold text-heading">{Math.round(overallProgress)}%</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Progression</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher un participant par nom, email ou ID..."
          className="input-field pl-11 w-full"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-heading"
          >
            Effacer
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary-500 mb-4" />
          <p className="text-body">Chargement du classement...</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <div className="w-20 h-20 mx-auto bg-surface rounded-2xl flex items-center justify-center mb-6">
            <Trophy className="w-10 h-10 text-muted" />
          </div>
          <h3 className="text-xl font-bold text-heading mb-2">Aucun classement pour le moment</h3>
          <p className="text-body max-w-sm mx-auto mb-6">
            Soyez le premier à compléter des modules et réussir les examens pour décrocher la 1ère place du classement !
          </p>
          <a href="/dashboard" className="btn-primary inline-flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Commencer la compétition
          </a>
        </div>
      ) : searchResults ? (
        /* Search Results */
        <div>
          <p className="text-sm text-muted mb-4">
            {searchResults.length} résultat{searchResults.length !== 1 ? 's' : ''} pour &quot;{searchQuery}&quot;
          </p>
          {searchResults.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <Search className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-body">Aucun participant trouvé</p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map((entry) => {
                const index = leaderboard.indexOf(entry);
                return renderRow(entry, index);
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Podium - Top 3 — Professional Design */}
          {podium.length >= 3 && (
            <div className="mb-12">
              {/* Podium Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <span className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Top 3 Compétiteurs</span>
                  <Crown className="w-5 h-5 text-amber-400" />
                </div>
              </div>

              <div className="flex items-end justify-center gap-4 sm:gap-8">
                {getPodiumOrder().map((entry, displayIndex) => {
                  const originalIndex = getPodiumOriginalIndex(displayIndex);
                  const isCurrentUser = entry.id === user?.uid;
                  const totalPts = Number(entry.leaderboardScore || 0);

                  const podiumStyles = [
                    { // 1st place
                      ring: 'ring-4 ring-amber-400/60 shadow-xl shadow-amber-500/20',
                      avatarSize: 'w-20 h-20 sm:w-24 sm:h-24',
                      bg: 'bg-gradient-to-b from-amber-400/25 via-amber-500/10 to-transparent border-amber-400/50',
                      textColor: 'text-amber-400',
                      medal: '🥇',
                      height: 'h-44 sm:h-48',
                      glow: 'shadow-2xl shadow-amber-500/15',
                      nameSize: 'text-base sm:text-lg',
                      pointsSize: 'text-2xl sm:text-3xl',
                    },
                    { // 2nd place
                      ring: 'ring-3 ring-gray-300/50 shadow-lg shadow-gray-400/10',
                      avatarSize: 'w-16 h-16 sm:w-20 sm:h-20',
                      bg: 'bg-gradient-to-b from-gray-300/20 via-gray-400/10 to-transparent border-gray-400/40',
                      textColor: 'text-gray-300',
                      medal: '🥈',
                      height: 'h-36 sm:h-40',
                      glow: 'shadow-lg shadow-gray-400/10',
                      nameSize: 'text-sm sm:text-base',
                      pointsSize: 'text-xl sm:text-2xl',
                    },
                    { // 3rd place
                      ring: 'ring-3 ring-orange-400/40 shadow-lg shadow-orange-500/10',
                      avatarSize: 'w-16 h-16 sm:w-20 sm:h-20',
                      bg: 'bg-gradient-to-b from-orange-400/15 via-orange-500/8 to-transparent border-orange-500/40',
                      textColor: 'text-orange-400',
                      medal: '🥉',
                      height: 'h-32 sm:h-36',
                      glow: 'shadow-lg shadow-orange-400/10',
                      nameSize: 'text-sm sm:text-base',
                      pointsSize: 'text-xl sm:text-2xl',
                    },
                  ];
                  const s = podiumStyles[originalIndex];

                  return (
                    <div
                      key={entry.id}
                      className={`flex flex-col items-center transition-all duration-700 ${
                        originalIndex === 0 ? 'scale-100 -mt-4' : 'scale-95'
                      }`}
                    >
                      {/* Crown for 1st */}
                      {originalIndex === 0 && (
                        <div className="relative mb-2">
                          <Crown className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 drop-shadow-lg animate-bounce-subtle" />
                          <div className="absolute inset-0 w-8 h-8 sm:w-10 sm:h-10 bg-amber-400/20 rounded-full blur-xl" />
                        </div>
                      )}

                      {/* Avatar with glow effect */}
                      <div className={`relative mb-3 ${s.glow}`}>
                        <div className={`${s.avatarSize} rounded-full ${s.ring} overflow-hidden flex items-center justify-center text-lg font-bold border-2 ${
                          originalIndex === 0 ? 'border-amber-400/60' : originalIndex === 1 ? 'border-gray-300/50' : 'border-orange-400/50'
                        } ${isCurrentUser ? 'ring-primary-500/50' : ''}`}>
                          {(entry.photoURL || getAvatarUrl(entry.avatarId)) ? (
                            <img src={entry.photoURL || getAvatarUrl(entry.avatarId)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${
                              originalIndex === 0 ? 'bg-amber-500/20 text-amber-400 text-2xl' :
                              originalIndex === 1 ? 'bg-gray-400/20 text-gray-300 text-xl' :
                              'bg-orange-500/20 text-orange-400 text-xl'
                            } font-bold`}>
                              {entry.displayName?.[0]?.toUpperCase() || 'U'}
                            </div>
                          )}
                        </div>
                        {/* Medal badge */}
                        <span className="absolute -bottom-1 -right-1 text-xl sm:text-2xl drop-shadow-md">{s.medal}</span>
                      </div>

                      {/* Name */}
                      <p className={`${s.nameSize} font-bold mb-0.5 truncate max-w-[90px] sm:max-w-[130px] ${
                        isCurrentUser ? 'text-primary-300' : 'text-heading'
                      }`}>
                        {entry.displayName || 'Anonymous'}
                      </p>

                      {/* Role badge */}
                      {entry.communityRole && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium border mb-1 ${ROLE_BADGE_COLORS[entry.communityRole] || 'bg-gray-500/10 text-gray-400'}`}>
                          {entry.communityRole}
                        </span>
                      )}

                      {/* Points */}
                      <p className={`${s.pointsSize} font-black ${s.textColor} mb-1`}>{totalPts}</p>
                      <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">points</p>

                      {/* Podium pillar */}
                      <div className={`w-24 sm:w-36 ${s.height} rounded-t-2xl border-t-2 border-x-2 ${s.bg} flex flex-col items-center justify-start pt-4 relative overflow-hidden`}>
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 animate-shimmer opacity-50" />

                        <span className={`text-4xl sm:text-5xl font-black ${s.textColor} opacity-30 mb-2`}>
                          {originalIndex + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <Award className={`w-4 h-4 ${s.textColor}`} />
                          <span className="text-sm font-semibold text-heading">
                            {userStats[entry.id]?.certCount ?? '...'}
                          </span>
                        </div>
                        <span className="text-xs text-muted mt-0.5">
                          {userStats[entry.id]?.moduleCount ?? '...'}/{MODULES.length} modules
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Decorative base */}
              <div className="w-full max-w-md mx-auto h-2 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent rounded-full mt-0.5" />
              <div className="w-full max-w-sm mx-auto h-1 bg-gradient-to-r from-transparent via-primary-500/20 to-transparent rounded-full mt-1" />
            </div>
          )}

          {/* Rankings List (4th to 10th place) */}
          <div className="space-y-2">
            {top10List.map((entry) => {
              const index = leaderboard.indexOf(entry);
              return renderRow(entry, index);
            })}
          </div>

          {/* Show user's position if outside top 10 */}
          {userOutsideTop10 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-px bg-themed" />
                <span className="text-xs text-muted px-2">Votre position</span>
                <div className="flex-1 h-px bg-themed" />
              </div>
              {renderRow(leaderboard[myIndex], myIndex)}
            </div>
          )}

          {/* Competition Stats Footer */}
          <div className="mt-10 glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-primary-400" />
              <h3 className="text-sm font-semibold text-heading uppercase tracking-wide">Statistiques de la compétition</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                <Users className="w-5 h-5 mx-auto text-primary-400 mb-2" />
                <p className="text-lg font-bold text-heading">{totalUsers}</p>
                <p className="text-xs text-muted">Compétiteurs</p>
              </div>
              <div className="text-center p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                <Target className="w-5 h-5 mx-auto text-accent-400 mb-2" />
                <p className="text-lg font-bold text-heading">
                  {Math.round(Number(leaderboard[0]?.leaderboardScore || 0))}
                </p>
                <p className="text-xs text-muted">Meilleur score</p>
              </div>
              <div className="text-center p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                <BarChart3 className="w-5 h-5 mx-auto text-amber-400 mb-2" />
                <p className="text-lg font-bold text-heading">
                  {leaderboard.length > 0
                    ? Math.round(leaderboard.reduce((s, e) => s + Number(e.leaderboardScore || 0), 0) / leaderboard.length)
                    : 0}
                </p>
                <p className="text-xs text-muted">Score moyen</p>
              </div>
              <div className="text-center p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                <Shield className="w-5 h-5 mx-auto text-red-400 mb-2" />
                <p className="text-lg font-bold text-heading">{MODULES.length}</p>
                <p className="text-xs text-muted">Modules disponibles</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
