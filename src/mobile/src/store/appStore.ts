/**
 * App Store (Zustand)
 * Global application state management
 * Sprint 55-60: Mobile Field App
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AppSettings,
  SyncStatus,
  GPSLocation,
  FieldProject,
  TreeMeasurement,
  SamplePlot,
  QueuedOperation,
} from '../types';

// ============================================================================
// Store Types
// ============================================================================

interface AuthState {
  isAuthenticated: boolean;
  userId?: string;
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
}

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt?: string;
  pendingOperations: number;
  syncErrors: string[];
}

interface LocationState {
  currentLocation?: GPSLocation;
  isTracking: boolean;
  trackingError?: string;
}

interface AppState {
  // Initialization
  isInitialized: boolean;
  initializeApp: () => void;

  // Auth
  auth: AuthState;
  setAuth: (auth: Partial<AuthState>) => void;
  logout: () => void;

  // Sync
  sync: SyncState;
  setOnlineStatus: (isOnline: boolean) => void;
  setSyncStatus: (isSyncing: boolean) => void;
  setLastSyncAt: (timestamp: string) => void;
  setPendingOperations: (count: number) => void;
  addSyncError: (error: string) => void;
  clearSyncErrors: () => void;

  // Location
  location: LocationState;
  setCurrentLocation: (location: GPSLocation) => void;
  setTrackingStatus: (isTracking: boolean) => void;
  setTrackingError: (error?: string) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;

  // Active Context
  activeProjectId?: string;
  activePlotId?: string;
  setActiveProject: (projectId?: string) => void;
  setActivePlot: (plotId?: string) => void;
}

// ============================================================================
// Default Values
// ============================================================================

const defaultSettings: AppSettings = {
  autoSync: true,
  syncOnWifiOnly: false,
  syncIntervalMinutes: 5,
  gpsHighAccuracy: true,
  gpsTimeout: 30000,
  measurementSystem: 'metric',
  photoQuality: 'high',
  maxPhotosPerTree: 10,
  darkMode: false,
  fontSize: 'medium',
  offlineMapsCached: false,
  speciesListCached: false,
};

const defaultAuth: AuthState = {
  isAuthenticated: false,
};

const defaultSync: SyncState = {
  isOnline: true,
  isSyncing: false,
  pendingOperations: 0,
  syncErrors: [],
};

const defaultLocation: LocationState = {
  isTracking: false,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initialization
      isInitialized: false,
      initializeApp: () => set({ isInitialized: true }),

      // Auth
      auth: defaultAuth,
      setAuth: (auth) =>
        set((state) => ({
          auth: { ...state.auth, ...auth },
        })),
      logout: () =>
        set({
          auth: defaultAuth,
          activeProjectId: undefined,
          activePlotId: undefined,
        }),

      // Sync
      sync: defaultSync,
      setOnlineStatus: (isOnline) =>
        set((state) => ({
          sync: { ...state.sync, isOnline },
        })),
      setSyncStatus: (isSyncing) =>
        set((state) => ({
          sync: { ...state.sync, isSyncing },
        })),
      setLastSyncAt: (timestamp) =>
        set((state) => ({
          sync: { ...state.sync, lastSyncAt: timestamp },
        })),
      setPendingOperations: (count) =>
        set((state) => ({
          sync: { ...state.sync, pendingOperations: count },
        })),
      addSyncError: (error) =>
        set((state) => ({
          sync: {
            ...state.sync,
            syncErrors: [...state.sync.syncErrors, error].slice(-10),
          },
        })),
      clearSyncErrors: () =>
        set((state) => ({
          sync: { ...state.sync, syncErrors: [] },
        })),

      // Location
      location: defaultLocation,
      setCurrentLocation: (location) =>
        set((state) => ({
          location: { ...state.location, currentLocation: location },
        })),
      setTrackingStatus: (isTracking) =>
        set((state) => ({
          location: { ...state.location, isTracking },
        })),
      setTrackingError: (error) =>
        set((state) => ({
          location: { ...state.location, trackingError: error },
        })),

      // Settings
      settings: defaultSettings,
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      // Active Context
      activeProjectId: undefined,
      activePlotId: undefined,
      setActiveProject: (projectId) => set({ activeProjectId: projectId }),
      setActivePlot: (plotId) => set({ activePlotId: plotId }),
    }),
    {
      name: 'lidar-forest-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        auth: state.auth,
        settings: state.settings,
        activeProjectId: state.activeProjectId,
        activePlotId: state.activePlotId,
      }),
    }
  )
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const useAuth = () => useAppStore((state) => state.auth);
export const useSync = () => useAppStore((state) => state.sync);
export const useLocation = () => useAppStore((state) => state.location);
export const useSettings = () => useAppStore((state) => state.settings);
export const useActiveProject = () => useAppStore((state) => state.activeProjectId);
export const useActivePlot = () => useAppStore((state) => state.activePlotId);
