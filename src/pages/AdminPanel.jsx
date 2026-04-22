import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAdmin } from '../hooks/useFirestore';
import { MODULES, TRACKS, EXAM_CONFIG } from '../config/modules';
import { getModuleIcon } from '../config/icons';
import {
  Shield,
  Users,
  BookOpen,
  Settings,
  CheckCircle,
  XCircle,
  Unlock,
  ToggleLeft,
  ToggleRight,
  Search,
  RefreshCw,
  Loader2,
  FileText,
  AlertTriangle,
  Edit3,
  Save,
  Calendar,
  ChevronUp,
  ChevronDown,
  UserCog,
  Eye,
  Pencil,
  Image,
  ExternalLink,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

// Community roles available for assignment
const COMMUNITY_ROLES = [
  { value: '', label: '— Aucun rôle —' },
  { value: 'Organizer', label: 'Organizer' },
  { value: 'Lead Track', label: 'Lead Track' },
  { value: 'Mentor', label: 'Mentor' },
  { value: 'GDG On Campus UCB Member', label: 'GDG On Campus UCB Member' },
];

const ROLE_BADGE_COLORS = {
  Organizer: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  'Lead Track': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Mentor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'GDG On Campus UCB Member': 'bg-green-500/10 text-green-400 border-green-500/30',
};

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('submissions');
  const [users, setUsers] = useState([]);
  const [moduleSettings, setModuleSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingModule, setEditingModule] = useState(null);
  const [examSettings, setExamSettings] = useState({ ...EXAM_CONFIG });
  const [savingSettings, setSavingSettings] = useState(false);
  const [expandedSubmission, setExpandedSubmission] = useState(null);
  const [submissionDetails, setSubmissionDetails] = useState({});
  const [editingScore, setEditingScore] = useState(null);
  const [newScoreValue, setNewScoreValue] = useState('');
  const [selectedBonusUserIds, setSelectedBonusUserIds] = useState([]);
  const [bonusPoints, setBonusPoints] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [sendingBonus, setSendingBonus] = useState(false);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  const {
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
  } = useAdmin();

  useEffect(() => {
    fetchData();
  }, []);

  // Fast initial load: only users + settings (NO subcollections)
  async function fetchData() {
    setLoading(true);
    try {
      const [usersSnap, settingsSnap, savedExam] = await Promise.all([
        getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'moduleSettings')),
        getExamSettings(),
      ]);

      const usersData = usersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        progress: null,     // lazy-loaded
        submissions: null,  // lazy-loaded
      }));
      setUsers(usersData);

      const settings = {};
      settingsSnap.forEach((s) => { settings[s.id] = s.data(); });
      setModuleSettings(settings);

      if (savedExam) setExamSettings((prev) => ({ ...prev, ...savedExam }));
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Échec du chargement des données admin');
    } finally {
      setLoading(false);
    }
  }

  // Lazy-load progress + submissions for a single user
  async function loadUserDetails(userId) {
    try {
      const [progressSnap, subsSnap] = await Promise.all([
        getDocs(collection(db, 'users', userId, 'progress')),
        getDocs(collection(db, 'users', userId, 'submissions')),
      ]);
      const progress = {};
      progressSnap.forEach((p) => { progress[p.id] = p.data(); });
      const submissions = [];
      subsSnap.forEach((s) => { submissions.push({ id: s.id, ...s.data() }); });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, progress, submissions } : u));
      return { progress, submissions };
    } catch (err) {
      console.error('Error loading user details:', err);
      return { progress: {}, submissions: [] };
    }
  }

  // Load all user details when submissions tab is first opened
  useEffect(() => {
    if (activeTab === 'submissions' && users.length > 0 && users[0].progress === null && !loadingSubmissions) {
      setLoadingSubmissions(true);
      Promise.all(users.map((u) => loadUserDetails(u.id)))
        .finally(() => setLoadingSubmissions(false));
    }
  }, [activeTab, users.length]);

  const handleValidate = async (userId, moduleId, approved) => {
    try {
      await validateSubmission(userId, moduleId, approved);
      toast.success(approved ? 'Soumission approuvée' : 'Soumission rejetée');
      fetchData();
    } catch (err) {
      toast.error('Échec de la mise à jour de la soumission');
    }
  };

  const handleToggleModule = async (moduleId) => {
    const currentlyOpen = moduleSettings[moduleId]?.isOpen !== false;
    try {
      await toggleModuleLock(moduleId, !currentlyOpen);
      toast.success(`Module ${!currentlyOpen ? 'ouvert' : 'fermé'}`);
      setModuleSettings((prev) => ({
        ...prev,
        [moduleId]: { ...prev[moduleId], isOpen: !currentlyOpen },
      }));
    } catch (err) {
      toast.error('Échec du basculement du module');
    }
  };

  const handleOverrideExamLock = async (userId, moduleId) => {
    try {
      await overrideExamLock(userId, moduleId);
      toast.success('Verrouillage de l\'examen annulé');
      fetchData();
    } catch (err) {
      toast.error('Échec de l\'annulation du verrouillage');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      toast.success('Rôle communautaire mis à jour');
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, communityRole: newRole } : u))
      );
    } catch (err) {
      toast.error('Échec de la mise à jour du rôle');
    }
  };

  const handleSaveModuleSchedule = async (moduleId, openDate, closeDate) => {
    try {
      await saveModuleSettings(moduleId, { openDate, closeDate });
      toast.success('Dates de planification enregistrées');
      setModuleSettings((prev) => ({
        ...prev,
        [moduleId]: { ...prev[moduleId], openDate, closeDate },
      }));
      setEditingModule(null);
    } catch (err) {
      toast.error('Échec de l\'enregistrement');
    }
  };

  const handleSaveExamSettings = async () => {
    setSavingSettings(true);
    try {
      await saveExamSettings({
        MCQ_COUNT: parseInt(examSettings.MCQ_COUNT) || 7,
        OPEN_COUNT: parseInt(examSettings.OPEN_COUNT) || 3,
        MCQ_TIME_SECONDS: parseInt(examSettings.MCQ_TIME_SECONDS) || 30,
        OPEN_TIME_SECONDS: parseInt(examSettings.OPEN_TIME_SECONDS) || 120,
        MAX_ATTEMPTS: parseInt(examSettings.MAX_ATTEMPTS) || 2,
        PASSING_SCORE: parseInt(examSettings.PASSING_SCORE) || 6,
        MAX_SCORE: parseInt(examSettings.MAX_SCORE) || 10,
      });
      toast.success('Paramètres d\'examen enregistrés');
    } catch (err) {
      toast.error('Échec de l\'enregistrement des paramètres');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleViewSubmission = async (userId) => {
    if (expandedSubmission === userId) {
      setExpandedSubmission(null);
      return;
    }
    // Lazy-load user details if not yet loaded
    const user = users.find((u) => u.id === userId);
    if (user && user.progress === null) {
      await loadUserDetails(userId);
    }
    setExpandedSubmission(userId);
  };

  const handleModifyScore = async (userId, moduleId) => {
    const score = parseInt(newScoreValue);
    if (isNaN(score) || score < 0 || score > 10) {
      toast.error('Le score doit être entre 0 et 10');
      return;
    }
    try {
      await modifyUserScore(userId, moduleId, score);
      toast.success(`Score modifié à ${score}/10`);
      setEditingScore(null);
      setNewScoreValue('');
      fetchData();
    } catch (err) {
      toast.error('Échec de la modification du score');
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `UZA-${u.id.slice(0, 8)}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBonusUsers = users.filter((u) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.uniqueId?.toLowerCase().includes(q) ||
      `UZA-${u.id.slice(0, 8)}`.toLowerCase().includes(q)
    );
  });

  const handleAddBonus = async () => {
    if (selectedBonusUserIds.length === 0 || !bonusPoints) {
      toast.error('Veuillez sélectionner au moins un utilisateur et un nombre de points');
      return;
    }

    const parsedPoints = Number(bonusPoints);
    if (!Number.isFinite(parsedPoints) || parsedPoints === 0) {
      toast.error('Le nombre de points doit être différent de 0');
      return;
    }

    if (Math.abs(parsedPoints) > 100) {
      toast.error('La valeur maximale autorisée est 100 points (en positif ou en négatif)');
      return;
    }

    if (parsedPoints < 0 && !bonusReason.trim()) {
      toast.error('Veuillez préciser une raison pour le retrait de points');
      return;
    }

    setSendingBonus(true);
    try {
      await Promise.all(selectedBonusUserIds.map((userId) => addBonusPoints(userId, parsedPoints, bonusReason.trim())));
      if (parsedPoints > 0) {
        toast.success(`${parsedPoints} point(s) bonus ajouté(s) à ${selectedBonusUserIds.length} utilisateur(s)`);
      } else {
        toast.success(`${Math.abs(parsedPoints)} point(s) bonus retiré(s) pour ${selectedBonusUserIds.length} utilisateur(s)`);
      }
      setSelectedBonusUserIds([]);
      setBonusPoints('');
      setBonusReason('');
      fetchData();
    } catch (err) {
      toast.error('Échec de l\'ajout de bonus : ' + err.message);
    } finally {
      setSendingBonus(false);
    }
  };

  const bonusUsersCount = users.filter((u) => (u.bonusPoints || 0) > 0).length;

  const tabs = [
    { id: 'submissions', label: 'Soumissions', icon: FileText },
    { id: 'users', label: 'Utilisateurs', icon: Users, count: users.length },
    { id: 'modules', label: 'Modules', icon: BookOpen },
    { id: 'bonus', label: 'Points Bonus', icon: Zap, count: bonusUsersCount, highlight: true },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-primary-400" />
        <div>
          <h1 className="section-title">Panneau d'administration</h1>
          <p className="section-subtitle">Gérez les soumissions, utilisateurs, modules et paramètres</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map(({ id, label, icon: Icon, count, highlight }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all border ${
              activeTab === id
                ? highlight
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10'
                  : 'bg-primary-600/20 text-primary-300 border-primary-500/30'
                : highlight
                  ? 'text-amber-400 border-amber-500/20 hover:bg-amber-500/10'
                  : 'text-body border-transparent hover:text-heading hover:bg-black/5 dark:hover:bg-white/5 hover:border-themed'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                highlight ? 'bg-amber-500/20 text-amber-400' : 'bg-primary-500/20 text-primary-400'
              }`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      {(activeTab === 'submissions' || activeTab === 'users' || activeTab === 'bonus') && (
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par nom, email ou ID (UZA-...)..."
            className="input-field pl-11"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {/* Submissions Tab — with details viewer and score editing */}
          {activeTab === 'submissions' && (
            <div className="space-y-4">
              {loadingSubmissions ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                  <p className="text-sm text-muted">Chargement des soumissions...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="glass-card p-12 text-center">
                  <FileText className="w-16 h-16 text-muted mx-auto mb-4" />
                  <p className="text-body">Aucune soumission trouvée</p>
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const hasProgress = Object.keys(u.progress || {}).length > 0;
                  if (!hasProgress) return null;
                  const isExpanded = expandedSubmission === u.id;
                  const userSubs = u.submissions || [];

                  return (
                    <div key={u.id} className="glass-card p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-600/20 rounded-full flex items-center justify-center text-primary-300 font-bold">
                            {u.displayName?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="font-medium text-heading">{u.displayName}</p>
                            <p className="text-xs text-muted">{u.email}</p>
                            <p className="text-[10px] text-muted font-mono">ID: UZA-{u.id.slice(0, 8).toUpperCase()}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleViewSubmission(u.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors text-xs font-medium"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {isExpanded ? 'Réduire' : 'Voir détails'}
                        </button>
                      </div>

                      <div className="space-y-3">
                        {Object.entries(u.progress || {}).map(([modId, prog]) => {
                          const mod = MODULES.find((m) => m.id === modId);
                          if (!mod || !prog.submitted) return null;
                          const isEditingThisScore = editingScore === `${u.id}-${modId}`;
                          const matchingSub = userSubs.find((s) => s.moduleId === modId);

                          return (
                            <div key={modId} className="bg-black/5 dark:bg-white/5 rounded-lg overflow-hidden">
                              <div className="flex items-center justify-between p-3">
                                <div className="flex items-center gap-3">
                                  {(() => { const Icon = getModuleIcon(mod.iconName); return <div className="w-8 h-8 rounded-lg bg-primary-500/15 text-primary-400 flex items-center justify-center"><Icon className="w-4 h-4" /></div>; })()}
                                  <div>
                                    <p className="text-sm font-medium text-heading">{mod.title}</p>
                                    <div className="flex items-center gap-2 text-xs text-muted">
                                      <span>Tentatives : {prog.examAttempts || 0}</span>
                                      {prog.examScore != null && <span>Score : {prog.examScore}/10</span>}
                                      {prog.lastExamScore != null && prog.lastExamScore !== prog.examScore && (
                                        <span className="text-amber-400">(dernier : {prog.lastExamScore}/10)</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {/* Score edit button */}
                                  {isEditingThisScore ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={newScoreValue}
                                        onChange={(e) => setNewScoreValue(e.target.value)}
                                        className="w-14 px-2 py-1 text-xs rounded border border-themed bg-card text-heading"
                                        placeholder="0-10"
                                      />
                                      <button
                                        onClick={() => handleModifyScore(u.id, modId)}
                                        className="p-1.5 rounded bg-accent-500/10 text-accent-400 hover:bg-accent-500/20"
                                        title="Sauvegarder"
                                      >
                                        <Save className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => { setEditingScore(null); setNewScoreValue(''); }}
                                        className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                        title="Annuler"
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => { setEditingScore(`${u.id}-${modId}`); setNewScoreValue(String(prog.examScore || 0)); }}
                                      className="p-2 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors"
                                      title="Modifier le score"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                  )}

                                  {prog.validated ? (
                                    <span className="badge-accent text-xs">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Validé
                                    </span>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => handleValidate(u.id, modId, true)}
                                        className="p-2 rounded-lg bg-accent-500/10 text-accent-400 hover:bg-accent-500/20 transition-colors"
                                        title="Approuver"
                                      >
                                        <CheckCircle className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleValidate(u.id, modId, false)}
                                        className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                        title="Rejeter"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}

                                  {prog.examLocked && (
                                    <button
                                      onClick={() => handleOverrideExamLock(u.id, modId)}
                                      className="p-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                                      title="Annuler le verrouillage"
                                    >
                                      <Unlock className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Expanded submission details */}
                              {isExpanded && matchingSub && (
                                <div className="border-t border-themed p-4 space-y-3">
                                  {/* Description */}
                                  {matchingSub.description && (
                                    <div>
                                      <p className="text-xs font-medium text-body mb-1 flex items-center gap-1">
                                        <FileText className="w-3 h-3" /> Description :
                                      </p>
                                      <p className="text-sm text-body bg-black/5 dark:bg-white/5 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                        {matchingSub.description}
                                      </p>
                                    </div>
                                  )}

                                  {/* Images */}
                                  {matchingSub.images?.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-body mb-2 flex items-center gap-1">
                                        <Image className="w-3 h-3" /> Captures d'écran ({matchingSub.images.length}) :
                                      </p>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                        {matchingSub.images.map((imgUrl, idx) => (
                                          <a key={idx} href={imgUrl} target="_blank" rel="noopener noreferrer" className="block group relative">
                                            <img
                                              src={imgUrl}
                                              alt={`Screenshot ${idx + 1}`}
                                              className="w-full h-24 object-cover rounded-lg border border-themed group-hover:border-primary-500/50 transition-colors"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                              <ExternalLink className="w-4 h-4 text-white" />
                                            </div>
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Video URL */}
                                  {matchingSub.videoUrl && (
                                    <div>
                                      <p className="text-xs font-medium text-body mb-1">Vidéo :</p>
                                      <a href={matchingSub.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-400 hover:underline flex items-center gap-1">
                                        <ExternalLink className="w-3 h-3" />
                                        {matchingSub.videoUrl}
                                      </a>
                                    </div>
                                  )}

                                  {/* Submission date */}
                                  <p className="text-[10px] text-muted">
                                    Soumis le : {matchingSub.submittedAt?.toDate?.()?.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || '—'}
                                  </p>
                                </div>
                              )}

                              {isExpanded && !matchingSub && (
                                <div className="border-t border-themed p-3">
                                  <p className="text-xs text-muted italic">Pas de détails de soumission disponibles pour ce module.</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Users Tab — with community role management */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="glass-card p-4 bg-primary-500/5 border border-primary-500/20 rounded-xl">
                <div className="flex items-center gap-2 text-primary-400 text-sm">
                  <UserCog className="w-4 h-4" />
                  <span className="font-medium">
                    Assignez des rôles communautaires : Organizer, Lead Track, Mentor, GDG On Campus UCB Member
                  </span>
                </div>
              </div>

              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-themed">
                        <th className="text-left p-4 text-body font-medium">Utilisateur</th>
                        <th className="text-left p-4 text-body font-medium">Rôle système</th>
                        <th className="text-left p-4 text-body font-medium">Rôle communautaire</th>
                        <th className="text-center p-4 text-body font-medium">Modules</th>
                        <th className="text-center p-4 text-body font-medium">Score</th>
                        <th className="text-center p-4 text-body font-medium">Inscription</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="border-b border-themed hover:bg-black/5 dark:hover:bg-white/5">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              {u.photoURL ? (
                                <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-8 h-8 bg-primary-600/20 rounded-full flex items-center justify-center text-xs font-bold text-primary-300">
                                  {u.displayName?.[0]?.toUpperCase() || 'U'}
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-heading">{u.displayName}</p>
                                <p className="text-xs text-muted">{u.email}</p>
                                <p className="text-[10px] text-muted font-mono">UZA-{u.id.slice(0, 8).toUpperCase()}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={u.role === 'admin' ? 'badge-primary' : 'badge bg-gray-200 dark:bg-neutral-700 text-body'}>
                              {u.role === 'admin' ? 'Admin' : 'Apprenant'}
                            </span>
                          </td>
                          <td className="p-4">
                            <select
                              value={u.communityRole || ''}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                              className="text-xs px-3 py-1.5 rounded-lg border border-themed bg-card text-body cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                            >
                              {COMMUNITY_ROLES.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            {u.communityRole && (
                              <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${ROLE_BADGE_COLORS[u.communityRole] || 'bg-gray-500/10 text-gray-400'}`}>
                                {u.communityRole}
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-center text-body">
                            {Object.keys(u.progress || {}).length}
                          </td>
                          <td className="p-4 text-center text-body">{u.totalScore || 0}</td>
                          <td className="p-4 text-center text-xs text-muted">
                            {u.createdAt?.toDate?.()?.toLocaleDateString('fr-FR') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Modules Tab — with edit & scheduling */}
          {activeTab === 'modules' && (
            <div className="space-y-3">
              <div className="glass-card p-4 bg-primary-500/5 border border-primary-500/20 rounded-xl mb-4">
                <p className="text-sm text-primary-400">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Cliquez sur le bouton modifier pour définir les dates d'ouverture et de fermeture d'un module.
                </p>
              </div>

              {TRACKS.map((track) => {
                const trackModules = MODULES.filter((m) => m.trackId === track.id);
                return (
                  <div key={track.id} className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <img src={track.logo} alt={track.shortName} className="w-6 h-6 rounded object-cover" />
                      <h3 className="font-semibold text-heading text-sm">{track.name}</h3>
                      <span className="text-xs text-muted">({trackModules.length} modules)</span>
                    </div>

                    <div className="space-y-2">
                      {trackModules.map((mod) => {
                        const isOpen = moduleSettings[mod.id]?.isOpen !== false;
                        const settings = moduleSettings[mod.id] || {};
                        const isEditing = editingModule === mod.id;

                        return (
                          <div key={mod.id} className="glass-card p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                {(() => {
                                  const Icon = getModuleIcon(mod.iconName);
                                  return (
                                    <div className="w-10 h-10 rounded-xl bg-primary-500/15 text-primary-400 flex items-center justify-center flex-shrink-0">
                                      <Icon className="w-5 h-5" />
                                    </div>
                                  );
                                })()}
                                <div className="min-w-0">
                                  <p className="font-medium text-heading truncate">{mod.title}</p>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-0.5">
                                    <span>{mod.difficulty}</span>
                                    <span>•</span>
                                    <span>{mod.estimatedTime}</span>
                                    {settings.openDate && (
                                      <>
                                        <span>•</span>
                                        <span className="text-primary-400">
                                          Ouverture : {new Date(settings.openDate).toLocaleDateString('fr-FR')}
                                        </span>
                                      </>
                                    )}
                                    {settings.closeDate && (
                                      <>
                                        <span>•</span>
                                        <span className="text-red-400">
                                          Fermeture : {new Date(settings.closeDate).toLocaleDateString('fr-FR')}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => setEditingModule(isEditing ? null : mod.id)}
                                  className="p-2 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors"
                                  title="Modifier les dates"
                                >
                                  {isEditing ? <ChevronUp className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => handleToggleModule(mod.id)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-xs font-medium ${
                                    isOpen
                                      ? 'bg-accent-500/10 text-accent-400 hover:bg-accent-500/20'
                                      : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                  }`}
                                >
                                  {isOpen ? (
                                    <>
                                      <ToggleRight className="w-4 h-4" />
                                      Ouvert
                                    </>
                                  ) : (
                                    <>
                                      <ToggleLeft className="w-4 h-4" />
                                      Fermé
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Schedule editor (expanded) */}
                            {isEditing && (
                              <ModuleScheduleEditor
                                moduleId={mod.id}
                                openDate={settings.openDate || ''}
                                closeDate={settings.closeDate || ''}
                                codelabUrl={mod.codelabUrl}
                                onSave={handleSaveModuleSchedule}
                                onCancel={() => setEditingModule(null)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Settings Tab — Editable exam parameters */}
          {activeTab === 'bonus' && (
            <div className="space-y-6">
              {/* Bonus Points Form */}
              <div className="glass-card p-8">
                <h3 className="text-lg font-semibold text-heading mb-6 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  Gérer les points bonus
                </h3>
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-body">Utilisateurs sélectionnés</label>
                      <button
                        type="button"
                        onClick={() => {
                          const allFilteredIds = filteredBonusUsers.map((u) => u.id);
                          const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedBonusUserIds.includes(id));
                          if (allSelected) {
                            setSelectedBonusUserIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
                          } else {
                            setSelectedBonusUserIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
                          }
                        }}
                        className="text-xs text-primary-400 hover:text-primary-300"
                      >
                        {filteredBonusUsers.length > 0 && filteredBonusUsers.every((u) => selectedBonusUserIds.includes(u.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
                      </button>
                    </div>
                    <div className="max-h-52 overflow-y-auto border border-themed rounded-xl p-2 space-y-1.5 bg-black/5 dark:bg-white/5">
                      {filteredBonusUsers.map((u) => {
                        const checked = selectedBonusUserIds.includes(u.id);
                        return (
                          <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedBonusUserIds((prev) => [...prev, u.id]);
                                } else {
                                  setSelectedBonusUserIds((prev) => prev.filter((id) => id !== u.id));
                                }
                              }}
                            />
                            <div className="min-w-0">
                              <p className="text-sm text-heading truncate">{u.displayName || u.email}</p>
                              <p className="text-[11px] text-muted truncate">{u.email} • {u.uniqueId || `UZA-${u.id.slice(0, 8).toUpperCase()}`}</p>
                            </div>
                          </label>
                        );
                      })}
                      {filteredBonusUsers.length === 0 && <p className="text-xs text-muted p-2">Aucun utilisateur trouvé avec ce filtre.</p>}
                    </div>
                    <p className="text-xs text-muted mt-2">{selectedBonusUserIds.length} utilisateur(s) sélectionné(s)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-2">Points (+ pour attribuer, - pour annuler)</label>
                    <input
                      type="number"
                      min="-100"
                      max="100"
                      value={bonusPoints}
                      onChange={(e) => setBonusPoints(e.target.value)}
                      placeholder="Ex: 10 ou -10"
                      className="input-field w-full"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-body mb-2">Raison (optionnel)</label>
                  <input
                    type="text"
                    value={bonusReason}
                    onChange={(e) => setBonusReason(e.target.value)}
                    placeholder="Ex: Attribution finale validée, correction d'erreur admin..."
                    className="input-field w-full"
                  />
                </div>
                <button
                  onClick={handleAddBonus}
                  disabled={sendingBonus || selectedBonusUserIds.length === 0 || !bonusPoints}
                  className="btn-primary flex items-center gap-2"
                >
                  {sendingBonus ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Mettre à jour les bonus
                </button>
              </div>

              {/* Users with bonus points */}
              <div className="glass-card p-8">
                <h3 className="text-lg font-semibold text-heading mb-4">Utilisateurs avec bonus</h3>
                <div className="space-y-3">
                  {users
                    .filter((u) => (u.bonusPoints || 0) > 0)
                    .sort((a, b) => (b.bonusPoints || 0) - (a.bonusPoints || 0))
                    .map((u) => (
                      <div key={u.id} className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                        <div className="flex items-center gap-3">
                          {u.photoURL ? (
                            <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 text-sm font-bold">
                              {(u.displayName || u.email || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-heading">{u.displayName || u.email}</p>
                            <p className="text-xs text-muted">{u.uniqueId || u.id.slice(0, 8)}</p>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-amber-400 font-bold text-sm">
                          <Zap className="w-4 h-4" />
                          +{u.bonusPoints}
                        </span>
                      </div>
                    ))}
                  {users.filter((u) => (u.bonusPoints || 0) > 0).length === 0 && (
                    <p className="text-center text-muted py-4">Aucun utilisateur n'a de points bonus</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Exam Settings — editable */}
              <div className="glass-card p-8">
                <h3 className="text-lg font-semibold text-heading mb-6 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-primary-400" />
                  Paramètres d'examen
                </h3>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {[
                    { key: 'MCQ_COUNT', label: 'Nombre de QCM', min: 1, max: 20 },
                    { key: 'OPEN_COUNT', label: 'Questions ouvertes', min: 0, max: 10 },
                    { key: 'MCQ_TIME_SECONDS', label: 'Temps par QCM (sec)', min: 10, max: 300 },
                    { key: 'OPEN_TIME_SECONDS', label: 'Temps par ouverte (sec)', min: 60, max: 1800 },
                    { key: 'MAX_ATTEMPTS', label: 'Tentatives max', min: 1, max: 10 },
                    { key: 'PASSING_SCORE', label: 'Score de réussite (/10)', min: 1, max: 10 },
                  ].map(({ key, label, min, max }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-body mb-2">{label}</label>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={examSettings[key] || ''}
                        onChange={(e) =>
                          setExamSettings((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="input-field w-full"
                      />
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleSaveExamSettings}
                  disabled={savingSettings}
                  className="btn-primary flex items-center gap-2"
                >
                  {savingSettings ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Enregistrer les paramètres
                </button>
              </div>

              {/* System Info */}
              <div className="glass-card p-8">
                <h3 className="text-lg font-semibold text-heading mb-6">Informations système</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl">
                    <h4 className="font-medium text-heading mb-2">Génération de questions</h4>
                    <p className="text-sm text-body">
                      Les questions sont générées dynamiquement par l'Agent Générateur de Questions
                      basé sur le contexte du module et le contenu du codelab.
                    </p>
                  </div>

                  <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl">
                    <h4 className="font-medium text-heading mb-2">Paramètres anti-triche</h4>
                    <p className="text-sm text-body mb-3">
                      La détection IA est gérée par l'Agent d'Évaluation avec une analyse sémantique approfondie.
                    </p>
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                      <AlertTriangle className="w-4 h-4" />
                      Avertissement à la première détection, zéro à la deuxième
                    </div>
                  </div>

                  <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl">
                    <h4 className="font-medium text-heading mb-2">Statistiques</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-heading">{users.length}</p>
                        <p className="text-xs text-muted">Utilisateurs</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-heading">{MODULES.length}</p>
                        <p className="text-xs text-muted">Modules</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-heading">{TRACKS.length}</p>
                        <p className="text-xs text-muted">Parcours</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={fetchData}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Rafraîchir les données
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// Module Schedule Editor Component
// ============================================
function ModuleScheduleEditor({ moduleId, openDate, closeDate, codelabUrl, onSave, onCancel }) {
  const [open, setOpen] = useState(openDate || '');
  const [close, setClose] = useState(closeDate || '');

  return (
    <div className="mt-4 pt-4 border-t border-themed">
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-body mb-1">
            <Calendar className="w-3 h-3 inline mr-1" />
            Date d'ouverture
          </label>
          <input
            type="date"
            value={open}
            onChange={(e) => setOpen(e.target.value)}
            className="input-field w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-body mb-1">
            <Calendar className="w-3 h-3 inline mr-1" />
            Date de fermeture
          </label>
          <input
            type="date"
            value={close}
            onChange={(e) => setClose(e.target.value)}
            className="input-field w-full text-sm"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-body mb-1">Lien Codelab</label>
        <input
          type="url"
          value={codelabUrl}
          readOnly
          className="input-field w-full text-sm text-muted"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(moduleId, open, close)}
          className="btn-primary text-xs px-4 py-2 flex items-center gap-1"
        >
          <Save className="w-3 h-3" />
          Enregistrer
        </button>
        <button
          onClick={onCancel}
          className="btn-secondary text-xs px-4 py-2"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}