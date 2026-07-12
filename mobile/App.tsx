import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomeScreen } from './app/index';
import { UploadScreen } from './app/upload';
import { ScanScreen } from './app/scan';
import { SearchScreen } from './app/search';
import { BatchReviewScreen } from './app/batch-review';
import { PendingReviewScreen } from './app/pending-review';

const Stack = createNativeStackNavigator();
const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'VaultDrop' }} />
          <Stack.Screen name="Upload" component={UploadScreen} options={{ title: 'Upload' }} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan' }} />
          <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Recherche' }} />
          <Stack.Screen name="BatchReview" component={BatchReviewScreen} options={{ title: 'Revue du lot' }} />
          <Stack.Screen name="PendingReview" component={PendingReviewScreen} options={{ title: 'Réorganisation' }} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
