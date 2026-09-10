import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSyncDevice } from '../features/syncDevice';
import { api, setAuthToken } from '../api/client';
import {
  getDeviceAuthToken,
  getDeviceUserId,
  saveDeviceAuthToken,
} from '../services/localStorage';
import type { AuthContextValue, User } from './AuthContext.types';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {

  const [user, setUser] = useState<User | null>(null);
  const [deviceUserId, setDeviceUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const id = await getDeviceUserId();
      if (active) setDeviceUserId(id);

      try {
        let token = await getDeviceAuthToken();
        if ( !token ) {
          const { data } = await api.registerDevice(id);
          token = data.token;
          await saveDeviceAuthToken(token);
        }
        setAuthToken(token);
      } catch (error) {
        console.warn('device registration failed (offline?)', error);
      }
    };

    bootstrap();
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