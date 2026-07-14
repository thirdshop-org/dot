import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { tokenStorage } from '../api/secureStorage';
import { ENDPOINTS } from '../constants/api';
import { AuthResponse, User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const stored = await tokenStorage.getUser();
      if (stored) {
        const userData = JSON.parse(stored) as User;
        setUser(userData);
      }
    } catch {
      await tokenStorage.deleteUser();
    } finally {
      setIsLoading(false);
    }
  }

  async function login(username: string, password: string) {
    const response = await apiClient.post<AuthResponse>(ENDPOINTS.AUTH_LOGIN, {
      username,
      password,
    });

    apiClient.setAccessToken(response.access_token);
    await tokenStorage.setRefreshToken(response.refresh_token);
    await tokenStorage.setUser(JSON.stringify(response.user));
    setUser(response.user);
  }

  async function register(username: string, password: string) {
    const response = await apiClient.post<AuthResponse>(ENDPOINTS.AUTH_REGISTER, {
      username,
      password,
    });

    apiClient.setAccessToken(response.access_token);
    await tokenStorage.setRefreshToken(response.refresh_token);
    await tokenStorage.setUser(JSON.stringify(response.user));
    setUser(response.user);
  }

  async function logout() {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (refreshToken) {
        await apiClient.post(ENDPOINTS.AUTH_LOGOUT, { refresh_token: refreshToken });
      }
    } catch {}

    apiClient.setAccessToken(null);
    await tokenStorage.deleteRefreshToken();
    await tokenStorage.deleteUser();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
