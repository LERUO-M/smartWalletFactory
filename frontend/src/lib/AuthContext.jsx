import { createContext, useContext, useEffect, useState } from 'react';
import { getToken, setToken as persistToken } from './api';
import { loginWallet, createWallet } from './wallet';

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

  const logout = () => {
    persistToken(null);
    setSession(null);
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
