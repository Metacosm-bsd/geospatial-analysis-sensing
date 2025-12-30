/**
 * Profile Screen
 * User profile and account management
 * Sprint 55-60: Mobile Field App
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../types';
import { useAppStore, useSync } from '../store/appStore';
import { getSyncStatus } from '../services/sync';
import { logout as apiLogout } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const auth = useAppStore((state) => state.auth);
  const { pendingOperations, lastSyncAt } = useSync();
  const logout = useAppStore((state) => state.logout);

  const handleLogout = useCallback(async () => {
    if (pendingOperations > 0) {
      Alert.alert(
        'Unsaved Changes',
        `You have ${pendingOperations} pending changes that haven't been synced. If you log out, these changes may be lost.\n\nAre you sure you want to log out?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sync First',
            onPress: () => navigation.navigate('Sync'),
          },
          {
            text: 'Log Out Anyway',
            style: 'destructive',
            onPress: async () => {
              await apiLogout();
              logout();
            },
          },
        ]
      );
    } else {
      Alert.alert('Log Out', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await apiLogout();
            logout();
          },
        },
      ]);
    }
  }, [pendingOperations, logout, navigation]);

  const menuItems = [
    {
      icon: 'sync',
      label: 'Sync Status',
      sublabel: pendingOperations > 0 ? `${pendingOperations} pending` : 'All synced',
      onPress: () => navigation.navigate('Sync'),
      badge: pendingOperations > 0 ? pendingOperations : undefined,
    },
    {
      icon: 'settings',
      label: 'Settings',
      sublabel: 'App preferences',
      onPress: () => navigation.navigate('Settings'),
    },
    {
      icon: 'help-outline',
      label: 'Help & Support',
      sublabel: 'FAQs and contact',
      onPress: () => Alert.alert('Help', 'Contact support@lidarforest.com for assistance.'),
    },
    {
      icon: 'info-outline',
      label: 'About',
      sublabel: 'Version 1.0.0',
      onPress: () =>
        Alert.alert(
          'LiDAR Forest Field App',
          'Version 1.0.0\n\nA product of LiDAR Forest Analysis Platform.\n\nFor field data collection, GPS tree positioning, and offline inventory management.'
        ),
    },
  ];

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Icon name="person" size={40} color="#fff" />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>Field User</Text>
          <Text style={styles.userEmail}>{auth.userId || 'user@example.com'}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Icon name="cloud-done" size={24} color="#4caf50" />
          <Text style={styles.statValue}>
            {lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : 'Never'}
          </Text>
          <Text style={styles.statLabel}>Last Sync</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Icon
            name={pendingOperations > 0 ? 'cloud-upload' : 'check-circle'}
            size={24}
            color={pendingOperations > 0 ? '#ff9800' : '#4caf50'}
          />
          <Text style={styles.statValue}>{pendingOperations}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.menu}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.menuItem}
            onPress={item.onPress}
          >
            <View style={styles.menuIcon}>
              <Icon name={item.icon} size={24} color="#666" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuSublabel}>{item.sublabel}</Text>
            </View>
            {item.badge !== undefined && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            )}
            <Icon name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Icon name="logout" size={20} color="#f44336" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          LiDAR Forest Analysis Platform
        </Text>
        <Text style={styles.footerSubtext}>
          Field Data Collection App v1.0.0
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    padding: 24,
    paddingTop: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  userEmail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -24,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  menu: {
    backgroundColor: '#fff',
    marginTop: 24,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuIcon: {
    width: 40,
    alignItems: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: 8,
  },
  menuLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  menuSublabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#ff9800',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  logoutText: {
    fontSize: 16,
    color: '#f44336',
    fontWeight: '600',
    marginLeft: 8,
  },
  footer: {
    alignItems: 'center',
    padding: 32,
  },
  footerText: {
    fontSize: 14,
    color: '#999',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 4,
  },
});
