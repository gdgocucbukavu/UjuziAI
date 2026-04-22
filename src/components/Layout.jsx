import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard,
  BookOpen,
  Trophy,
  User,
  Users,
  Shield,
  LogOut,
  Menu,
  X,
  Zap,
  Sun,
  Moon,
  Rocket,
  ClipboardCheck,
} from 'lucide-react';

export default function Layout({ children }) {
  const { user, userProfile, logout, isAdmin } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { path: '/leaderboard', icon: Trophy, label: 'Classement' },
    { path: '/dashboard', icon: LayoutDashboard, label: 'Modules' },
    { path: '/projects', icon: Rocket, label: 'Buildathon' },
    { path: '/judge/evaluations', icon: ClipboardCheck, label: 'Mes évaluations' },
    { path: '/profile', icon: User, label: 'Profil' },
  ];

  if (isAdmin) {
    navItems.push({ path: '/admin', icon: Shield, label: 'Administration' });
  }

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-body flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-surface border-r border-themed fixed top-0 left-0 h-screen z-30">
        <div className="p-6">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">UjuziAI</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-primary-600/20 text-primary-600 dark:text-primary-300 border border-primary-500/30'
                    : 'text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-themed space-y-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-4 py-2.5 w-full text-left text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors text-sm"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? 'Mode clair' : 'Mode sombre'}
          </button>

          <div className="flex items-center gap-3 px-4 py-3">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="w-9 h-9 rounded-full object-cover border-2 border-primary-500/30"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 bg-primary-600/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-300 text-sm font-bold">
                {user?.displayName?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-heading truncate">
                {user?.displayName || 'User'}
              </p>
              <p className="text-xs text-muted truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-muted hover:text-red-500 transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-72 h-full bg-body border-r border-themed flex flex-col animate-slide-up">
            <div className="flex items-center justify-between p-6">
              <Link to="/dashboard" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
                <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold gradient-text">UjuziAI</span>
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="text-muted">
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="flex-1 px-4 space-y-1">
              {navItems.map(({ path, icon: Icon, label }) => {
                const active = location.pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-primary-600/20 text-primary-600 dark:text-primary-300'
                        : 'text-body hover:text-heading hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-themed space-y-2">
              <button
                onClick={toggleTheme}
                className="flex items-center gap-3 px-4 py-3 w-full text-left text-body hover:text-heading rounded-xl transition-colors"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                {isDark ? 'Mode clair' : 'Mode sombre'}
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 w-full text-left text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Déconnexion
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content - offset by sidebar width on desktop */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Top bar - mobile */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-surface border-b border-themed sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="text-body">
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/dashboard">
              <span className="font-bold gradient-text text-lg">UjuziAI</span>
            </Link>
          </div>
          <Link to="/profile">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="w-8 h-8 rounded-full object-cover border-2 border-primary-500/30"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 bg-primary-600/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-300 text-xs font-bold">
                {user?.displayName?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
