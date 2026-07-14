import * as SecureStore from 'expo-secure-store';

const REFRESH_KEY = 'vaultdrop_refresh_token';
const USER_KEY = 'vaultdrop_user';

export const tokenStorage = {
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_KEY, token);
  },

  async deleteRefreshToken(): Promise<void> {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },

  async getUser(): Promise<string | null> {
    return SecureStore.getItemAsync(USER_KEY);
  },

  async setUser(user: string): Promise<void> {
    await SecureStore.setItemAsync(USER_KEY, user);
  },

  async deleteUser(): Promise<void> {
    await SecureStore.deleteItemAsync(USER_KEY);
  },
};
