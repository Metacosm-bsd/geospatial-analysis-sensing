/**
 * Project Detail Screen
 * View and manage project details
 * Sprint 55-60: Mobile Field App
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList, FieldProject, SamplePlot, TreeMeasurement } from '../types';
import { useAppStore } from '../store/appStore';
import { getDatabase, getTreesByProject, getPlotsByProject } from '../services/database';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'ProjectDetail'>;

export function ProjectDetailScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { projectId } = route.params;

  const setActivePlot = useAppStore((state) => state.setActivePlot);

  // Fetch project
  const {
    data: project,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const db = getDatabase();
      const [results] = await db.executeSql(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      );

      if (results.rows.length === 0) return null;

      const row = results.rows.item(0);
      return {
        id: row.id,
        localId: row.local_id,
        remoteId: row.remote_id,
        name: row.name,
        description: row.description,
        organizationId: row.organization_id,
        targetTreeCount: row.target_tree_count,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
        syncStatus: row.sync_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } as FieldProject;
    },
  });

  // Fetch trees count
  const { data: trees } = useQuery({
    queryKey: ['trees', projectId],
    queryFn: () => getTreesByProject(projectId),
  });

  // Fetch plots
  const { data: plots } = useQuery({
    queryKey: ['plots', projectId],
    queryFn: () => getPlotsByProject(projectId),
  });

  const handleAddTree = useCallback(() => {
    navigation.navigate('TreeMeasurement', {});
  }, [navigation]);

  const handlePlotPress = useCallback(
    (plot: SamplePlot) => {
      setActivePlot(plot.id);
      navigation.navigate('PlotDetail', { plotId: plot.id });
    },
    [navigation, setActivePlot]
  );

  const handleViewMap = useCallback(() => {
    navigation.navigate('Map', { projectId });
  }, [navigation, projectId]);

  if (isLoading || !project) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading project...</Text>
      </View>
    );
  }

  const completedPlots = plots?.filter((p) => p.status === 'completed').length || 0;
  const totalPlots = plots?.length || 0;
  const progressPercent = totalPlots > 0 ? (completedPlots / totalPlots) * 100 : 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={['#2e7d32']} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.projectName}>{project.name}</Text>
          {project.description && (
            <Text style={styles.projectDescription}>{project.description}</Text>
          )}
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(project.status) }]} />
            <Text style={styles.statusText}>{project.status}</Text>
          </View>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <Text style={styles.sectionTitle}>Progress</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.progressStats}>
          <Text style={styles.progressText}>
            {completedPlots} of {totalPlots} plots completed ({progressPercent.toFixed(0)}%)
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsSection}>
        <View style={styles.statCard}>
          <Icon name="park" size={28} color="#2e7d32" />
          <Text style={styles.statValue}>{trees?.length || 0}</Text>
          <Text style={styles.statLabel}>Trees</Text>
        </View>
        <View style={styles.statCard}>
          <Icon name="crop-free" size={28} color="#2196f3" />
          <Text style={styles.statValue}>{totalPlots}</Text>
          <Text style={styles.statLabel}>Plots</Text>
        </View>
        <View style={styles.statCard}>
          <Icon name="target" size={28} color="#ff9800" />
          <Text style={styles.statValue}>{project.targetTreeCount || 'N/A'}</Text>
          <Text style={styles.statLabel}>Target</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity style={styles.actionButton} onPress={handleAddTree}>
          <Icon name="add-circle" size={24} color="#2e7d32" />
          <Text style={styles.actionText}>Add Tree</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleViewMap}>
          <Icon name="map" size={24} color="#2196f3" />
          <Text style={styles.actionText}>View Map</Text>
        </TouchableOpacity>
      </View>

      {/* Plots List */}
      <View style={styles.plotsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Sample Plots</Text>
          <TouchableOpacity>
            <Icon name="add" size={24} color="#2e7d32" />
          </TouchableOpacity>
        </View>

        {plots && plots.length > 0 ? (
          plots.map((plot) => (
            <TouchableOpacity
              key={plot.id}
              style={styles.plotCard}
              onPress={() => handlePlotPress(plot)}
            >
              <View style={styles.plotInfo}>
                <Text style={styles.plotNumber}>Plot {plot.plotNumber}</Text>
                <Text style={styles.plotStatus}>{plot.status.replace('_', ' ')}</Text>
              </View>
              <View style={styles.plotStats}>
                <Text style={styles.plotStatText}>
                  {plot.shape} • {plot.radius}m radius
                </Text>
              </View>
              <Icon name="chevron-right" size={24} color="#ccc" />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyPlots}>
            <Text style={styles.emptyText}>No plots created yet</Text>
          </View>
        )}
      </View>

      {/* Project Info */}
      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Project Details</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Start Date</Text>
          <Text style={styles.infoValue}>
            {new Date(project.startDate).toLocaleDateString()}
          </Text>
        </View>
        {project.endDate && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>End Date</Text>
            <Text style={styles.infoValue}>
              {new Date(project.endDate).toLocaleDateString()}
            </Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Sync Status</Text>
          <Text style={[styles.infoValue, { color: project.syncStatus === 'synced' ? '#4caf50' : '#ff9800' }]}>
            {project.syncStatus}
          </Text>
        </View>
      </View>

      <View style={styles.footer} />
    </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#2e7d32',
    padding: 24,
  },
  headerContent: {},
  projectName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  projectDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  progressSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    borderRadius: 4,
  },
  progressStats: {
    marginTop: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
  },
  statsSection: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  actionsSection: {
    flexDirection: 'row',
    margin: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  plotsSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
  plotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  plotInfo: {
    flex: 1,
  },
  plotNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  plotStatus: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  plotStats: {
    marginRight: 8,
  },
  plotStatText: {
    fontSize: 12,
    color: '#999',
  },
  emptyPlots: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  infoSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  footer: {
    height: 32,
  },
});
