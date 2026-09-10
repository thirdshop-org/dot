import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import i18n from '../i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

function AuthGate() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ title: i18n.t('files') }} />
        <Stack.Screen name="search" options={{ title: i18n.t('search') }} />
        <Stack.Screen name="settings" options={{ title: i18n.t('configuration') }} />
        <Stack.Screen name="folder/[id]" options={{ title: i18n.t('folder') }} />
        <Stack.Screen name="login" options={{ title: i18n.t('login_title') }} />
      </Stack>
      {/* Rediriger vers la connexion uniquement si l'utilisateur n'a pas de session ET n'est pas en mode local. */}
      {status === 'signedOut' ? <Redirect href="/login" /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </QueryClientProvider>
  );
}