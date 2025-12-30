/**
 * Tree Measurement Screen
 * Primary field data collection form
 * Sprint 55-60: Mobile Field App
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type {
  RootStackParamList,
  TreeMeasurement,
  TreeDefect,
  GPSLocation,
} from '../types';
import { useAppStore, useLocation } from '../store/appStore';
import {
  createTreeMeasurement,
  updateTreeMeasurement,
  getTreeMeasurement,
  getTreesByProject,
} from '../services/database';
import {
  getCurrentPosition,
  getHighAccuracyPosition,
  formatCoordinates,
} from '../services/location';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'TreeMeasurement'>;

const HEALTH_OPTIONS = ['healthy', 'declining', 'dead', 'unknown'] as const;
const CROWN_CLASS_OPTIONS = [
  'dominant',
  'codominant',
  'intermediate',
  'suppressed',
  'unknown',
] as const;
const DEFECT_TYPES = [
  'rot',
  'damage',
  'fork',
  'lean',
  'broken_top',
  'fire_scar',
  'other',
] as const;

export function TreeMeasurementScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { plotId, treeId } = route.params || {};

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const { currentLocation } = useLocation();
  const auth = useAppStore((state) => state.auth);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCapturingGPS, setIsCapturingGPS] = useState(false);

  // Form state
  const [treeNumber, setTreeNumber] = useState('');
  const [location, setLocation] = useState<GPSLocation | null>(null);
  const [locationNotes, setLocationNotes] = useState('');
  const [dbh, setDbh] = useState('');
  const [height, setHeight] = useState('');
  const [crownDiameter, setCrownDiameter] = useState('');
  const [merchantableHeight, setMerchantableHeight] = useState('');
  const [speciesCode, setSpeciesCode] = useState('');
  const [healthStatus, setHealthStatus] = useState<TreeMeasurement['healthStatus']>('unknown');
  const [crownClass, setCrownClass] = useState<TreeMeasurement['crownClass']>('unknown');
  const [defects, setDefects] = useState<TreeDefect[]>([]);
  const [notes, setNotes] = useState('');

  // Load existing tree if editing
  useEffect(() => {
    if (treeId) {
      loadTree();
    } else {
      // Auto-generate tree number for new trees
      generateTreeNumber();
    }
  }, [treeId]);

  const loadTree = async () => {
    if (!treeId) return;

    setIsLoading(true);
    try {
      const tree = await getTreeMeasurement(treeId);
      if (tree) {
        setTreeNumber(String(tree.treeNumber));
        setLocation(tree.location);
        setLocationNotes(tree.locationNotes || '');
        setDbh(String(tree.dbh));
        setHeight(tree.height ? String(tree.height) : '');
        setCrownDiameter(tree.crownDiameter ? String(tree.crownDiameter) : '');
        setMerchantableHeight(tree.merchantableHeight ? String(tree.merchantableHeight) : '');
        setSpeciesCode(tree.speciesCode || '');
        setHealthStatus(tree.healthStatus);
        setCrownClass(tree.crownClass);
        setDefects(tree.defects);
        setNotes(tree.notes || '');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load tree data');
    } finally {
      setIsLoading(false);
    }
  };

  const generateTreeNumber = async () => {
    if (!activeProjectId) return;

    try {
      const trees = await getTreesByProject(activeProjectId);
      const maxNumber = trees.reduce(
        (max, t) => Math.max(max, t.treeNumber),
        0
      );
      setTreeNumber(String(maxNumber + 1));
    } catch (error) {
      setTreeNumber('1');
    }
  };

  const handleCaptureGPS = useCallback(async () => {
    setIsCapturingGPS(true);

    try {
      // First get quick position
      const quickPosition = await getCurrentPosition();
      setLocation(quickPosition);

      // Then try to get high-accuracy position
      Alert.alert(
        'Capturing Position',
        'Hold device steady for best accuracy...',
        [{ text: 'OK' }]
      );

      const accuratePosition = await getHighAccuracyPosition(3, 10, 30000);
      setLocation(accuratePosition);

      Alert.alert(
        'Position Captured',
        `Accuracy: ${accuratePosition.accuracy.toFixed(1)}m`
      );
    } catch (error) {
      Alert.alert('GPS Error', 'Failed to capture position. Please try again.');
    } finally {
      setIsCapturingGPS(false);
    }
  }, []);

  const handleAddDefect = useCallback(() => {
    Alert.alert('Add Defect', 'Select defect type', [
      ...DEFECT_TYPES.map((type) => ({
        text: type.replace('_', ' '),
        onPress: () => {
          setDefects([...defects, { type, severity: 'moderate' }]);
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [defects]);

  const handleRemoveDefect = useCallback(
    (index: number) => {
      setDefects(defects.filter((_, i) => i !== index));
    },
    [defects]
  );

  const handleSave = useCallback(async () => {
    // Validation
    if (!activeProjectId) {
      Alert.alert('Error', 'No active project selected');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Please capture GPS position');
      return;
    }

    const dbhValue = parseFloat(dbh);
    if (isNaN(dbhValue) || dbhValue <= 0) {
      Alert.alert('Error', 'Please enter a valid DBH measurement');
      return;
    }

    const treeNum = parseInt(treeNumber, 10);
    if (isNaN(treeNum) || treeNum <= 0) {
      Alert.alert('Error', 'Please enter a valid tree number');
      return;
    }

    setIsSaving(true);

    try {
      const treeData = {
        projectId: activeProjectId,
        plotId,
        treeNumber: treeNum,
        location,
        locationNotes: locationNotes || undefined,
        dbh: dbhValue,
        height: height ? parseFloat(height) : undefined,
        crownDiameter: crownDiameter ? parseFloat(crownDiameter) : undefined,
        merchantableHeight: merchantableHeight ? parseFloat(merchantableHeight) : undefined,
        speciesCode: speciesCode || undefined,
        speciesCommonName: undefined,
        speciesScientificName: undefined,
        healthStatus,
        crownClass,
        defects,
        photos: [],
        notes: notes || undefined,
        measuredBy: auth.userId || 'unknown',
      };

      if (treeId) {
        await updateTreeMeasurement(treeId, treeData);
        Alert.alert('Success', 'Tree measurement updated');
      } else {
        const newTree = await createTreeMeasurement(treeData);
        Alert.alert('Success', 'Tree measurement saved', [
          {
            text: 'Add Photo',
            onPress: () =>
              navigation.navigate('PhotoCapture', {
                treeId: newTree.id,
                photoType: 'trunk',
              }),
          },
          {
            text: 'Add Another Tree',
            onPress: () => {
              // Reset form for new tree
              setLocation(null);
              setDbh('');
              setHeight('');
              setCrownDiameter('');
              setMerchantableHeight('');
              setSpeciesCode('');
              setHealthStatus('unknown');
              setCrownClass('unknown');
              setDefects([]);
              setNotes('');
              generateTreeNumber();
            },
          },
          { text: 'Done', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save tree measurement');
    } finally {
      setIsSaving(false);
    }
  }, [
    activeProjectId,
    plotId,
    treeId,
    treeNumber,
    location,
    locationNotes,
    dbh,
    height,
    crownDiameter,
    merchantableHeight,
    speciesCode,
    healthStatus,
    crownClass,
    defects,
    notes,
    auth.userId,
    navigation,
  ]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Tree Number */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tree Identification</Text>
          <View style={styles.inputRow}>
            <Text style={styles.label}>Tree #</Text>
            <TextInput
              style={[styles.input, styles.shortInput]}
              value={treeNumber}
              onChangeText={setTreeNumber}
              keyboardType="number-pad"
              placeholder="1"
            />
          </View>
        </View>

        {/* GPS Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <TouchableOpacity
            style={[styles.gpsButton, location && styles.gpsButtonCaptured]}
            onPress={handleCaptureGPS}
            disabled={isCapturingGPS}
          >
            {isCapturingGPS ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon
                  name={location ? 'gps-fixed' : 'gps-not-fixed'}
                  size={24}
                  color="#fff"
                />
                <Text style={styles.gpsButtonText}>
                  {location ? 'Recapture GPS' : 'Capture GPS Position'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {location && (
            <View style={styles.locationInfo}>
              <Text style={styles.locationText}>
                {formatCoordinates(location.latitude, location.longitude)}
              </Text>
              <Text style={styles.accuracyText}>
                Accuracy: {location.accuracy.toFixed(1)}m
                {location.altitude && ` | Elev: ${location.altitude.toFixed(0)}m`}
              </Text>
            </View>
          )}

          <TextInput
            style={[styles.input, styles.textArea]}
            value={locationNotes}
            onChangeText={setLocationNotes}
            placeholder="Location notes (e.g., 5m from trail marker)"
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Measurements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Measurements</Text>

          <View style={styles.inputRow}>
            <Text style={styles.label}>DBH (cm)*</Text>
            <TextInput
              style={[styles.input, styles.shortInput]}
              value={dbh}
              onChangeText={setDbh}
              keyboardType="decimal-pad"
              placeholder="0.0"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>Height (m)</Text>
            <TextInput
              style={[styles.input, styles.shortInput]}
              value={height}
              onChangeText={setHeight}
              keyboardType="decimal-pad"
              placeholder="0.0"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>Crown Dia. (m)</Text>
            <TextInput
              style={[styles.input, styles.shortInput]}
              value={crownDiameter}
              onChangeText={setCrownDiameter}
              keyboardType="decimal-pad"
              placeholder="0.0"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>Merch. Height (m)</Text>
            <TextInput
              style={[styles.input, styles.shortInput]}
              value={merchantableHeight}
              onChangeText={setMerchantableHeight}
              keyboardType="decimal-pad"
              placeholder="0.0"
            />
          </View>
        </View>

        {/* Species */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Species</Text>
          <TextInput
            style={styles.input}
            value={speciesCode}
            onChangeText={setSpeciesCode}
            placeholder="Species code (e.g., PSME, ABGR)"
            autoCapitalize="characters"
          />
        </View>

        {/* Health & Crown Class */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Condition</Text>

          <Text style={styles.label}>Health Status</Text>
          <View style={styles.optionRow}>
            {HEALTH_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  healthStatus === option && styles.optionButtonSelected,
                ]}
                onPress={() => setHealthStatus(option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    healthStatus === option && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Crown Class</Text>
          <View style={styles.optionRow}>
            {CROWN_CLASS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  crownClass === option && styles.optionButtonSelected,
                ]}
                onPress={() => setCrownClass(option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    crownClass === option && styles.optionTextSelected,
                  ]}
                >
                  {option.slice(0, 4)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Defects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Defects</Text>
            <TouchableOpacity onPress={handleAddDefect}>
              <Icon name="add-circle" size={24} color="#2e7d32" />
            </TouchableOpacity>
          </View>

          {defects.length === 0 ? (
            <Text style={styles.emptyText}>No defects recorded</Text>
          ) : (
            defects.map((defect, index) => (
              <View key={index} style={styles.defectItem}>
                <Text style={styles.defectText}>
                  {defect.type.replace('_', ' ')} ({defect.severity})
                </Text>
                <TouchableOpacity onPress={() => handleRemoveDefect(index)}>
                  <Icon name="close" size={20} color="#f44336" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional observations..."
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="save" size={24} color="#fff" />
              <Text style={styles.saveButtonText}>
                {treeId ? 'Update Tree' : 'Save Tree'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#333',
  },
  shortInput: {
    width: 100,
    textAlign: 'right',
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff9800',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  gpsButtonCaptured: {
    backgroundColor: '#4caf50',
  },
  gpsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  locationInfo: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2e7d32',
  },
  accuracyText: {
    fontSize: 12,
    color: '#4caf50',
    marginTop: 4,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  optionButtonSelected: {
    backgroundColor: '#2e7d32',
    borderColor: '#2e7d32',
  },
  optionText: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  optionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  defectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    marginBottom: 8,
  },
  defectText: {
    fontSize: 14,
    color: '#e65100',
    textTransform: 'capitalize',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2e7d32',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#a5d6a7',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});
