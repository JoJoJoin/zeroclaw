import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import React from 'react';

// ---------------------------------------------------------------------------
// Context shape — desktop-only, no authentication required
// ---------------------------------------------------------------------------

export interface AuthState {
  /** Always true in desktop mode — no pairing required. */
  isAuthenticated: boolean;
  /** Always false — no loading needed. */
  loading: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const value: AuthState = {
    isAuthenticated: true,
    loading: false,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
