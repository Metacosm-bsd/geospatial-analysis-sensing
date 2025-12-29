/**
 * Species Classification Types - Sprint 13-14
 * Type definitions for species classification API
 */

// ============================================================================
// Species Information Types
// ============================================================================

/**
 * Detailed information about a tree species
 */
export interface SpeciesInfo {
  /** Species code (e.g., 'PSME' for Douglas-fir) */
  code: string;
  /** Scientific name (e.g., 'Pseudotsuga menziesii') */
  name: string;
  /** Common name (e.g., 'Douglas-fir') */
  commonName: string;
  /** Taxonomic family (e.g., 'Pinaceae') */
  family?: string;
}

/**
 * Prediction result for a single tree
 */
export interface SpeciesPrediction {
  /** Unique tree identifier */
  treeId: string;
  /** Predicted species code */
  speciesCode: string;
  /** Scientific name of predicted species */
  speciesName: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Probability distribution across all candidate species */
  probabilities: Record<string, number>;
}

// ============================================================================
// Request and Response Types
// ============================================================================

/**
 * Request to classify species for an analysis
 */
export interface ClassifySpeciesRequest {
  /** Analysis ID containing tree detections */
  analysisId: string;
  /** Geographic region for species candidates */
  region: string;
  /** Classification options */
  options?: ClassifySpeciesOptions;
}

/**
 * Options for species classification
 */
export interface ClassifySpeciesOptions {
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  /** Include predictions below confidence threshold */
  includeUncertain?: boolean;
  /** Use ensemble model for higher accuracy */
  useEnsemble?: boolean;
}

/**
 * Response from species classification
 */
export interface ClassifySpeciesResponse {
  /** Analysis ID that was classified */
  analysisId: string;
  /** Total number of trees in analysis */
  totalTrees: number;
  /** Number of trees with confident classifications */
  classifiedTrees: number;
  /** Count of trees per species */
  speciesBreakdown: Record<string, number>;
  /** Individual tree predictions */
  predictions: SpeciesPrediction[];
}

/**
 * Response from starting classification job
 */
export interface StartClassificationResponse {
  /** Job ID for tracking progress */
  jobId: string;
  /** Analysis ID being classified */
  analysisId: string;
  /** Current status */
  status: 'queued' | 'processing';
  /** Estimated time in seconds */
  estimatedTime?: number;
}

// ============================================================================
// Region Types
// ============================================================================

/**
 * Supported geographic regions for species classification
 */
export type SupportedRegion = 'pnw' | 'southeast' | 'northeast' | 'rocky_mountain';

/**
 * Region metadata with supported species
 */
export interface RegionInfo {
  /** Region code */
  code: SupportedRegion;
  /** Display name */
  name: string;
  /** Description of the region */
  description: string;
  /** List of species common in this region */
  species: SpeciesInfo[];
}

// ============================================================================
// Tree Update Types
// ============================================================================

/**
 * Request to manually update tree species
 */
export interface UpdateTreeSpeciesRequest {
  /** New species code */
  speciesCode: string;
  /** New species name */
  speciesName?: string;
  /** Mark as manually verified */
  verified?: boolean;
}

/**
 * Response from tree species update
 */
export interface UpdateTreeSpeciesResponse {
  /** Updated tree ID */
  treeId: string;
  /** New species code */
  speciesCode: string;
  /** New species name */
  speciesName: string;
  /** Whether manually verified */
  verified: boolean;
  /** Timestamp of update */
  updatedAt: string;
}

// ============================================================================
// Job Queue Types
// ============================================================================

/**
 * Data payload for species classification job
 */
export interface SpeciesClassificationJobData {
  /** Analysis ID to classify */
  analysisId: string;
  /** Project ID for access control */
  projectId: string;
  /** User ID who requested classification */
  userId: string;
  /** Geographic region */
  region: SupportedRegion;
  /** Classification options */
  options: ClassifySpeciesOptions;
}

/**
 * Result from species classification job
 */
export interface SpeciesClassificationResult {
  /** Whether classification succeeded */
  success: boolean;
  /** Analysis ID */
  analysisId: string;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Total trees processed */
  totalTrees?: number;
  /** Number successfully classified */
  classifiedTrees?: number;
  /** Species breakdown */
  speciesBreakdown?: Record<string, number>;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Python Service Communication Types
// ============================================================================

/**
 * Request to Python species classification service
 */
export interface PythonClassifyRequest {
  /** Analysis ID */
  analysisId: string;
  /** Tree data for classification */
  trees: PythonTreeInput[];
  /** Geographic region */
  region: SupportedRegion;
  /** Classification options */
  options: ClassifySpeciesOptions;
  /** Storage configuration */
  storageConfig: {
    type: 'local' | 's3';
    localPath?: string;
    s3Bucket?: string;
    s3Region?: string;
  };
}

/**
 * Tree input data for Python classifier
 */
export interface PythonTreeInput {
  /** Tree ID */
  id: string;
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
  /** Z coordinate (elevation) */
  z: number;
  /** Tree height in meters */
  height: number;
  /** Crown diameter in meters */
  crownDiameter: number;
  /** Diameter at breast height (if available) */
  dbh?: number;
  /** Spectral features (if available) */
  spectral?: Record<string, number>;
}

/**
 * Response from Python classification service
 */
export interface PythonClassifyResponse {
  /** Whether classification succeeded */
  success: boolean;
  /** Individual tree predictions */
  predictions: SpeciesPrediction[];
  /** Model version used */
  modelVersion?: string;
  /** Processing statistics */
  stats?: {
    totalProcessed: number;
    classifiedCount: number;
    avgConfidence: number;
    processingTimeMs: number;
  };
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Database Model Types
// ============================================================================

/**
 * Tree detection with species classification
 * Mirrors the Prisma TreeDetection model
 */
export interface TreeDetectionModel {
  id: string;
  analysisId: string;
  x: number;
  y: number;
  z: number;
  height: number;
  crownDiameter: number;
  dbh: number | null;
  speciesCode: string | null;
  speciesName: string | null;
  speciesConfidence: number | null;
  biomass: number | null;
  carbon: number | null;
  createdAt: Date;
}

// ============================================================================
// Species Database (Static Data)
// ============================================================================

/**
 * Pacific Northwest species database
 */
export const PNW_SPECIES: SpeciesInfo[] = [
  { code: 'PSME', name: 'Pseudotsuga menziesii', commonName: 'Douglas-fir', family: 'Pinaceae' },
  { code: 'TSHE', name: 'Tsuga heterophylla', commonName: 'Western hemlock', family: 'Pinaceae' },
  { code: 'THPL', name: 'Thuja plicata', commonName: 'Western redcedar', family: 'Cupressaceae' },
  { code: 'PISI', name: 'Picea sitchensis', commonName: 'Sitka spruce', family: 'Pinaceae' },
  { code: 'ABGR', name: 'Abies grandis', commonName: 'Grand fir', family: 'Pinaceae' },
  { code: 'ABAM', name: 'Abies amabilis', commonName: 'Pacific silver fir', family: 'Pinaceae' },
  { code: 'ACMA', name: 'Acer macrophyllum', commonName: 'Bigleaf maple', family: 'Sapindaceae' },
  { code: 'ALRU', name: 'Alnus rubra', commonName: 'Red alder', family: 'Betulaceae' },
  { code: 'PICO', name: 'Pinus contorta', commonName: 'Lodgepole pine', family: 'Pinaceae' },
  { code: 'PIPO', name: 'Pinus ponderosa', commonName: 'Ponderosa pine', family: 'Pinaceae' },
];

/**
 * Southeast US species database
 */
export const SOUTHEAST_SPECIES: SpeciesInfo[] = [
  { code: 'PITA', name: 'Pinus taeda', commonName: 'Loblolly pine', family: 'Pinaceae' },
  { code: 'PIPA', name: 'Pinus palustris', commonName: 'Longleaf pine', family: 'Pinaceae' },
  { code: 'PIEC', name: 'Pinus echinata', commonName: 'Shortleaf pine', family: 'Pinaceae' },
  { code: 'PIEL', name: 'Pinus elliottii', commonName: 'Slash pine', family: 'Pinaceae' },
  { code: 'QUST', name: 'Quercus stellata', commonName: 'Post oak', family: 'Fagaceae' },
  { code: 'QUFA', name: 'Quercus falcata', commonName: 'Southern red oak', family: 'Fagaceae' },
  { code: 'QUAL', name: 'Quercus alba', commonName: 'White oak', family: 'Fagaceae' },
  { code: 'LITU', name: 'Liriodendron tulipifera', commonName: 'Yellow-poplar', family: 'Magnoliaceae' },
  { code: 'NYSY', name: 'Nyssa sylvatica', commonName: 'Blackgum', family: 'Nyssaceae' },
  { code: 'TADI', name: 'Taxodium distichum', commonName: 'Bald cypress', family: 'Cupressaceae' },
];

/**
 * Northeast US species database
 */
export const NORTHEAST_SPECIES: SpeciesInfo[] = [
  { code: 'ACSA', name: 'Acer saccharum', commonName: 'Sugar maple', family: 'Sapindaceae' },
  { code: 'ACRU', name: 'Acer rubrum', commonName: 'Red maple', family: 'Sapindaceae' },
  { code: 'QUAL', name: 'Quercus alba', commonName: 'White oak', family: 'Fagaceae' },
  { code: 'QURU', name: 'Quercus rubra', commonName: 'Northern red oak', family: 'Fagaceae' },
  { code: 'FAGR', name: 'Fagus grandifolia', commonName: 'American beech', family: 'Fagaceae' },
  { code: 'TSCA', name: 'Tsuga canadensis', commonName: 'Eastern hemlock', family: 'Pinaceae' },
  { code: 'PIST', name: 'Pinus strobus', commonName: 'Eastern white pine', family: 'Pinaceae' },
  { code: 'BEAL', name: 'Betula alleghaniensis', commonName: 'Yellow birch', family: 'Betulaceae' },
  { code: 'BEPA', name: 'Betula papyrifera', commonName: 'Paper birch', family: 'Betulaceae' },
  { code: 'FRAM', name: 'Fraxinus americana', commonName: 'White ash', family: 'Oleaceae' },
];

/**
 * Rocky Mountain species database
 */
export const ROCKY_MOUNTAIN_SPECIES: SpeciesInfo[] = [
  { code: 'PIPO', name: 'Pinus ponderosa', commonName: 'Ponderosa pine', family: 'Pinaceae' },
  { code: 'PICO', name: 'Pinus contorta', commonName: 'Lodgepole pine', family: 'Pinaceae' },
  { code: 'PSME', name: 'Pseudotsuga menziesii', commonName: 'Douglas-fir', family: 'Pinaceae' },
  { code: 'ABLA', name: 'Abies lasiocarpa', commonName: 'Subalpine fir', family: 'Pinaceae' },
  { code: 'PIEN', name: 'Picea engelmannii', commonName: 'Engelmann spruce', family: 'Pinaceae' },
  { code: 'PIFL', name: 'Pinus flexilis', commonName: 'Limber pine', family: 'Pinaceae' },
  { code: 'POTR', name: 'Populus tremuloides', commonName: 'Quaking aspen', family: 'Salicaceae' },
  { code: 'JUSC', name: 'Juniperus scopulorum', commonName: 'Rocky Mountain juniper', family: 'Cupressaceae' },
  { code: 'ABCO', name: 'Abies concolor', commonName: 'White fir', family: 'Pinaceae' },
  { code: 'PIAR', name: 'Pinus aristata', commonName: 'Bristlecone pine', family: 'Pinaceae' },
];

/**
 * Get species list for a region
 */
export function getRegionSpecies(region: SupportedRegion): SpeciesInfo[] {
  const regionMap: Record<SupportedRegion, SpeciesInfo[]> = {
    pnw: PNW_SPECIES,
    southeast: SOUTHEAST_SPECIES,
    northeast: NORTHEAST_SPECIES,
    rocky_mountain: ROCKY_MOUNTAIN_SPECIES,
  };
  return regionMap[region] || [];
}

/**
 * All supported regions with metadata
 */
export const SUPPORTED_REGIONS: RegionInfo[] = [
  {
    code: 'pnw',
    name: 'Pacific Northwest',
    description: 'Western Washington, Oregon, and coastal British Columbia',
    species: PNW_SPECIES,
  },
  {
    code: 'southeast',
    name: 'Southeast United States',
    description: 'Southeastern states from Virginia to Texas',
    species: SOUTHEAST_SPECIES,
  },
  {
    code: 'northeast',
    name: 'Northeast United States',
    description: 'New England and Mid-Atlantic states',
    species: NORTHEAST_SPECIES,
  },
  {
    code: 'rocky_mountain',
    name: 'Rocky Mountains',
    description: 'Mountain regions from Montana to New Mexico',
    species: ROCKY_MOUNTAIN_SPECIES,
  },
];

/**
 * Validate if a region code is supported
 */
export function isValidRegion(region: string): region is SupportedRegion {
  return ['pnw', 'southeast', 'northeast', 'rocky_mountain'].includes(region);
}

/**
 * Default classification options
 */
export const DEFAULT_CLASSIFICATION_OPTIONS: ClassifySpeciesOptions = {
  minConfidence: 0.7,
  includeUncertain: false,
  useEnsemble: true,
};
