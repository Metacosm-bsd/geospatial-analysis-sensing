/**
 * Sync Service
 * Background synchronization with web platform
 * Sprint 55-60: Mobile Field App
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useAppStore } from '../store/appStore';
import {
  getPendingSyncOperations,
  markSyncAttempt,
  getPendingCount,
  getDatabase,
} from './database';
import { apiClient } from './api';
import type { QueuedOperation, TreeMeasurement, SamplePlot } from '../types';

// ============================================================================
// Sync Configuration
// ============================================================================

interface SyncConfig {
  syncIntervalMs: number;
  retryDelayMs: number;
  maxConcurrentUploads: number;
  wifiOnly: boolean;
}

const defaultConfig: SyncConfig = {
  syncIntervalMs: 5 * 60 * 1000, // 5 minutes
  retryDelayMs: 30 * 1000, // 30 seconds
  maxConcurrentUploads: 3,
  wifiOnly: false,
};

let syncInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// ============================================================================
// Sync Service Control
// ============================================================================

export function startSyncService(config: Partial<SyncConfig> = {}): void {
  const finalConfig = { ...defaultConfig, ...config };

  // Set up network status listener
  NetInfo.addEventListener(handleNetworkChange);

  // Start periodic sync
  syncInterval = setInterval(() => {
    performSync();
  }, finalConfig.syncIntervalMs);

  // Perform initial sync
  performSync();

  console.log('Sync service started');
}

export function stopSyncService(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  console.log('Sync service stopped');
}

export async function triggerManualSync(): Promise<void> {
  await performSync(true);
}

// ============================================================================
// Network Status Handling
// ============================================================================

function handleNetworkChange(state: NetInfoState): void {
  const store = useAppStore.getState();
  const wasOnline = store.sync.isOnline;
  const isOnline = state.isConnected === true;

  store.setOnlineStatus(isOnline);

  // Trigger sync when coming back online
  if (!wasOnline && isOnline) {
    console.log('Network restored, triggering sync');
    performSync();
  }
}

export async function checkNetworkStatus(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected === true;
}

export async function isWifiConnected(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.type === 'wifi' && state.isConnected === true;
}

// ============================================================================
// Main Sync Logic
// ============================================================================

async function performSync(force = false): Promise<void> {
  const store = useAppStore.getState();

  // Prevent concurrent syncs
  if (isRunning) {
    console.log('Sync already in progress, skipping');
    return;
  }

  // Check if online
  const isOnline = await checkNetworkStatus();
  if (!isOnline) {
    console.log('Offline, skipping sync');
    return;
  }

  // Check wifi-only setting
  const { settings } = store;
  if (settings.syncOnWifiOnly && !force) {
    const onWifi = await isWifiConnected();
    if (!onWifi) {
      console.log('Not on WiFi, skipping sync (wifi-only mode)');
      return;
    }
  }

  // Check auth
  if (!store.auth.isAuthenticated || !store.auth.accessToken) {
    console.log('Not authenticated, skipping sync');
    return;
  }

  isRunning = true;
  store.setSyncStatus(true);

  try {
    // 1. Pull remote changes first
    await pullRemoteChanges();

    // 2. Push local changes
    await pushLocalChanges();

    // 3. Upload pending photos
    await uploadPendingPhotos();

    // Update sync timestamp
    store.setLastSyncAt(new Date().toISOString());
    store.clearSyncErrors();

    console.log('Sync completed successfully');
  } catch (error) {
    console.error('Sync failed:', error);
    store.addSyncError(error instanceof Error ? error.message : 'Unknown sync error');
  } finally {
    isRunning = false;
    store.setSyncStatus(false);

    // Update pending count
    const pendingCount = await getPendingCount();
    store.setPendingOperations(pendingCount);
  }
}

// ============================================================================
// Pull Remote Changes
// ============================================================================

async function pullRemoteChanges(): Promise<void> {
  const store = useAppStore.getState();
  const db = getDatabase();

  try {
    // Get projects assigned to user
    const response = await apiClient.get('/api/v1/projects', {
      params: {
        assignedTo: store.auth.userId,
        updatedAfter: store.sync.lastSyncAt,
      },
    });

    const projects = response.data.data;

    for (const project of projects) {
      // Upsert project
      await db.executeSql(
        `INSERT OR REPLACE INTO projects (
          id, local_id, remote_id, name, description, organization_id,
          boundary_geojson, target_tree_count, assigned_crew_ids, status,
          start_date, end_date, sync_status, last_synced_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?)`,
        [
          project.id,
          project.id,
          project.id,
          project.name,
          project.description,
          project.organizationId,
          project.boundaryGeoJSON ? JSON.stringify(project.boundaryGeoJSON) : null,
          project.targetTreeCount,
          JSON.stringify(project.assignedCrewIds || []),
          project.status,
          project.startDate,
          project.endDate,
          new Date().toISOString(),
          project.createdAt,
          project.updatedAt,
        ]
      );
    }

    console.log(`Pulled ${projects.length} projects from server`);
  } catch (error) {
    console.error('Failed to pull remote changes:', error);
    throw error;
  }
}

// ============================================================================
// Push Local Changes
// ============================================================================

async function pushLocalChanges(): Promise<void> {
  const operations = await getPendingSyncOperations();

  if (operations.length === 0) {
    console.log('No pending changes to push');
    return;
  }

  console.log(`Pushing ${operations.length} local changes`);

  for (const op of operations) {
    try {
      await processSyncOperation(op);
      await markSyncAttempt(op.id, true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await markSyncAttempt(op.id, false, errorMessage);
      console.error(`Failed to sync ${op.entityType} ${op.entityId}:`, errorMessage);
    }
  }
}

async function processSyncOperation(op: QueuedOperation): Promise<void> {
  const db = getDatabase();

  switch (op.entityType) {
    case 'tree':
      await syncTreeOperation(op);
      break;
    case 'plot':
      await syncPlotOperation(op);
      break;
    case 'photo':
      // Photos handled separately
      break;
    default:
      console.warn(`Unknown entity type: ${op.entityType}`);
  }
}

async function syncTreeOperation(op: QueuedOperation): Promise<void> {
  const db = getDatabase();
  const payload = op.payload as TreeMeasurement;

  switch (op.operation) {
    case 'create': {
      const response = await apiClient.post('/api/v1/field/trees', {
        projectId: payload.projectId,
        plotId: payload.plotId,
        treeNumber: payload.treeNumber,
        location: payload.location,
        dbh: payload.dbh,
        height: payload.height,
        crownDiameter: payload.crownDiameter,
        merchantableHeight: payload.merchantableHeight,
        speciesCode: payload.speciesCode,
        healthStatus: payload.healthStatus,
        crownClass: payload.crownClass,
        defects: payload.defects,
        notes: payload.notes,
        measuredBy: payload.measuredBy,
        localId: payload.localId,
      });

      // Update local record with remote ID
      await db.executeSql(
        `UPDATE tree_measurements SET
          remote_id = ?, sync_status = 'synced', last_synced_at = ?
        WHERE id = ?`,
        [response.data.id, new Date().toISOString(), payload.id]
      );
      break;
    }

    case 'update': {
      if (!payload.remoteId) {
        throw new Error('Cannot update tree without remote ID');
      }

      await apiClient.patch(`/api/v1/field/trees/${payload.remoteId}`, {
        dbh: payload.dbh,
        height: payload.height,
        crownDiameter: payload.crownDiameter,
        speciesCode: payload.speciesCode,
        healthStatus: payload.healthStatus,
        crownClass: payload.crownClass,
        defects: payload.defects,
        notes: payload.notes,
        verifiedBy: payload.verifiedBy,
      });

      await db.executeSql(
        `UPDATE tree_measurements SET sync_status = 'synced', last_synced_at = ? WHERE id = ?`,
        [new Date().toISOString(), payload.id]
      );
      break;
    }

    case 'delete': {
      const remoteId = payload.remoteId as string;
      if (remoteId) {
        await apiClient.delete(`/api/v1/field/trees/${remoteId}`);
      }
      break;
    }
  }
}

async function syncPlotOperation(op: QueuedOperation): Promise<void> {
  const db = getDatabase();
  const payload = op.payload as SamplePlot;

  switch (op.operation) {
    case 'create': {
      const response = await apiClient.post('/api/v1/field/plots', {
        projectId: payload.projectId,
        plotNumber: payload.plotNumber,
        centerPoint: payload.centerPoint,
        radius: payload.radius,
        shape: payload.shape,
        width: payload.width,
        length: payload.length,
        slope: payload.slope,
        aspect: payload.aspect,
        elevation: payload.elevation,
        standType: payload.standType,
        ageClass: payload.ageClass,
        siteIndex: payload.siteIndex,
        notes: payload.notes,
        measuredBy: payload.measuredBy,
        localId: payload.localId,
      });

      await db.executeSql(
        `UPDATE sample_plots SET
          remote_id = ?, sync_status = 'synced', last_synced_at = ?
        WHERE id = ?`,
        [response.data.id, new Date().toISOString(), payload.id]
      );
      break;
    }

    case 'update': {
      if (!payload.remoteId) {
        throw new Error('Cannot update plot without remote ID');
      }

      await apiClient.patch(`/api/v1/field/plots/${payload.remoteId}`, {
        status: payload.status,
        slope: payload.slope,
        aspect: payload.aspect,
        standType: payload.standType,
        notes: payload.notes,
        completedAt: payload.completedAt,
      });

      await db.executeSql(
        `UPDATE sample_plots SET sync_status = 'synced', last_synced_at = ? WHERE id = ?`,
        [new Date().toISOString(), payload.id]
      );
      break;
    }
  }
}

// ============================================================================
// Photo Upload
// ============================================================================

async function uploadPendingPhotos(): Promise<void> {
  const db = getDatabase();

  const [results] = await db.executeSql(
    `SELECT p.*, t.remote_id as tree_remote_id
     FROM tree_photos p
     JOIN tree_measurements t ON p.tree_id = t.id
     WHERE p.sync_status = 'pending' AND t.remote_id IS NOT NULL
     LIMIT 10`
  );

  if (results.rows.length === 0) {
    return;
  }

  console.log(`Uploading ${results.rows.length} photos`);

  for (let i = 0; i < results.rows.length; i++) {
    const photo = results.rows.item(i);

    try {
      // Create form data for upload
      const formData = new FormData();
      formData.append('file', {
        uri: photo.local_uri,
        type: 'image/jpeg',
        name: `tree_${photo.tree_remote_id}_${photo.type}_${Date.now()}.jpg`,
      } as unknown as Blob);
      formData.append('treeId', photo.tree_remote_id);
      formData.append('type', photo.type);

      const response = await apiClient.post('/api/v1/field/photos', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Update photo with remote URI
      await db.executeSql(
        `UPDATE tree_photos SET remote_uri = ?, sync_status = 'synced' WHERE id = ?`,
        [response.data.url, photo.id]
      );
    } catch (error) {
      console.error(`Failed to upload photo ${photo.id}:`, error);
      await db.executeSql(
        `UPDATE tree_photos SET sync_status = 'error' WHERE id = ?`,
        [photo.id]
      );
    }
  }
}

// ============================================================================
// Sync Status Helpers
// ============================================================================

export async function getSyncStatus(): Promise<{
  pendingTrees: number;
  pendingPlots: number;
  pendingPhotos: number;
  lastSyncAt?: string;
}> {
  const db = getDatabase();

  const [treesResult] = await db.executeSql(
    "SELECT COUNT(*) as count FROM tree_measurements WHERE sync_status = 'pending'"
  );
  const [plotsResult] = await db.executeSql(
    "SELECT COUNT(*) as count FROM sample_plots WHERE sync_status = 'pending'"
  );
  const [photosResult] = await db.executeSql(
    "SELECT COUNT(*) as count FROM tree_photos WHERE sync_status = 'pending'"
  );

  const store = useAppStore.getState();

  return {
    pendingTrees: treesResult.rows.item(0).count,
    pendingPlots: plotsResult.rows.item(0).count,
    pendingPhotos: photosResult.rows.item(0).count,
    lastSyncAt: store.sync.lastSyncAt,
  };
}

export async function retryFailedOperations(): Promise<void> {
  const db = getDatabase();

  // Reset failed operations to allow retry
  await db.executeSql(
    `UPDATE sync_queue SET attempts = 0, error_message = NULL
     WHERE attempts >= max_attempts`
  );

  // Trigger sync
  await performSync(true);
}
