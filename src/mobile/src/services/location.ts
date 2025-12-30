/**
 * GPS Location Service
 * High-accuracy GPS positioning for tree location capture
 * Sprint 55-60: Mobile Field App
 */

import Geolocation, {
  GeolocationResponse,
  GeolocationError,
} from '@react-native-community/geolocation';
import { Platform, PermissionsAndroid } from 'react-native';
import type { GPSLocation, GPSConfig } from '../types';
import { useAppStore } from '../store/appStore';

// ============================================================================
// Default Configuration
// ============================================================================

const defaultConfig: GPSConfig = {
  enableHighAccuracy: true,
  timeout: 30000,
  maximumAge: 0,
  distanceFilter: 1, // meters
};

let watchId: number | null = null;

// ============================================================================
// Permission Handling
// ============================================================================

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    // iOS permissions are requested automatically
    return true;
  }

  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message:
            'LiDAR Forest Field App needs access to your location to record tree positions accurately.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        // Also request background location for continuous tracking
        const backgroundGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
          {
            title: 'Background Location Permission',
            message:
              'Allow background location access for continuous GPS tracking while measuring.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        return backgroundGranted === PermissionsAndroid.RESULTS.GRANTED;
      }

      return false;
    } catch (err) {
      console.warn('Location permission request failed:', err);
      return false;
    }
  }

  return false;
}

export async function checkLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const fineLocation = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return fineLocation;
  }

  // iOS - assume granted if we get here
  return true;
}

// ============================================================================
// Single Position
// ============================================================================

export function getCurrentPosition(
  config: Partial<GPSConfig> = {}
): Promise<GPSLocation> {
  return new Promise((resolve, reject) => {
    const finalConfig = { ...defaultConfig, ...config };

    Geolocation.getCurrentPosition(
      (position: GeolocationResponse) => {
        const location: GPSLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude ?? undefined,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString(),
        };

        // Update store
        useAppStore.getState().setCurrentLocation(location);

        resolve(location);
      },
      (error: GeolocationError) => {
        useAppStore.getState().setTrackingError(error.message);
        reject(new Error(error.message));
      },
      {
        enableHighAccuracy: finalConfig.enableHighAccuracy,
        timeout: finalConfig.timeout,
        maximumAge: finalConfig.maximumAge,
      }
    );
  });
}

// ============================================================================
// High-Accuracy Position (Averaged)
// ============================================================================

export async function getHighAccuracyPosition(
  targetAccuracy: number = 3, // meters
  maxSamples: number = 10,
  maxWaitTime: number = 60000 // 1 minute
): Promise<GPSLocation> {
  const samples: GPSLocation[] = [];
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const collectSample = async () => {
      if (Date.now() - startTime > maxWaitTime) {
        // Timeout - return best available
        if (samples.length > 0) {
          const averaged = averagePositions(samples);
          resolve(averaged);
        } else {
          reject(new Error('GPS timeout - no readings obtained'));
        }
        return;
      }

      try {
        const position = await getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });

        samples.push(position);

        // Check if we have enough accurate samples
        if (samples.length >= maxSamples) {
          const accurateSamples = samples.filter(s => s.accuracy <= targetAccuracy);

          if (accurateSamples.length >= 5) {
            // We have enough accurate samples
            const averaged = averagePositions(accurateSamples);
            resolve(averaged);
            return;
          }
        }

        // Continue collecting
        setTimeout(collectSample, 1000);
      } catch (error) {
        // Continue trying on error
        setTimeout(collectSample, 2000);
      }
    };

    collectSample();
  });
}

function averagePositions(positions: GPSLocation[]): GPSLocation {
  if (positions.length === 0) {
    throw new Error('No positions to average');
  }

  const sum = positions.reduce(
    (acc, pos) => ({
      latitude: acc.latitude + pos.latitude,
      longitude: acc.longitude + pos.longitude,
      altitude: pos.altitude ? (acc.altitude || 0) + pos.altitude : acc.altitude,
      accuracy: acc.accuracy + pos.accuracy,
    }),
    { latitude: 0, longitude: 0, altitude: undefined as number | undefined, accuracy: 0 }
  );

  const count = positions.length;

  return {
    latitude: sum.latitude / count,
    longitude: sum.longitude / count,
    altitude: sum.altitude ? sum.altitude / count : undefined,
    accuracy: sum.accuracy / count,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Continuous Tracking
// ============================================================================

export function startLocationTracking(
  onUpdate: (location: GPSLocation) => void,
  onError?: (error: string) => void,
  config: Partial<GPSConfig> = {}
): void {
  if (watchId !== null) {
    console.warn('Location tracking already active');
    return;
  }

  const finalConfig = { ...defaultConfig, ...config };
  const store = useAppStore.getState();

  store.setTrackingStatus(true);
  store.setTrackingError(undefined);

  watchId = Geolocation.watchPosition(
    (position: GeolocationResponse) => {
      const location: GPSLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        altitude: position.coords.altitude ?? undefined,
        accuracy: position.coords.accuracy,
        timestamp: new Date(position.timestamp).toISOString(),
      };

      store.setCurrentLocation(location);
      onUpdate(location);
    },
    (error: GeolocationError) => {
      store.setTrackingError(error.message);
      onError?.(error.message);
    },
    {
      enableHighAccuracy: finalConfig.enableHighAccuracy,
      timeout: finalConfig.timeout,
      maximumAge: finalConfig.maximumAge,
      distanceFilter: finalConfig.distanceFilter,
    }
  );
}

export function stopLocationTracking(): void {
  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;

    const store = useAppStore.getState();
    store.setTrackingStatus(false);
  }
}

export function isTrackingActive(): boolean {
  return watchId !== null;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function calculateDistance(
  point1: { latitude: number; longitude: number },
  point2: { latitude: number; longitude: number }
): number {
  // Haversine formula
  const R = 6371e3; // Earth radius in meters
  const lat1 = (point1.latitude * Math.PI) / 180;
  const lat2 = (point2.latitude * Math.PI) / 180;
  const deltaLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

export function calculateBearing(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  const bearing = (Math.atan2(y, x) * 180) / Math.PI;

  return (bearing + 360) % 360; // Normalize to 0-360
}

export function formatCoordinates(
  latitude: number,
  longitude: number,
  format: 'decimal' | 'dms' = 'decimal'
): string {
  if (format === 'decimal') {
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }

  // DMS format
  const latDir = latitude >= 0 ? 'N' : 'S';
  const lonDir = longitude >= 0 ? 'E' : 'W';

  const formatDMS = (coord: number): string => {
    const abs = Math.abs(coord);
    const degrees = Math.floor(abs);
    const minutesFloat = (abs - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = ((minutesFloat - minutes) * 60).toFixed(2);

    return `${degrees}°${minutes}'${seconds}"`;
  };

  return `${formatDMS(latitude)}${latDir} ${formatDMS(longitude)}${lonDir}`;
}

export function isWithinRadius(
  point: { latitude: number; longitude: number },
  center: { latitude: number; longitude: number },
  radiusMeters: number
): boolean {
  return calculateDistance(point, center) <= radiusMeters;
}
