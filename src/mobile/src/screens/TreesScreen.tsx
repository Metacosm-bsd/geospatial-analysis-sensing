/**
 * Trees Screen
 * List all measured trees for the active project
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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList, TreeMeasurement } from '../types';
import { useAppStore } from '../store/appStore';
import { getTreesByProject } from '../services/database';
import { formatCoordinates } from '../services/location';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function TreesScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const activeProjectId = useAppStore((state) => state.activeProjectId);

  const {
    data: trees,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['trees', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      return getTreesByProject(activeProjectId);
    },
    enabled: !!activeProjectId,
  });

  const handleAddTree = useCallback(() => {
    navigation.navigate('TreeMeasurement', {});
  }, [navigation]);

  const handleTreePress = useCallback(
    (tree: TreeMeasurement) => {
      navigation.navigate('TreeMeasurement', { treeId: tree.id });
    },
    [navigation]
  );

  const renderTree = useCallback(
    ({ item }: { item: TreeMeasurement }) => (
      <TouchableOpacity
        style={styles.treeCard}
        onPress={() => handleTreePress(item)}
      >
        <View style={styles.treeHeader}>
          <View style={styles.treeNumber}>
            <Text style={styles.treeNumberText}>#{item.treeNumber}</Text>
          </View>
          <View style={styles.treeInfo}>
            <Text style={styles.speciesText}>
              {item.speciesCode || 'Unknown species'}
            </Text>
            <Text style={styles.locationText}>
              {formatCoordinates(item.location.latitude, item.location.longitude)}
            </Text>
          </View>
          <Icon
            name={item.syncStatus === 'synced' ? 'cloud-done' : 'cloud-off'}
            size={20}
            color={item.syncStatus === 'synced' ? '#4caf50' : '#ff9800'}
          />
        </View>

        <View style={styles.measurements}>
          <View style={styles.measurementItem}>
            <Text style={styles.measurementLabel}>DBH</Text>
            <Text style={styles.measurementValue}>{item.dbh} cm</Text>
          </View>
          {item.height && (
            <View style={styles.measurementItem}>
              <Text style={styles.measurementLabel}>Height</Text>
              <Text style={styles.measurementValue}>{item.height} m</Text>
            </View>
          )}
          {item.crownDiameter && (
            <View style={styles.measurementItem}>
              <Text style={styles.measurementLabel}>Crown</Text>
              <Text style={styles.measurementValue}>{item.crownDiameter} m</Text>
            </View>
          )}
          <View style={styles.measurementItem}>
            <Text style={styles.measurementLabel}>Health</Text>
            <View style={[styles.healthBadge, { backgroundColor: getHealthColor(item.healthStatus) }]}>
              <Text style={styles.healthText}>{item.healthStatus}</Text>
            </View>
          </View>
        </View>

        {item.defects.length > 0 && (
          <View style={styles.defects}>
            <Icon name="warning" size={14} color="#ff9800" />
            <Text style={styles.defectsText}>
              {item.defects.length} defect{item.defects.length > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    ),
    [handleTreePress]
  );

  if (!activeProjectId) {
    return (
      <View style={styles.emptyState}>
        <Icon name="folder-open" size={64} color="#ccc" />
        <Text style={styles.emptyText}>No Project Selected</Text>
        <Text style={styles.emptySubtext}>
          Select a project from the Projects tab to view trees
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{trees?.length || 0}</Text>
          <Text style={styles.summaryLabel}>Trees</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {trees?.filter((t) => t.syncStatus === 'pending').length || 0}
          </Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {trees?.length
              ? (trees.reduce((sum, t) => sum + t.dbh, 0) / trees.length).toFixed(1)
              : 0}
          </Text>
          <Text style={styles.summaryLabel}>Avg DBH</Text>
        </View>
      </View>

      {/* Trees List */}
      <FlatList
        data={trees}
        renderItem={renderTree}
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
          <View style={styles.emptyListState}>
            <Icon name="park" size={48} color="#ccc" />
            <Text style={styles.emptyListText}>No trees measured yet</Text>
            <Text style={styles.emptyListSubtext}>
              Tap the + button to add your first tree
            </Text>
          </View>
        }
      />

      {/* Add Button */}
      <TouchableOpacity style={styles.fab} onPress={handleAddTree}>
        <Icon name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function getHealthColor(status: string): string {
  switch (status) {
    case 'healthy':
      return '#4caf50';
    case 'declining':
      return '#ff9800';
    case 'dead':
      return '#f44336';
    default:
      return '#9e9e9e';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2e7d32',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  treeCard: {
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
  treeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  treeNumber: {
    backgroundColor: '#2e7d32',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  treeNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  treeInfo: {
    flex: 1,
  },
  speciesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  locationText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  measurements: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
    gap: 16,
  },
  measurementItem: {
    alignItems: 'center',
  },
  measurementLabel: {
    fontSize: 10,
    color: '#999',
    textTransform: 'uppercase',
  },
  measurementValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 2,
  },
  healthBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  healthText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  defects: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#fff3e0',
    backgroundColor: '#fff3e0',
    marginHorizontal: -16,
    marginBottom: -16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  defectsText: {
    fontSize: 12,
    color: '#e65100',
    marginLeft: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2e7d32',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
  },
  emptyListState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyListText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptyListSubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 8,
  },
});
