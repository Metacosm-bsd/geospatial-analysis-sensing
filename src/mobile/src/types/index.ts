/**
 * Mobile App Type Definitions
 * Sprint 55-60: Field Data Collection
 */

// ============================================================================
// Sync Status Types
// ============================================================================

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

export interface SyncableEntity {
  id: string;
  localId: string;
  remoteId?: string;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// GPS & Location Types
// ============================================================================

export interface GPSLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy: number;
  timestamp: string;
}

export interface GPSConfig {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  distanceFilter: number;
}

// ============================================================================
// Project Types
// ============================================================================

export interface FieldProject extends SyncableEntity {
  name: string;
  description?: string;
  organizationId: string;
  boundaryGeoJSON?: GeoJSON.Polygon;
  targetTreeCount?: number;
  assignedCrewIds: string[];
  status: 'active' | 'completed' | 'archived';
  startDate: string;
  endDate?: string;
}

// ============================================================================
// Tree Measurement Types
// ============================================================================

export interface TreeMeasurement extends SyncableEntity {
  projectId: string;
  plotId?: string;
  treeNumber: number;

  // Location
  location: GPSLocation;
  locationNotes?: string;

  // Measurements
  dbh: number; // Diameter at breast height (cm)
  height?: number; // Total height (m)
  crownDiameter?: number; // Crown diameter (m)
  merchantableHeight?: number; // Height to first major branch (m)

  // Classification
  speciesCode?: string;
  speciesCommonName?: string;
  speciesScientificName?: string;

  // Health & Quality
  healthStatus: 'healthy' | 'declining' | 'dead' | 'unknown';
  crownClass: 'dominant' | 'codominant' | 'intermediate' | 'suppressed' | 'unknown';
  defects: TreeDefect[];

  // Photos
  photos: TreePhoto[];

  // Field Notes
  notes?: string;

  // Crew Info
  measuredBy: string;
  verifiedBy?: string;
}

export interface TreeDefect {
  type: 'rot' | 'damage' | 'fork' | 'lean' | 'broken_top' | 'fire_scar' | 'other';
  severity: 'minor' | 'moderate' | 'severe';
  notes?: string;
}

export interface TreePhoto {
  id: string;
  localUri: string;
  remoteUri?: string;
  type: 'trunk' | 'crown' | 'full' | 'defect' | 'tag' | 'other';
  timestamp: string;
  syncStatus: SyncStatus;
}

// ============================================================================
// Plot Types
// ============================================================================

export interface SamplePlot extends SyncableEntity {
  projectId: string;
  plotNumber: string;

  // Location
  centerPoint: GPSLocation;
  radius: number; // meters
  shape: 'circular' | 'rectangular';

  // For rectangular plots
  width?: number;
  length?: number;
  orientation?: number; // degrees from north

  // Plot Data
  slope?: number; // percent
  aspect?: number; // degrees
  elevation?: number; // meters

  // Stand Info
  standType?: string;
  ageClass?: string;
  siteIndex?: number;

  // Status
  status: 'not_started' | 'in_progress' | 'completed' | 'verified';
  measuredBy: string;
  startedAt?: string;
  completedAt?: string;

  notes?: string;
}

// ============================================================================
// Crew Types
// ============================================================================

export interface CrewMember {
  id: string;
  name: string;
  email: string;
  role: 'lead' | 'member';
  phone?: string;
  certifications?: string[];
  isActive: boolean;
}

export interface FieldCrew extends SyncableEntity {
  name: string;
  projectId: string;
  members: CrewMember[];
  leaderId: string;
  status: 'active' | 'inactive';
}

// ============================================================================
// Offline Queue Types
// ============================================================================

export interface QueuedOperation {
  id: string;
  entityType: 'tree' | 'plot' | 'photo' | 'project';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  errorMessage?: string;
  createdAt: string;
}

// ============================================================================
// Species Reference Types
// ============================================================================

export interface SpeciesReference {
  code: string;
  commonName: string;
  scientificName: string;
  genus: string;
  family: string;
  woodDensity?: number; // g/cm³
  carbonFraction?: number;
  isCommon: boolean;
}

// ============================================================================
// App Settings Types
// ============================================================================

export interface AppSettings {
  // Sync
  autoSync: boolean;
  syncOnWifiOnly: boolean;
  syncIntervalMinutes: number;

  // GPS
  gpsHighAccuracy: boolean;
  gpsTimeout: number;

  // Units
  measurementSystem: 'metric' | 'imperial';

  // Photos
  photoQuality: 'low' | 'medium' | 'high';
  maxPhotosPerTree: number;

  // UI
  darkMode: boolean;
  fontSize: 'small' | 'medium' | 'large';

  // Offline
  offlineMapsCached: boolean;
  speciesListCached: boolean;
}

// ============================================================================
// Navigation Types
// ============================================================================

export type RootStackParamList = {
  MainTabs: undefined;
  Login: undefined;
  ProjectDetail: { projectId: string };
  PlotDetail: { plotId: string };
  TreeMeasurement: { plotId?: string; treeId?: string };
  PhotoCapture: { treeId: string; photoType: TreePhoto['type'] };
  Map: { projectId?: string; plotId?: string };
  Settings: undefined;
  Sync: undefined;
};

export type MainTabParamList = {
  Projects: undefined;
  Trees: undefined;
  Map: undefined;
  Crew: undefined;
  Profile: undefined;
};
