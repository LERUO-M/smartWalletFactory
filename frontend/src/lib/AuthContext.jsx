import { createContext, useContext } from 'react';

const AuthCtx = createContext({ isAuthenticated: false });

export function AuthProvider({ children }) {
  return <AuthCtx.Provider value={{ isAuthenticated: false }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
