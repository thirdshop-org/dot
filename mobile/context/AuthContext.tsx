import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSyncDevice } from '../features/syncDevice';
import { getDeviceUserId } from '../services/localStorage';
import type { AuthContextValue, User } from './AuthContext.types';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {

  const [user, setUser] = useState<User | null>(null);
  const [deviceUserId, setDeviceUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const id = await getDeviceUserId();
        if (active) setDeviceUserId(id);
      } catch (error) {
        console.warn('device identity unavailable', error);
      }
    })();

    useSyncDevice();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => ({ user, deviceUserId }), [user, deviceUserId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}