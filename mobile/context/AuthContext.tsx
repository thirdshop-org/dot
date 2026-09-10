import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSyncDevice } from '../features/syncDevice';
import { api, setAuthToken, setUnauthorizedHandler } from '../api/client';
import {
  clearActiveUserId,
  getDeviceUserId,
  setActiveUserId,
} from '../services/localStorage';
import {
  clearStoredSession,
  getStoredAccount,
  getStoredToken,
  setStoredSession,
} from '../services/secureStore';
import type { AuthContextValue, AuthStatus, User } from './AuthContext.types';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [deviceUserId, setDeviceUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const signOut = async () => {
    await Promise.allSettled([clearStoredSession(), clearActiveUserId()]);
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const id = await getDeviceUserId();
      if (active) setDeviceUserId(id);

      try {
        // Enregistrement du device (idempotent côté serveur) — obligatoire
        // avant le login (INVALID_DEVICE_ID sinon). Aucun token émis ici.
        await api.registerDevice(id);
      } catch (error) {
        console.warn('device registration failed (offline?)', error);
      }

      try {
        const [token, storedUser] = await Promise.all([getStoredToken(), getStoredAccount()]);
        if (active && token && storedUser) {
          setAuthToken(token);
          setActiveUserId(storedUser.id);
          setUser(storedUser);
          setStatus('signedIn');
          return;
        }
      } catch (error) {
        console.warn('could not restore session', error);
      }
      if (active) setStatus('signedOut');
    };

    bootstrap();
    useSyncDevice();

    return () => {
      active = false;
    };
  }, []);

  // 401 sur un endpoint protégé (token expiré/révoqué, compte supprimé) →
  // purge de la session. Le 401 du login est exonéré côté client (option
  // skipUnauthorizedHandling dans api/client.ts).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const signIn = async (username: string, password: string) => {
    const id = deviceUserId ?? (await getDeviceUserId());
    const result = await api.login(username, password, id);
    await setStoredSession(result.data.token, result.data.user);
    await setActiveUserId(result.data.user.id);
    setAuthToken(result.data.token);
    setUser(result.data.user);
    setStatus('signedIn');
  };

  const value = useMemo(
    () => ({ user, deviceUserId, status, signIn, signOut }),
    [user, deviceUserId, status, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}