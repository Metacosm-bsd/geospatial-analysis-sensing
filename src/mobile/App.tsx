/**
 * LiDAR Forest Field App
 * Sprint 55-60: Mobile Field Data Collection
 */

import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';

import { AppNavigator } from './src/navigation/AppNavigator';
import { useAppStore } from './src/store/appStore';
import { initDatabase } from './src/services/database';
import { startSyncService } from './src/services/sync';

// Ignore specific warnings in development
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
]);

// Create React Query client with offline-first settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours (formerly cacheTime)
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

export default function App(): React.JSX.Element {
  const { initializeApp, isInitialized } = useAppStore();

  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Initialize SQLite database
        await initDatabase();

        // Start background sync service
        startSyncService();

        // Mark app as initialized
        initializeApp();
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    bootstrap();
  }, [initializeApp]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
            <AppNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
