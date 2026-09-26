import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getToken, setToken as persistToken } from './api';
import { loginWallet, createWallet, logoutWallet } from './wallet';

const KEY = 'zaka-session';
const AuthCtx = createContext({ isAuthenticated: false });

function loadSession() {
  if (!getToken()) return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  }, [session]);

  const login = async (phone, pin) => {
    const w = await loginWallet(phone, pin);
    setSession(w);
    return w;
  };

  const register = async (phone, pin) => {
    const w = await createWallet(phone, pin);
    setSession(w);
    return w;
  };

  const logout = async () => {
    await logoutWallet();
    persistToken(null);
    setSession(null);
    queryClient.removeQueries({ queryKey: ['wallet'] });
  };

  const updateSession = (patch) => setSession((s) => (s ? { ...s, ...patch } : s));

  return (
    <AuthCtx.Provider
      value={{
        session,
        isAuthenticated: !!session,
        login,
        register,
        logout,
        updateSession,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
