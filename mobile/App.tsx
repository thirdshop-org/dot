import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DeviceProvider, useDevice } from './contexts/DeviceContext';
import { SseProvider } from './contexts/SseContext';
import { SseOcrListener } from './hooks/usePollOcr';
import { SseResourceListener } from './hooks/useSSEResource';
import { registerBackgroundUpload } from './services/backgroundUpload';
import { LoginScreen } from './app/login';
import { RegisterScreen } from './app/register';
import { HomeScreen } from './app/index';
import { ScanScreen } from './app/scan';
import { SearchScreen } from './app/search';
import { BatchReviewScreen } from './app/batch-review';
import { PendingReviewScreen } from './app/pending-review';
import { FileDetailScreen } from './app/file-detail';
import { FileEditScreen } from './app/file-edit';
import { FolderScreen } from './app/folder';
import { OnboardingScreen } from './app/onboarding';
import { SyncDetailScreen } from './app/sync-detail';
import { onboardingStorage } from './services/onboardingStorage';
import { initDB } from './services/fileStore';
import { migrateFromLegacy } from './services/fileStore/migrate';
import { createMMKVPersister } from './services/mmkvPersister';
import { setIsSyncing } from './hooks/useSyncQueue';

initDB();
migrateFromLegacy();
setIsSyncing(false);

const Stack = createNativeStackNavigator();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24h
    },
  },
});
const persister = createMMKVPersister();

function AppNavigator() {
  const { user, isLoading: authLoading } = useAuth();
  const { isLoading: deviceLoading } = useDevice();

  useEffect(() => {
    if (user) {
      registerBackgroundUpload();
    }
  }, [user]);

  if (authLoading || (user && deviceLoading)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const needsOnboarding = user && onboardingStorage.needsOnboarding();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={
          needsOnboarding ? 'Onboarding'
          : user ? 'Home'
          : 'Login'
        }
      >
        {user ? (
          <>
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{
                title: 'Dot.',
                headerTitleStyle: { fontSize: 18 },
              }}
            />
            <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan' }} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Recherche' }} />
            <Stack.Screen name="BatchReview" component={BatchReviewScreen} options={{ title: 'Revue du lot' }} />
            <Stack.Screen name="PendingReview" component={PendingReviewScreen} options={{ title: 'Réorganisation' }} />
            <Stack.Screen
              name="FileDetail"
              component={FileDetailScreen}
              options={{ title: 'Détails', headerTintColor: '#fff', headerStyle: { backgroundColor: '#000' }, animation: 'fade' }}
            />
            <Stack.Screen name="FileEdit" component={FileEditScreen} options={{ title: 'Édition' }} />
            <Stack.Screen name="Folder" component={FolderScreen} options={{ title: 'Dossier' }} />
            <Stack.Screen name="SyncDetail" component={SyncDetailScreen} options={{ title: 'Synchronisation' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AppContent() {
  return (
    <AuthProvider>
      <SseProvider>
        <SseOcrListener />
        <SseResourceListener />
        <DeviceProvider>
          <AppNavigator />
          <StatusBar style="auto" />
        </DeviceProvider>
      </SseProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24, // 24h
        }}
      >
        <AppContent />
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
