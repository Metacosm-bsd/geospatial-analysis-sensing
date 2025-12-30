/**
 * Settings Screen
 * App configuration and preferences
 * Sprint 55-60: Mobile Field App
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { useAppStore, useSettings } from '../store/appStore';
import { clearAllData } from '../services/database';

export function SettingsScreen(): React.JSX.Element {
  const settings = useSettings();
  const updateSettings = useAppStore((state) => state.updateSettings);

  const handleClearData = useCallback(() => {
    Alert.alert(
      'Clear Local Data',
      'This will delete all locally stored data including unsynced measurements. This action cannot be undone.\n\nAre you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              Alert.alert('Success', 'Local data has been cleared.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data.');
            }
          },
        },
      ]
    );
  }, []);

  return (
    <ScrollView style={styles.container}>
      {/* Sync Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sync</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Auto Sync</Text>
            <Text style={styles.settingDescription}>
              Automatically sync data when online
            </Text>
          </View>
          <Switch
            value={settings.autoSync}
            onValueChange={(value) => updateSettings({ autoSync: value })}
            trackColor={{ false: '#ddd', true: '#a5d6a7' }}
            thumbColor={settings.autoSync ? '#2e7d32' : '#f4f3f4'}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>WiFi Only</Text>
            <Text style={styles.settingDescription}>
              Only sync when connected to WiFi
            </Text>
          </View>
          <Switch
            value={settings.syncOnWifiOnly}
            onValueChange={(value) => updateSettings({ syncOnWifiOnly: value })}
            trackColor={{ false: '#ddd', true: '#a5d6a7' }}
            thumbColor={settings.syncOnWifiOnly ? '#2e7d32' : '#f4f3f4'}
          />
        </View>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() =>
            Alert.alert('Sync Interval', 'Select sync frequency', [
              { text: '1 minute', onPress: () => updateSettings({ syncIntervalMinutes: 1 }) },
              { text: '5 minutes', onPress: () => updateSettings({ syncIntervalMinutes: 5 }) },
              { text: '15 minutes', onPress: () => updateSettings({ syncIntervalMinutes: 15 }) },
              { text: '30 minutes', onPress: () => updateSettings({ syncIntervalMinutes: 30 }) },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Sync Interval</Text>
            <Text style={styles.settingDescription}>
              How often to check for sync
            </Text>
          </View>
          <Text style={styles.settingValue}>{settings.syncIntervalMinutes} min</Text>
        </TouchableOpacity>
      </View>

      {/* GPS Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>GPS</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>High Accuracy</Text>
            <Text style={styles.settingDescription}>
              Use GPS for best position accuracy
            </Text>
          </View>
          <Switch
            value={settings.gpsHighAccuracy}
            onValueChange={(value) => updateSettings({ gpsHighAccuracy: value })}
            trackColor={{ false: '#ddd', true: '#a5d6a7' }}
            thumbColor={settings.gpsHighAccuracy ? '#2e7d32' : '#f4f3f4'}
          />
        </View>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() =>
            Alert.alert('GPS Timeout', 'Maximum time to wait for GPS fix', [
              { text: '15 seconds', onPress: () => updateSettings({ gpsTimeout: 15000 }) },
              { text: '30 seconds', onPress: () => updateSettings({ gpsTimeout: 30000 }) },
              { text: '60 seconds', onPress: () => updateSettings({ gpsTimeout: 60000 }) },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>GPS Timeout</Text>
            <Text style={styles.settingDescription}>
              Maximum wait for GPS fix
            </Text>
          </View>
          <Text style={styles.settingValue}>{settings.gpsTimeout / 1000}s</Text>
        </TouchableOpacity>
      </View>

      {/* Measurement Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Measurements</Text>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() =>
            Alert.alert('Measurement System', 'Select preferred units', [
              { text: 'Metric (cm, m)', onPress: () => updateSettings({ measurementSystem: 'metric' }) },
              { text: 'Imperial (in, ft)', onPress: () => updateSettings({ measurementSystem: 'imperial' }) },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Units</Text>
            <Text style={styles.settingDescription}>
              Measurement unit system
            </Text>
          </View>
          <Text style={styles.settingValue}>
            {settings.measurementSystem === 'metric' ? 'Metric' : 'Imperial'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Photo Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photos</Text>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() =>
            Alert.alert('Photo Quality', 'Select photo quality', [
              { text: 'Low (faster upload)', onPress: () => updateSettings({ photoQuality: 'low' }) },
              { text: 'Medium', onPress: () => updateSettings({ photoQuality: 'medium' }) },
              { text: 'High (better detail)', onPress: () => updateSettings({ photoQuality: 'high' }) },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Photo Quality</Text>
            <Text style={styles.settingDescription}>
              Quality vs upload size trade-off
            </Text>
          </View>
          <Text style={styles.settingValue}>
            {settings.photoQuality.charAt(0).toUpperCase() + settings.photoQuality.slice(1)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() =>
            Alert.alert('Max Photos', 'Maximum photos per tree', [
              { text: '5 photos', onPress: () => updateSettings({ maxPhotosPerTree: 5 }) },
              { text: '10 photos', onPress: () => updateSettings({ maxPhotosPerTree: 10 }) },
              { text: '20 photos', onPress: () => updateSettings({ maxPhotosPerTree: 20 }) },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Max Photos Per Tree</Text>
            <Text style={styles.settingDescription}>
              Limit photos to manage storage
            </Text>
          </View>
          <Text style={styles.settingValue}>{settings.maxPhotosPerTree}</Text>
        </TouchableOpacity>
      </View>

      {/* Display Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Dark Mode</Text>
            <Text style={styles.settingDescription}>
              Use dark color scheme
            </Text>
          </View>
          <Switch
            value={settings.darkMode}
            onValueChange={(value) => updateSettings({ darkMode: value })}
            trackColor={{ false: '#ddd', true: '#a5d6a7' }}
            thumbColor={settings.darkMode ? '#2e7d32' : '#f4f3f4'}
          />
        </View>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() =>
            Alert.alert('Font Size', 'Select text size', [
              { text: 'Small', onPress: () => updateSettings({ fontSize: 'small' }) },
              { text: 'Medium', onPress: () => updateSettings({ fontSize: 'medium' }) },
              { text: 'Large', onPress: () => updateSettings({ fontSize: 'large' }) },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Font Size</Text>
            <Text style={styles.settingDescription}>
              Text size throughout the app
            </Text>
          </View>
          <Text style={styles.settingValue}>
            {settings.fontSize.charAt(0).toUpperCase() + settings.fontSize.slice(1)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Data Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Management</Text>

        <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
          <Icon name="delete-forever" size={20} color="#f44336" />
          <Text style={styles.dangerButtonText}>Clear Local Data</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2e7d32',
    paddingHorizontal: 16,
    paddingVertical: 8,
    textTransform: 'uppercase',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  settingDescription: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  settingValue: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  dangerButtonText: {
    fontSize: 16,
    color: '#f44336',
    fontWeight: '600',
    marginLeft: 8,
  },
  footer: {
    height: 32,
  },
});
