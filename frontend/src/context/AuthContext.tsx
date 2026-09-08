import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, ApiError, AUTH_EXPIRED_EVENT, getToken, setToken } from '../api/client';
import { User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<User>('/auth/me');
      setUser(data);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handler = () => logout();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await api.post<{ user: User; tokens: { accessToken: string } }>('/auth/login', { email, password });
      setToken(data.tokens.accessToken);
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('Não foi possível conectar ao servidor.', 'NETWORK_ERROR', 0);
    }
  }, []);

  const isAdmin = !!user?.roles?.some((r) => r === 'ADMIN' || r === 'ADMIN_MASTER');

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de um AuthProvider.');
  return ctx;
}
