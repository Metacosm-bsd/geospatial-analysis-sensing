/**
 * Plot Detail Screen
 * View and manage sample plot details
 * Sprint 55-60: Mobile Field App
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList, SamplePlot, TreeMeasurement } from '../types';
import { getDatabase, getTreesByPlot } from '../services/database';
import { formatCoordinates } from '../services/location';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'PlotDetail'>;

export function PlotDetailScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { plotId } = route.params;

  // Fetch plot
  const { data: plot, isLoading } = useQuery({
    queryKey: ['plot', plotId],
    queryFn: async () => {
      const db = getDatabase();
      const [results] = await db.executeSql(
        'SELECT * FROM sample_plots WHERE id = ?',
        [plotId]
      );

      if (results.rows.length === 0) return null;

      const row = results.rows.item(0);
      return {
        id: row.id,
        localId: row.local_id,
        remoteId: row.remote_id,
        projectId: row.project_id,
        plotNumber: row.plot_number,
        centerPoint: {
          latitude: row.center_latitude,
          longitude: row.center_longitude,
          altitude: row.center_altitude,
          accuracy: row.center_accuracy,
          timestamp: row.created_at,
        },
        radius: row.radius,
        shape: row.shape,
        slope: row.slope,
        aspect: row.aspect,
        elevation: row.elevation,
        standType: row.stand_type,
        ageClass: row.age_class,
        siteIndex: row.site_index,
        status: row.status,
        measuredBy: row.measured_by,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        notes: row.notes,
        syncStatus: row.sync_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } as SamplePlot;
    },
  });

  // Fetch trees in plot
  const { data: trees } = useQuery({
    queryKey: ['plotTrees', plotId],
    queryFn: () => getTreesByPlot(plotId),
    enabled: !!plotId,
  });

  const handleAddTree = useCallback(() => {
    navigation.navigate('TreeMeasurement', { plotId });
  }, [navigation, plotId]);

  const handleTreePress = useCallback(
    (tree: TreeMeasurement) => {
      navigation.navigate('TreeMeasurement', { plotId, treeId: tree.id });
    },
    [navigation, plotId]
  );

  const handleCompletePlot = useCallback(() => {
    Alert.alert(
      'Complete Plot',
      'Mark this plot as completed? All tree measurements will be finalized.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            // Update plot status in database
            const db = getDatabase();
            await db.executeSql(
              "UPDATE sample_plots SET status = 'completed', completed_at = ?, sync_status = 'pending' WHERE id = ?",
              [new Date().toISOString(), plotId]
            );
            Alert.alert('Success', 'Plot marked as completed');
            navigation.goBack();
          },
        },
      ]
    );
  }, [plotId, navigation]);

  if (isLoading || !plot) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading plot...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.plotNumber}>Plot {plot.plotNumber}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(plot.status) }]}>
          <Text style={styles.statusText}>{plot.status.replace('_', ' ')}</Text>
        </View>
      </View>

      {/* Plot Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Plot Configuration</Text>

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Icon name="crop-free" size={20} color="#2e7d32" />
            <Text style={styles.infoValue}>{plot.shape}</Text>
            <Text style={styles.infoLabel}>Shape</Text>
          </View>
          <View style={styles.infoItem}>
            <Icon name="straighten" size={20} color="#2196f3" />
            <Text style={styles.infoValue}>{plot.radius}m</Text>
            <Text style={styles.infoLabel}>Radius</Text>
          </View>
          <View style={styles.infoItem}>
            <Icon name="terrain" size={20} color="#ff9800" />
            <Text style={styles.infoValue}>{plot.elevation?.toFixed(0) || 'N/A'}m</Text>
            <Text style={styles.infoLabel}>Elevation</Text>
          </View>
        </View>

        <View style={styles.locationRow}>
          <Icon name="location-on" size={20} color="#f44336" />
          <Text style={styles.locationText}>
            {formatCoordinates(plot.centerPoint.latitude, plot.centerPoint.longitude)}
          </Text>
        </View>
      </View>

      {/* Stand Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stand Characteristics</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Slope</Text>
          <Text style={styles.detailValue}>{plot.slope ? `${plot.slope}%` : 'Not recorded'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Aspect</Text>
          <Text style={styles.detailValue}>
            {plot.aspect ? `${plot.aspect}° (${getAspectDirection(plot.aspect)})` : 'Not recorded'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Stand Type</Text>
          <Text style={styles.detailValue}>{plot.standType || 'Not recorded'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Age Class</Text>
          <Text style={styles.detailValue}>{plot.ageClass || 'Not recorded'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Site Index</Text>
          <Text style={styles.detailValue}>{plot.siteIndex || 'Not recorded'}</Text>
        </View>
      </View>

      {/* Trees in Plot */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trees ({trees?.length || 0})</Text>
          <TouchableOpacity onPress={handleAddTree}>
            <Icon name="add-circle" size={28} color="#2e7d32" />
          </TouchableOpacity>
        </View>

        {trees && trees.length > 0 ? (
          trees.map((tree) => (
            <TouchableOpacity
              key={tree.id}
              style={styles.treeRow}
              onPress={() => handleTreePress(tree)}
            >
              <View style={styles.treeNumber}>
                <Text style={styles.treeNumberText}>#{tree.treeNumber}</Text>
              </View>
              <View style={styles.treeInfo}>
                <Text style={styles.treeSpecies}>{tree.speciesCode || 'Unknown'}</Text>
                <Text style={styles.treeMeasurements}>
                  DBH: {tree.dbh}cm{tree.height && ` | H: ${tree.height}m`}
                </Text>
              </View>
              <Icon name="chevron-right" size={24} color="#ccc" />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyTrees}>
            <Icon name="park" size={32} color="#ccc" />
            <Text style={styles.emptyText}>No trees measured in this plot</Text>
            <TouchableOpacity style={styles.addTreeButton} onPress={handleAddTree}>
              <Icon name="add" size={20} color="#fff" />
              <Text style={styles.addTreeText}>Add First Tree</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Notes */}
      {plot.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{plot.notes}</Text>
        </View>
      )}

      {/* Actions */}
      {plot.status !== 'completed' && (
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.completeButton}
            onPress={handleCompletePlot}
          >
            <Icon name="check-circle" size={24} color="#fff" />
            <Text style={styles.completeButtonText}>Mark Plot Complete</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer} />
    </ScrollView>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'not_started':
      return '#9e9e9e';
    case 'in_progress':
      return '#ff9800';
    case 'completed':
      return '#4caf50';
    case 'verified':
      return '#2196f3';
    default:
      return '#9e9e9e';
  }
}

function getAspectDirection(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  plotNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
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
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  infoItem: {
    alignItems: 'center',
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#333',
    fontFamily: 'monospace',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  treeNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  treeNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
  },
  treeInfo: {
    flex: 1,
  },
  treeSpecies: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  treeMeasurements: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  emptyTrees: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    marginBottom: 16,
  },
  addTreeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  addTreeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  actionsSection: {
    padding: 16,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    height: 32,
  },
});
