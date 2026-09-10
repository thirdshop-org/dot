import * as SecureStore from 'expo-secure-store';
import type { User } from '../api/types';

// Clés SecureStore (iOS keychain / Android Keystore). Le token et le profil du
// compte connecté ne sont JAMAIS persistés en SQLite : un miroir non-sensible
// (active_user_id) est répété en base pour le scoping des repositories.
const TOKEN_KEY = 'vaultdrop.auth_token';
const ACCOUNT_KEY = 'vaultdrop.account';

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getStoredAccount(): Promise<User | null> {
  try {
    const raw = await SecureStore.getItemAsync(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (typeof parsed?.id !== 'string' || typeof parsed?.username !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setStoredSession(token: string, user: User): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(user));
}

export async function clearStoredSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(ACCOUNT_KEY);
  } catch {
    // clés absentes → rien à supprimer
  }
}