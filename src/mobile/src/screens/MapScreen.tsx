/**
 * Map Screen
 * Field navigation with tree locations
 * Sprint 55-60: Mobile Field App
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Circle, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList, TreeMeasurement, SamplePlot, GPSLocation } from '../types';
import { useAppStore, useLocation } from '../store/appStore';
import { getTreesByProject, getPlotsByProject } from '../services/database';
import {
  getCurrentPosition,
  startLocationTracking,
  stopLocationTracking,
  calculateDistance,
  calculateBearing,
} from '../services/location';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export function MapScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const mapRef = useRef<MapView>(null);

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const { currentLocation, isTracking } = useLocation();
  const setCurrentLocation = useAppStore((state) => state.setCurrentLocation);

  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [selectedTree, setSelectedTree] = useState<TreeMeasurement | null>(null);
  const [showTrees, setShowTrees] = useState(true);
  const [showPlots, setShowPlots] = useState(true);
  const [trackingPath, setTrackingPath] = useState<GPSLocation[]>([]);

  // Fetch trees
  const { data: trees } = useQuery({
    queryKey: ['trees', activeProjectId],
    queryFn: () => (activeProjectId ? getTreesByProject(activeProjectId) : Promise.resolve([])),
    enabled: !!activeProjectId,
  });

  // Fetch plots
  const { data: plots } = useQuery({
    queryKey: ['plots', activeProjectId],
    queryFn: () => (activeProjectId ? getPlotsByProject(activeProjectId) : Promise.resolve([])),
    enabled: !!activeProjectId,
  });

  // Handle location tracking
  const handleToggleTracking = useCallback(() => {
    if (isTracking) {
      stopLocationTracking();
      setTrackingPath([]);
    } else {
      setTrackingPath([]);
      startLocationTracking(
        (location) => {
          setTrackingPath((prev) => [...prev, location]);
        },
        (error) => {
          Alert.alert('GPS Error', error);
        }
      );
    }
  }, [isTracking]);

  // Center on current location
  const handleCenterOnLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      const location = await getCurrentPosition();
      mapRef.current?.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
    } catch (error) {
      Alert.alert('GPS Error', 'Unable to get current location');
    } finally {
      setIsLoadingLocation(false);
    }
  }, []);

  // Handle tree marker press
  const handleTreePress = useCallback((tree: TreeMeasurement) => {
    setSelectedTree(tree);
  }, []);

  // Navigate to selected tree
  const handleNavigateToTree = useCallback(() => {
    if (!selectedTree || !currentLocation) return;

    const distance = calculateDistance(currentLocation, selectedTree.location);
    const bearing = calculateBearing(currentLocation, selectedTree.location);

    Alert.alert(
      'Navigation',
      `Tree #${selectedTree.treeNumber}\n` +
        `Distance: ${distance.toFixed(1)}m\n` +
        `Bearing: ${bearing.toFixed(0)}° from North`,
      [
        { text: 'Edit Tree', onPress: () => navigation.navigate('TreeMeasurement', { treeId: selectedTree.id }) },
        { text: 'Close', style: 'cancel' },
      ]
    );
  }, [selectedTree, currentLocation, navigation]);

  // Add new tree at current location
  const handleAddTreeAtLocation = useCallback(() => {
    navigation.navigate('TreeMeasurement', {});
  }, [navigation]);

  // Calculate initial region from data
  const getInitialRegion = useCallback((): Region => {
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    if (trees && trees.length > 0) {
      const lats = trees.map((t) => t.location.latitude);
      const lons = trees.map((t) => t.location.longitude);
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
      const latDelta = Math.max(Math.max(...lats) - Math.min(...lats), 0.01) * 1.2;
      const lonDelta = Math.max(Math.max(...lons) - Math.min(...lons), 0.01) * 1.2;

      return {
        latitude: centerLat,
        longitude: centerLon,
        latitudeDelta: latDelta,
        longitudeDelta: lonDelta,
      };
    }

    // Default to US center
    return {
      latitude: 39.8283,
      longitude: -98.5795,
      latitudeDelta: 30,
      longitudeDelta: 30,
    };
  }, [currentLocation, trees]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={getInitialRegion()}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        showsScale
      >
        {/* Plot circles */}
        {showPlots &&
          plots?.map((plot) => (
            <React.Fragment key={plot.id}>
              <Circle
                center={{
                  latitude: plot.centerPoint.latitude,
                  longitude: plot.centerPoint.longitude,
                }}
                radius={plot.radius}
                fillColor="rgba(46, 125, 50, 0.1)"
                strokeColor="#2e7d32"
                strokeWidth={2}
              />
              <Marker
                coordinate={{
                  latitude: plot.centerPoint.latitude,
                  longitude: plot.centerPoint.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.plotMarker}>
                  <Text style={styles.plotMarkerText}>{plot.plotNumber}</Text>
                </View>
              </Marker>
            </React.Fragment>
          ))}

        {/* Tree markers */}
        {showTrees &&
          trees?.map((tree) => (
            <Marker
              key={tree.id}
              coordinate={{
                latitude: tree.location.latitude,
                longitude: tree.location.longitude,
              }}
              onPress={() => handleTreePress(tree)}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={[styles.treeMarker, selectedTree?.id === tree.id && styles.treeMarkerSelected]}>
                <Icon name="park" size={20} color={getTreeColor(tree.healthStatus)} />
              </View>
            </Marker>
          ))}

        {/* Tracking path */}
        {trackingPath.length > 1 && (
          <Polyline
            coordinates={trackingPath.map((p) => ({
              latitude: p.latitude,
              longitude: p.longitude,
            }))}
            strokeColor="#2196f3"
            strokeWidth={3}
          />
        )}
      </MapView>

      {/* Map Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, isTracking && styles.controlButtonActive]}
          onPress={handleToggleTracking}
        >
          <Icon name="timeline" size={24} color={isTracking ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, showTrees && styles.controlButtonActive]}
          onPress={() => setShowTrees(!showTrees)}
        >
          <Icon name="park" size={24} color={showTrees ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, showPlots && styles.controlButtonActive]}
          onPress={() => setShowPlots(!showPlots)}
        >
          <Icon name="crop-free" size={24} color={showPlots ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton} onPress={handleCenterOnLocation}>
          {isLoadingLocation ? (
            <ActivityIndicator color="#333" />
          ) : (
            <Icon name="my-location" size={24} color="#333" />
          )}
        </TouchableOpacity>
      </View>

      {/* Selected Tree Info */}
      {selectedTree && (
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Text style={styles.infoTitle}>Tree #{selectedTree.treeNumber}</Text>
            <TouchableOpacity onPress={() => setSelectedTree(null)}>
              <Icon name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoText}>
              Species: {selectedTree.speciesCode || 'Unknown'}
            </Text>
            <Text style={styles.infoText}>DBH: {selectedTree.dbh} cm</Text>
            {selectedTree.height && (
              <Text style={styles.infoText}>Height: {selectedTree.height} m</Text>
            )}
            <Text style={styles.infoText}>Health: {selectedTree.healthStatus}</Text>
            {currentLocation && (
              <Text style={styles.infoText}>
                Distance: {calculateDistance(currentLocation, selectedTree.location).toFixed(1)} m
              </Text>
            )}
          </View>
          <TouchableOpacity style={styles.navigateButton} onPress={handleNavigateToTree}>
            <Icon name="navigation" size={20} color="#fff" />
            <Text style={styles.navigateButtonText}>Navigate</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Tree FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleAddTreeAtLocation}>
        <Icon name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function getTreeColor(healthStatus: string): string {
  switch (healthStatus) {
    case 'healthy':
      return '#4caf50';
    case 'declining':
      return '#ff9800';
    case 'dead':
      return '#795548';
    default:
      return '#9e9e9e';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    top: 16,
    right: 16,
    gap: 8,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  controlButtonActive: {
    backgroundColor: '#2e7d32',
  },
  treeMarker: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 4,
    borderWidth: 2,
    borderColor: '#2e7d32',
  },
  treeMarkerSelected: {
    borderColor: '#ff9800',
    borderWidth: 3,
  },
  plotMarker: {
    backgroundColor: '#2e7d32',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  plotMarkerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  infoContent: {
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196f3',
    borderRadius: 8,
    padding: 12,
  },
  navigateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
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
});
