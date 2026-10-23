import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, getToken, setToken, setUnauthorizedHandler } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(getToken() ? 'loading' : 'anon');
  const [token, setTokenState] = useState(getToken());

  const clearSession = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setStatus('anon');
  }, []);

  const startSession = useCallback((nextToken, nextUser) => {
    setToken(nextToken);
    setTokenState(nextToken);
    setUser(nextUser);
    setStatus('authed');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
  }, [clearSession]);

  useEffect(() => {
    if (!getToken()) return undefined;
    let cancelled = false;
    authApi
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authed');
      })
      .catch((err) => {
        if (cancelled) return;
        // Só descarta o token se ele foi de fato rejeitado; se o servidor
        // estiver fora do ar mantemos a sessão para tentar de novo.
        if (err.status === 401 || err.status === 404) clearSession();
        else setStatus('anon');
      });
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(
    async (username, password) => {
      const { token: t, user: u } = await authApi.login(username, password);
      startSession(t, u);
    },
    [startSession],
  );

  const register = useCallback(
    async (username, password) => {
      const { token: t, user: u } = await authApi.register(username, password);
      startSession(t, u);
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* mesmo sem resposta do servidor encerramos a sessão local */
    }
    clearSession();
  }, [clearSession]);

  /** Recarrega vitórias/derrotas/empates (ex.: após o fim de uma partida). */
  const refreshUser = useCallback(async () => {
    try {
      setUser(await authApi.me());
    } catch {
      /* ignora: o 401 já é tratado globalmente */
    }
  }, []);

  const value = useMemo(
    () => ({ user, token, status, login, register, logout, refreshUser }),
    [user, token, status, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
