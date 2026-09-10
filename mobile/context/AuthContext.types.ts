export type User = {};

export type AuthContextValue = {
  user: User | null;
  deviceUserId: string | null;
};