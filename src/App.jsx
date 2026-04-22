import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import ModuleDetail from './pages/ModuleDetail';
import Exam from './pages/Exam';
import Leaderboard from './pages/Leaderboard';
import Profile from './pages/Profile';
import AdminPanel from './pages/AdminPanel';
import Certificate from './pages/Certificate';
import Verify from './pages/Verify';
import AllModules from './pages/AllModules';
import Buildathon from './pages/Buildathon';
import BuildathonDetail from './pages/BuildathonDetail';
import BuildathonProjectDetail from './pages/BuildathonProjectDetail';
import { Toaster } from 'react-hot-toast';
import JudgeEvaluations from './pages/JudgeEvaluations';
import JudgeBuildathonProjects from './pages/JudgeBuildathonProjects';
import JudgeProjectScoring from './pages/JudgeProjectScoring';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-body flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-body">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-body flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
  if (userProfile?.role !== 'admin') return <Navigate to="/leaderboard" />;

  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  return user ? <Navigate to="/leaderboard" /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="/dashboard" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/modules" element={<PrivateRoute><Layout><AllModules /></Layout></PrivateRoute>} />
      <Route path="/module/:moduleId" element={<PrivateRoute><Layout><ModuleDetail /></Layout></PrivateRoute>} />
      <Route path="/exam/:moduleId" element={<PrivateRoute><Exam /></PrivateRoute>} />
      <Route path="/leaderboard" element={<PrivateRoute><Layout><Leaderboard /></Layout></PrivateRoute>} />
      <Route path="/projects" element={<PrivateRoute><Layout><Buildathon /></Layout></PrivateRoute>} />
      <Route path="/projects/:buildathonId" element={<PrivateRoute><Layout><BuildathonDetail /></Layout></PrivateRoute>} />
      <Route path="/projects/:buildathonId/project/:projectId" element={<PrivateRoute><Layout><BuildathonProjectDetail /></Layout></PrivateRoute>} />
      <Route path="/judge/evaluations" element={<PrivateRoute><Layout><JudgeEvaluations /></Layout></PrivateRoute>} />
      <Route path="/judge/buildathon/:buildathonId" element={<PrivateRoute><Layout><JudgeBuildathonProjects /></Layout></PrivateRoute>} />
      <Route path="/judge/buildathon/:buildathonId/project/:projectId" element={<PrivateRoute><Layout><JudgeProjectScoring /></Layout></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><Layout><Profile /></Layout></PrivateRoute>} />
      <Route path="/certificate/:moduleId" element={<PrivateRoute><Layout><Certificate /></Layout></PrivateRoute>} />
      <Route path="/verify/:badgeId" element={<Verify />} />
      <Route path="/admin" element={<AdminRoute><Layout><AdminPanel /></Layout></AdminRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <ScrollToTop />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              className: 'glass-card !text-sm',
              style: {
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              },
            }}
          />
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}
