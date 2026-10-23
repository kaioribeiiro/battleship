import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import AuthPage from './pages/AuthPage.jsx';
import GamePage from './pages/GamePage.jsx';
import LobbyPage from './pages/LobbyPage.jsx';
import { initBgm } from './lib/audio.js';
import { useI18n } from './lib/preferences.js';

function RequireAuth({ children }) {
  const { status } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="splash">{t('validatingCredentials')}</div>;
  }
  if (status !== 'authed') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

export default function App() {
  useEffect(() => {
    initBgm();
  }, []);
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<LobbyPage />} />
        <Route path="game/:gameId" element={<GamePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
