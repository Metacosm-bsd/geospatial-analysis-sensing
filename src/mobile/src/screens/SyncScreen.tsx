/**
 * Sync Screen
 * Sync status and manual sync controls
 * Sprint 55-60: Mobile Field App
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { useAppStore, useSync } from '../store/appStore';
import {
  triggerManualSync,
  getSyncStatus,
  retryFailedOperations,
  checkNetworkStatus,
} from '../services/sync';
import { getPendingSyncOperations } from '../services/database';
import type { QueuedOperation } from '../types';

interface SyncStatusDetails {
  pendingTrees: number;
  pendingPlots: number;
  pendingPhotos: number;
  lastSyncAt?: string;
}

export function SyncScreen(): React.JSX.Element {
  const { isOnline, isSyncing, lastSyncAt, pendingOperations, syncErrors } = useSync();
  const clearSyncErrors = useAppStore((state) => state.clearSyncErrors);

  const [statusDetails, setStatusDetails] = useState<SyncStatusDetails | null>(null);
  const [pendingQueue, setPendingQueue] = useState<QueuedOperation[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSyncStatus = useCallback(async () => {
    try {
      const details = await getSyncStatus();
      setStatusDetails(details);

      const queue = await getPendingSyncOperations();
      setPendingQueue(queue);
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  }, []);

  useEffect(() => {
    loadSyncStatus();
  }, [loadSyncStatus, pendingOperations]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadSyncStatus();
    setIsRefreshing(false);
  }, [loadSyncStatus]);

  const handleSyncNow = useCallback(async () => {
    const online = await checkNetworkStatus();
    if (!online) {
      Alert.alert('Offline', 'You need an internet connection to sync.');
      return;
    }

    try {
      await triggerManualSync();
      await loadSyncStatus();
      Alert.alert('Sync Complete', 'All data has been synchronized.');
    } catch (error) {
      Alert.alert('Sync Failed', 'Unable to sync. Please try again later.');
    }
  }, [loadSyncStatus]);

  const handleRetryFailed = useCallback(async () => {
    Alert.alert(
      'Retry Failed Operations',
      'This will attempt to sync all previously failed operations.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retry',
          onPress: async () => {
            try {
              await retryFailedOperations();
              await loadSyncStatus();
            } catch (error) {
              Alert.alert('Error', 'Failed to retry operations.');
            }
          },
        },
      ]
    );
  }, [loadSyncStatus]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          colors={['#2e7d32']}
        />
      }
    >
      {/* Connection Status */}
      <View style={[styles.statusCard, isOnline ? styles.statusOnline : styles.statusOffline]}>
        <Icon
          name={isOnline ? 'cloud-queue' : 'cloud-off'}
          size={32}
          color="#fff"
        />
        <Text style={styles.statusText}>
          {isOnline ? 'Online' : 'Offline'}
        </Text>
        {lastSyncAt && (
          <Text style={styles.lastSyncText}>
            Last sync: {new Date(lastSyncAt).toLocaleString()}
          </Text>
        )}
      </View>

      {/* Sync Progress */}
      {isSyncing && (
        <View style={styles.progressCard}>
          <ActivityIndicator size="large" color="#2e7d32" />
          <Text style={styles.progressText}>Syncing...</Text>
        </View>
      )}

      {/* Pending Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pending Sync</Text>

        <View style={styles.pendingGrid}>
          <View style={styles.pendingItem}>
            <Icon name="park" size={28} color="#2e7d32" />
            <Text style={styles.pendingValue}>{statusDetails?.pendingTrees || 0}</Text>
            <Text style={styles.pendingLabel}>Trees</Text>
          </View>

          <View style={styles.pendingItem}>
            <Icon name="crop-free" size={28} color="#2196f3" />
            <Text style={styles.pendingValue}>{statusDetails?.pendingPlots || 0}</Text>
            <Text style={styles.pendingLabel}>Plots</Text>
          </View>

          <View style={styles.pendingItem}>
            <Icon name="photo-camera" size={28} color="#ff9800" />
            <Text style={styles.pendingValue}>{statusDetails?.pendingPhotos || 0}</Text>
            <Text style={styles.pendingLabel}>Photos</Text>
          </View>
        </View>

        {pendingOperations === 0 ? (
          <View style={styles.allSyncedBanner}>
            <Icon name="check-circle" size={24} color="#4caf50" />
            <Text style={styles.allSyncedText}>All data is synchronized</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.syncButton, !isOnline && styles.syncButtonDisabled]}
            onPress={handleSyncNow}
            disabled={!isOnline || isSyncing}
          >
            <Icon name="sync" size={24} color="#fff" />
            <Text style={styles.syncButtonText}>Sync Now</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sync Queue */}
      {pendingQueue.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync Queue</Text>

          {pendingQueue.slice(0, 10).map((op, index) => (
            <View key={op.id} style={styles.queueItem}>
              <View style={styles.queueIcon}>
                <Icon
                  name={getOperationIcon(op.entityType)}
                  size={20}
                  color="#666"
                />
              </View>
              <View style={styles.queueInfo}>
                <Text style={styles.queueOperation}>
                  {op.operation.toUpperCase()} {op.entityType}
                </Text>
                <Text style={styles.queueDate}>
                  {new Date(op.createdAt).toLocaleString()}
                </Text>
              </View>
              {op.attempts > 0 && (
                <View style={styles.attemptsBadge}>
                  <Text style={styles.attemptsText}>
                    {op.attempts}/{op.maxAttempts}
                  </Text>
                </View>
              )}
            </View>
          ))}

          {pendingQueue.length > 10 && (
            <Text style={styles.moreItems}>
              +{pendingQueue.length - 10} more items
            </Text>
          )}
        </View>
      )}

      {/* Errors */}
      {syncErrors.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Errors</Text>
            <TouchableOpacity onPress={clearSyncErrors}>
              <Text style={styles.clearLink}>Clear</Text>
            </TouchableOpacity>
          </View>

          {syncErrors.map((error, index) => (
            <View key={index} style={styles.errorItem}>
              <Icon name="error-outline" size={16} color="#f44336" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ))}

          <TouchableOpacity style={styles.retryButton} onPress={handleRetryFailed}>
            <Icon name="refresh" size={20} color="#ff9800" />
            <Text style={styles.retryButtonText}>Retry Failed Operations</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tips */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>Sync Tips</Text>
        <Text style={styles.tipText}>
          {'\u2022'} Data is saved locally and syncs automatically when online
        </Text>
        <Text style={styles.tipText}>
          {'\u2022'} Enable WiFi-only sync in Settings to save mobile data
        </Text>
        <Text style={styles.tipText}>
          {'\u2022'} Photos may take longer to sync on slow connections
        </Text>
      </View>

      <View style={styles.footer} />
    </ScrollView>
  );
}

function getOperationIcon(entityType: string): string {
  switch (entityType) {
    case 'tree':
      return 'park';
    case 'plot':
      return 'crop-free';
    case 'photo':
      return 'photo-camera';
    default:
      return 'data-object';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  statusCard: {
    alignItems: 'center',
    padding: 24,
    margin: 16,
    borderRadius: 12,
  },
  statusOnline: {
    backgroundColor: '#4caf50',
  },
  statusOffline: {
    backgroundColor: '#9e9e9e',
  },
  statusText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  lastSyncText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 4,
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  progressText: {
    fontSize: 16,
    color: '#333',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  clearLink: {
    color: '#2196f3',
    fontSize: 14,
  },
  pendingGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  pendingItem: {
    alignItems: 'center',
  },
  pendingValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
  },
  pendingLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  allSyncedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  allSyncedText: {
    color: '#2e7d32',
    fontSize: 14,
    fontWeight: '500',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2e7d32',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  syncButtonDisabled: {
    backgroundColor: '#a5d6a7',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  queueIcon: {
    width: 32,
    alignItems: 'center',
  },
  queueInfo: {
    flex: 1,
    marginLeft: 8,
  },
  queueOperation: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  queueDate: {
    fontSize: 12,
    color: '#999',
  },
  attemptsBadge: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  attemptsText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  moreItems: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginTop: 8,
  },
  errorItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#f44336',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  retryButtonText: {
    color: '#e65100',
    fontSize: 14,
    fontWeight: '500',
  },
  tipsSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565c0',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 12,
    color: '#1976d2',
    marginBottom: 4,
  },
  footer: {
    height: 32,
  },
});
