/**
 * Crew Screen
 * Field crew management
 * Sprint 55-60: Mobile Field App
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';

import type { CrewMember, FieldCrew } from '../types';
import { useAppStore } from '../store/appStore';
import { getDatabase } from '../services/database';

// Mock crew data for now (would come from database in production)
const mockCrewMembers: CrewMember[] = [
  {
    id: '1',
    name: 'John Smith',
    email: 'john@lidarforest.com',
    role: 'lead',
    phone: '555-0101',
    certifications: ['FIA Level II', 'First Aid'],
    isActive: true,
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    email: 'sarah@lidarforest.com',
    role: 'member',
    phone: '555-0102',
    certifications: ['FIA Level I'],
    isActive: true,
  },
  {
    id: '3',
    name: 'Mike Davis',
    email: 'mike@lidarforest.com',
    role: 'member',
    phone: '555-0103',
    certifications: ['FIA Level I', 'GPS Specialist'],
    isActive: true,
  },
];

export function CrewScreen(): React.JSX.Element {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const auth = useAppStore((state) => state.auth);

  const { data: crewMembers } = useQuery({
    queryKey: ['crew', activeProjectId],
    queryFn: async () => {
      // In production, fetch from database
      return mockCrewMembers;
    },
  });

  const handleMemberPress = useCallback((member: CrewMember) => {
    Alert.alert(
      member.name,
      `Email: ${member.email}\nPhone: ${member.phone || 'N/A'}\nRole: ${member.role}\n\nCertifications:\n${member.certifications?.join('\n') || 'None'}`,
      [
        { text: 'Call', onPress: () => member.phone && Alert.alert('Calling', member.phone) },
        { text: 'Close', style: 'cancel' },
      ]
    );
  }, []);

  const handleAddMember = useCallback(() => {
    Alert.alert('Add Crew Member', 'This feature will be available in a future update.');
  }, []);

  const renderMember = useCallback(
    ({ item }: { item: CrewMember }) => (
      <TouchableOpacity
        style={styles.memberCard}
        onPress={() => handleMemberPress(item)}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()}
          </Text>
          {item.role === 'lead' && (
            <View style={styles.leaderBadge}>
              <Icon name="star" size={12} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name}</Text>
          <Text style={styles.memberRole}>
            {item.role === 'lead' ? 'Crew Lead' : 'Crew Member'}
          </Text>
          {item.certifications && item.certifications.length > 0 && (
            <View style={styles.certifications}>
              {item.certifications.slice(0, 2).map((cert, index) => (
                <View key={index} style={styles.certBadge}>
                  <Text style={styles.certText}>{cert}</Text>
                </View>
              ))}
              {item.certifications.length > 2 && (
                <Text style={styles.moreCerts}>
                  +{item.certifications.length - 2}
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.memberActions}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: item.isActive ? '#4caf50' : '#9e9e9e' },
            ]}
          />
        </View>
      </TouchableOpacity>
    ),
    [handleMemberPress]
  );

  if (!activeProjectId) {
    return (
      <View style={styles.emptyState}>
        <Icon name="group" size={64} color="#ccc" />
        <Text style={styles.emptyText}>No Project Selected</Text>
        <Text style={styles.emptySubtext}>
          Select a project to view the assigned field crew
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{crewMembers?.length || 0}</Text>
          <Text style={styles.summaryLabel}>Members</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {crewMembers?.filter((m) => m.role === 'lead').length || 0}
          </Text>
          <Text style={styles.summaryLabel}>Leads</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {crewMembers?.filter((m) => m.isActive).length || 0}
          </Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
      </View>

      {/* Crew List */}
      <FlatList
        data={crewMembers}
        renderItem={renderMember}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyListState}>
            <Icon name="person-add" size={48} color="#ccc" />
            <Text style={styles.emptyListText}>No crew assigned</Text>
          </View>
        }
      />

      {/* Add Button */}
      <TouchableOpacity style={styles.fab} onPress={handleAddMember}>
        <Icon name="person-add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  summary: {
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
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2e7d32',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  leaderBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#ff9800',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  memberRole: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  certifications: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 4,
  },
  certBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  certText: {
    fontSize: 10,
    color: '#2e7d32',
  },
  moreCerts: {
    fontSize: 10,
    color: '#666',
    alignSelf: 'center',
    marginLeft: 4,
  },
  memberActions: {
    alignItems: 'flex-end',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
    color: '#999',
    marginTop: 16,
  },
});
