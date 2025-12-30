/**
 * Projects Screen
 * List and manage field projects
 * Sprint 55-60: Mobile Field App
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList, FieldProject } from '../types';
import { useAppStore, useSync } from '../store/appStore';
import { getDatabase } from '../services/database';
import { triggerManualSync } from '../services/sync';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ProjectsScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const { isOnline, pendingOperations } = useSync();
  const setActiveProject = useAppStore((state) => state.setActiveProject);

  // Fetch projects from local database
  const {
    data: projects,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const db = getDatabase();
      const [results] = await db.executeSql(
        'SELECT * FROM projects ORDER BY updated_at DESC'
      );

      const projectList: FieldProject[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        const row = results.rows.item(i);
        projectList.push({
          id: row.id,
          localId: row.local_id,
          remoteId: row.remote_id,
          name: row.name,
          description: row.description,
          organizationId: row.organization_id,
          boundaryGeoJSON: row.boundary_geojson
            ? JSON.parse(row.boundary_geojson)
            : undefined,
          targetTreeCount: row.target_tree_count,
          assignedCrewIds: JSON.parse(row.assigned_crew_ids || '[]'),
          status: row.status,
          startDate: row.start_date,
          endDate: row.end_date,
          syncStatus: row.sync_status,
          lastSyncedAt: row.last_synced_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }

      return projectList;
    },
  });

  const handleProjectPress = useCallback(
    (project: FieldProject) => {
      setActiveProject(project.id);
      navigation.navigate('ProjectDetail', { projectId: project.id });
    },
    [navigation, setActiveProject]
  );

  const handleSync = useCallback(async () => {
    try {
      await triggerManualSync();
      refetch();
    } catch (error) {
      Alert.alert('Sync Failed', 'Unable to sync with server. Please try again.');
    }
  }, [refetch]);

  const renderProject = useCallback(
    ({ item }: { item: FieldProject }) => (
      <TouchableOpacity
        style={styles.projectCard}
        onPress={() => handleProjectPress(item)}
      >
        <View style={styles.projectHeader}>
          <View style={styles.projectInfo}>
            <Text style={styles.projectName}>{item.name}</Text>
            <Text style={styles.projectDescription} numberOfLines={2}>
              {item.description || 'No description'}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor(item.status) },
              ]}
            />
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.projectStats}>
          <View style={styles.statItem}>
            <Icon name="park" size={16} color="#666" />
            <Text style={styles.statText}>
              {item.targetTreeCount ? `${item.targetTreeCount} trees` : 'N/A'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="calendar-today" size={16} color="#666" />
            <Text style={styles.statText}>
              {new Date(item.startDate).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Icon
              name={item.syncStatus === 'synced' ? 'cloud-done' : 'cloud-off'}
              size={16}
              color={item.syncStatus === 'synced' ? '#4caf50' : '#ff9800'}
            />
            <Text style={styles.statText}>{item.syncStatus}</Text>
          </View>
        </View>
      </TouchableOpacity>
    ),
    [handleProjectPress]
  );

  return (
    <View style={styles.container}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.connectionStatus}>
          <Icon
            name={isOnline ? 'cloud-queue' : 'cloud-off'}
            size={20}
            color={isOnline ? '#4caf50' : '#f44336'}
          />
          <Text style={styles.connectionText}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
        {pendingOperations > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>{pendingOperations} pending</Text>
          </View>
        )}
        <TouchableOpacity style={styles.syncButton} onPress={handleSync}>
          <Icon name="sync" size={20} color="#2e7d32" />
        </TouchableOpacity>
      </View>

      {/* Projects List */}
      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={['#2e7d32']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="folder-open" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No Projects</Text>
            <Text style={styles.emptySubtext}>
              Sync with the server to download assigned projects
            </Text>
          </View>
        }
      />
    </View>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return '#4caf50';
    case 'completed':
      return '#2196f3';
    case 'archived':
      return '#9e9e9e';
    default:
      return '#ff9800';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  connectionText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#666',
  },
  pendingBadge: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  pendingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  syncButton: {
    padding: 8,
  },
  listContent: {
    padding: 16,
  },
  projectCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  projectInfo: {
    flex: 1,
    marginRight: 12,
  },
  projectName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  projectDescription: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  projectStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  statText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
