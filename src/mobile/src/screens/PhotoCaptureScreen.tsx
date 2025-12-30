/**
 * Photo Capture Screen
 * Camera interface for tree photos
 * Sprint 55-60: Mobile Field App
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { RNCamera } from 'react-native-camera';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import RNFS from 'react-native-fs';
import uuid from 'react-native-uuid';

import type { RootStackParamList, TreePhoto } from '../types';
import { getDatabase } from '../services/database';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'PhotoCapture'>;

const PHOTO_TYPES: TreePhoto['type'][] = ['trunk', 'crown', 'full', 'defect', 'tag', 'other'];

export function PhotoCaptureScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { treeId, photoType: initialType } = route.params;

  const cameraRef = useRef<RNCamera>(null);
  const [photoType, setPhotoType] = useState<TreePhoto['type']>(initialType);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('auto');

  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current || isTakingPhoto) return;

    setIsTakingPhoto(true);

    try {
      const options = {
        quality: 0.8,
        base64: false,
        exif: true,
        pauseAfterCapture: true,
      };

      const data = await cameraRef.current.takePictureAsync(options);
      setCapturedPhoto(data.uri);
    } catch (error) {
      Alert.alert('Error', 'Failed to capture photo');
    } finally {
      setIsTakingPhoto(false);
    }
  }, [isTakingPhoto]);

  const handleRetake = useCallback(() => {
    setCapturedPhoto(null);
    cameraRef.current?.resumePreview();
  }, []);

  const handleSave = useCallback(async () => {
    if (!capturedPhoto) return;

    setIsSaving(true);

    try {
      const photoId = uuid.v4() as string;
      const fileName = `tree_${treeId}_${photoType}_${Date.now()}.jpg`;
      const destPath = `${RNFS.DocumentDirectoryPath}/photos/${fileName}`;

      // Ensure photos directory exists
      await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/photos`);

      // Copy photo to app storage
      await RNFS.copyFile(capturedPhoto, destPath);

      // Save to database
      const db = getDatabase();
      await db.executeSql(
        `INSERT INTO tree_photos (id, tree_id, local_uri, type, timestamp, sync_status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [photoId, treeId, destPath, photoType, new Date().toISOString()]
      );

      Alert.alert('Photo Saved', 'Photo has been saved and will sync when online.', [
        {
          text: 'Take Another',
          onPress: () => {
            setCapturedPhoto(null);
            cameraRef.current?.resumePreview();
          },
        },
        {
          text: 'Done',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Failed to save photo:', error);
      Alert.alert('Error', 'Failed to save photo');
    } finally {
      setIsSaving(false);
    }
  }, [capturedPhoto, treeId, photoType, navigation]);

  const toggleFlash = useCallback(() => {
    const modes: ('off' | 'on' | 'auto')[] = ['off', 'on', 'auto'];
    const currentIndex = modes.indexOf(flashMode);
    setFlashMode(modes[(currentIndex + 1) % modes.length]);
  }, [flashMode]);

  const getFlashIcon = () => {
    switch (flashMode) {
      case 'off':
        return 'flash-off';
      case 'on':
        return 'flash-on';
      case 'auto':
        return 'flash-auto';
    }
  };

  return (
    <View style={styles.container}>
      {capturedPhoto ? (
        // Preview captured photo
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedPhoto }} style={styles.preview} />

          <View style={styles.previewOverlay}>
            <View style={styles.photoTypeSelector}>
              <Text style={styles.selectorLabel}>Photo Type:</Text>
              <View style={styles.typeButtons}>
                {PHOTO_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      photoType === type && styles.typeButtonSelected,
                    ]}
                    onPress={() => setPhotoType(type)}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        photoType === type && styles.typeButtonTextSelected,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleRetake}
              >
                <Icon name="refresh" size={24} color="#fff" />
                <Text style={styles.actionButtonText}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Icon name="check" size={24} color="#fff" />
                    <Text style={styles.actionButtonText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        // Camera view
        <View style={styles.cameraContainer}>
          <RNCamera
            ref={cameraRef}
            style={styles.camera}
            type={RNCamera.Constants.Type.back}
            flashMode={RNCamera.Constants.FlashMode[flashMode]}
            captureAudio={false}
            androidCameraPermissionOptions={{
              title: 'Camera Permission',
              message: 'LiDAR Forest needs camera access to capture tree photos',
              buttonPositive: 'OK',
              buttonNegative: 'Cancel',
            }}
          >
            {/* Camera overlay */}
            <View style={styles.cameraOverlay}>
              {/* Top controls */}
              <View style={styles.topControls}>
                <TouchableOpacity
                  style={styles.topButton}
                  onPress={() => navigation.goBack()}
                >
                  <Icon name="close" size={28} color="#fff" />
                </TouchableOpacity>

                <Text style={styles.typeLabel}>{photoType.toUpperCase()}</Text>

                <TouchableOpacity style={styles.topButton} onPress={toggleFlash}>
                  <Icon name={getFlashIcon()} size={28} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Photo type selector */}
              <View style={styles.photoTypeBar}>
                {PHOTO_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChip,
                      photoType === type && styles.typeChipSelected,
                    ]}
                    onPress={() => setPhotoType(type)}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        photoType === type && styles.typeChipTextSelected,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Capture button */}
              <View style={styles.captureContainer}>
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={handleTakePhoto}
                  disabled={isTakingPhoto}
                >
                  {isTakingPhoto ? (
                    <ActivityIndicator color="#2e7d32" size="large" />
                  ) : (
                    <View style={styles.captureButtonInner} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Tips */}
              <View style={styles.tipContainer}>
                <Text style={styles.tipText}>{getTip(photoType)}</Text>
              </View>
            </View>
          </RNCamera>
        </View>
      )}
    </View>
  );
}

function getTip(photoType: TreePhoto['type']): string {
  switch (photoType) {
    case 'trunk':
      return 'Capture the trunk at breast height (1.3m) showing DBH tape';
    case 'crown':
      return 'Capture the full crown from below or from a distance';
    case 'full':
      return 'Capture the entire tree from a distance showing form';
    case 'defect':
      return 'Capture the defect clearly with reference scale if possible';
    case 'tag':
      return 'Capture the tree tag number clearly visible';
    default:
      return 'Capture additional photos as needed';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  topButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  photoTypeBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  typeChipSelected: {
    backgroundColor: '#2e7d32',
  },
  typeChipText: {
    color: '#fff',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  typeChipTextSelected: {
    fontWeight: '600',
  },
  captureContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#2e7d32',
  },
  tipContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  tipText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 12,
    borderRadius: 8,
  },
  previewContainer: {
    flex: 1,
  },
  preview: {
    flex: 1,
    resizeMode: 'contain',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 16,
    paddingBottom: 32,
  },
  photoTypeSelector: {
    marginBottom: 16,
  },
  selectorLabel: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  typeButtonSelected: {
    backgroundColor: '#2e7d32',
  },
  typeButtonText: {
    color: '#fff',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  typeButtonTextSelected: {
    fontWeight: '600',
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButton: {
    backgroundColor: '#2e7d32',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
