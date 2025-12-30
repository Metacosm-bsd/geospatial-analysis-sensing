/**
 * Forest Vegetation Simulator (FVS) Types
 * USDA Forest Service Growth and Yield Model
 * Sprint 61-66: Third-Party Integrations
 */

// ============================================================================
// FVS Variants (Regional Models)
// ============================================================================

export type FVSVariant =
  | 'PN' // Pacific Northwest (West Side)
  | 'WC' // West Cascades
  | 'EC' // East Cascades
  | 'NC' // North Central
  | 'NE' // Northeast
  | 'SN' // Southern
  | 'SO' // South Central Oregon / NE California
  | 'CA' // Inland California / Southern Cascades
  | 'WS' // Western Sierra Nevada
  | 'BM' // Blue Mountains
  | 'EM' // Eastern Montana
  | 'IE' // Inland Empire
  | 'NI' // Northern Idaho
  | 'UT' // Utah
  | 'CR' // Central Rockies
  | 'KT' // Kootenai / Kaniksu / Tally Lake
  | 'TT' // Tetons
  | 'CI' // Central Idaho
  | 'AK' // Alaska
  | 'CS' // Central States
  | 'LS' // Lake States
  | 'OP' // Olympics
  | 'SE' // Southeast Alaska / Coastal BC;

// ============================================================================
// FVS Input Records
// ============================================================================

export interface FVSStandRecord {
  standId: string;
  variant: FVSVariant;
  inventoryYear: number;
  latitude: number;
  longitude: number;
  elevation: number; // feet
  aspect: number; // degrees (0-360)
  slope: number; // percent
  habitatType: string;
  siteIndex: number;
  basalAreaFactor: number;
  numPlots: number;
  plotSize: number; // acres
  forestType: string;
  ecoregion?: string;
  owner?: string;
  county?: string;
  state?: string;
}

export interface FVSTreeRecord {
  standId: string;
  plotId: number;
  treeId: number;
  speciesCode: string; // FVS species code (2-3 char)
  dbh: number; // inches
  height: number; // feet (optional, 0 = compute)
  crownRatio: number; // 0-100
  damageCodes: string[]; // up to 3 damage codes
  treeValue: number; // board feet per tree
  treesPerAcre: number; // expansion factor
  age?: number;
  heightGrowth?: number; // 5-year height growth
  radialGrowth?: number; // 10-year radial growth
  crownClass?: 'D' | 'C' | 'I' | 'S'; // Dominant, Codominant, Intermediate, Suppressed
  treeStatus?: 'L' | 'D' | 'C'; // Live, Dead, Cut
}

export interface FVSKeyword {
  keyword: string;
  parameters: (string | number)[];
  comments?: string;
}

// ============================================================================
// FVS Output Records
// ============================================================================

export interface FVSProjectionOutput {
  standId: string;
  projectionYears: FVSYearlyOutput[];
  harvestSchedule?: FVSHarvestEvent[];
  mortality: FVSMortalityRecord[];
  carbonReports?: FVSCarbonReport[];
}

export interface FVSYearlyOutput {
  year: number;
  age: number;
  treesPerAcre: number;
  basalAreaPerAcre: number; // sq ft
  sdi: number; // Stand Density Index
  ccf: number; // Crown Competition Factor
  topHeight: number; // feet
  qmd: number; // Quadratic Mean Diameter (inches)
  totalCuFt: number; // total cubic feet per acre
  merchCuFt: number; // merchantable cubic feet per acre
  merchBdFt: number; // merchantable board feet per acre
  volumeRemoved?: number;
  residualTrees?: number;
}

export interface FVSHarvestEvent {
  year: number;
  harvestType: 'clearcut' | 'thinning' | 'selection' | 'salvage';
  volumeRemoved: number; // board feet per acre
  treesRemoved: number;
  residualBasalArea: number;
  residualTPA: number;
}

export interface FVSMortalityRecord {
  year: number;
  speciesCode: string;
  mortalityTPA: number;
  mortalityCause: string;
}

export interface FVSCarbonReport {
  year: number;
  aboveGroundLive: number; // tons C per acre
  belowGroundLive: number;
  belowGroundDead: number;
  standingDead: number;
  forestDownedDead: number;
  forestFloor: number;
  forestShrubHerb: number;
  totalStand: number;
  totalRemoved: number;
  carbonReleased: number;
  netCarbonStored: number;
}

// ============================================================================
// FVS Extension Options
// ============================================================================

export interface FVSExtensions {
  fireAndFuels?: boolean; // Fire and Fuels Extension (FFE)
  carbonReports?: boolean; // Carbon Reports
  climate?: boolean; // Climate-FVS
  parallel?: boolean; // Parallel Processing
  organon?: boolean; // ORGANON growth model
  estab?: boolean; // Establishment model
  bgc?: boolean; // Biogeoclimatic subzone
  dwdVolume?: boolean; // Down Woody Debris Volume
}

// ============================================================================
// FVS Species Codes by Variant
// ============================================================================

export const FVS_SPECIES_CODES: Record<string, { code: string; name: string; variants: FVSVariant[] }> = {
  // Pacific Northwest / Western Species
  'PSME': { code: 'DF', name: 'Douglas-fir', variants: ['PN', 'WC', 'EC', 'SO', 'CA', 'BM', 'IE', 'NI'] },
  'TSHE': { code: 'WH', name: 'Western hemlock', variants: ['PN', 'WC', 'OP', 'AK'] },
  'THPL': { code: 'RC', name: 'Western redcedar', variants: ['PN', 'WC', 'NI', 'IE'] },
  'ABAM': { code: 'SF', name: 'Pacific silver fir', variants: ['PN', 'WC', 'OP'] },
  'ABGR': { code: 'GF', name: 'Grand fir', variants: ['PN', 'WC', 'EC', 'BM', 'NI', 'IE'] },
  'PIPO': { code: 'PP', name: 'Ponderosa pine', variants: ['PN', 'EC', 'SO', 'CA', 'BM', 'UT', 'CR'] },
  'PICO': { code: 'LP', name: 'Lodgepole pine', variants: ['PN', 'EC', 'BM', 'IE', 'EM', 'UT', 'CR'] },
  'PIMO': { code: 'WP', name: 'Western white pine', variants: ['PN', 'NI', 'IE'] },
  'LAOC': { code: 'WL', name: 'Western larch', variants: ['PN', 'BM', 'NI', 'IE', 'EM'] },
  'ABLA': { code: 'AF', name: 'Subalpine fir', variants: ['PN', 'EC', 'BM', 'IE', 'EM', 'UT', 'CR'] },
  'PIEN': { code: 'ES', name: 'Engelmann spruce', variants: ['EC', 'BM', 'IE', 'EM', 'UT', 'CR'] },

  // California Species
  'SEGI': { code: 'RW', name: 'Coast redwood', variants: ['CA'] },
  'SESE': { code: 'GS', name: 'Giant sequoia', variants: ['WS'] },
  'ABCO': { code: 'WF', name: 'White fir', variants: ['CA', 'WS', 'SO'] },
  'ABMA': { code: 'RF', name: 'Red fir', variants: ['CA', 'WS'] },
  'CADE': { code: 'IC', name: 'Incense-cedar', variants: ['CA', 'WS', 'SO'] },
  'PILA': { code: 'SP', name: 'Sugar pine', variants: ['CA', 'WS', 'SO'] },
  'PIJE': { code: 'JP', name: 'Jeffrey pine', variants: ['CA', 'WS', 'SO'] },

  // Eastern Species
  'PIST': { code: 'WP', name: 'Eastern white pine', variants: ['NE', 'LS', 'CS'] },
  'PIRE': { code: 'RP', name: 'Red pine', variants: ['NE', 'LS'] },
  'PIGL': { code: 'WS', name: 'White spruce', variants: ['NE', 'LS'] },
  'PIRU': { code: 'RS', name: 'Red spruce', variants: ['NE'] },
  'ABBA': { code: 'BF', name: 'Balsam fir', variants: ['NE', 'LS'] },
  'ACSA': { code: 'SM', name: 'Sugar maple', variants: ['NE', 'LS', 'CS'] },
  'ACRU': { code: 'RM', name: 'Red maple', variants: ['NE', 'LS', 'CS', 'SN'] },
  'BEAL': { code: 'YB', name: 'Yellow birch', variants: ['NE', 'LS'] },
  'BEPA': { code: 'PB', name: 'Paper birch', variants: ['NE', 'LS'] },
  'FAGR': { code: 'AB', name: 'American beech', variants: ['NE', 'LS', 'CS'] },
  'QUAL': { code: 'WO', name: 'White oak', variants: ['NE', 'CS', 'SN'] },
  'QURU': { code: 'RO', name: 'Northern red oak', variants: ['NE', 'LS', 'CS'] },
  'FRAM': { code: 'WA', name: 'White ash', variants: ['NE', 'LS', 'CS'] },

  // Southern Species
  'PITA': { code: 'LL', name: 'Loblolly pine', variants: ['SN'] },
  'PIEC': { code: 'SL', name: 'Slash pine', variants: ['SN'] },
  'PIPA': { code: 'LP', name: 'Longleaf pine', variants: ['SN'] },
  'PIVI': { code: 'VP', name: 'Virginia pine', variants: ['SN'] },
  'LIST': { code: 'AT', name: 'American sweetgum', variants: ['SN'] },
  'LITU': { code: 'YP', name: 'Yellow-poplar', variants: ['SN', 'CS'] },
};

// ============================================================================
// FVS Damage Codes
// ============================================================================

export const FVS_DAMAGE_CODES = {
  // General damage codes
  '00000': 'No damage',
  '01000': 'General insect damage',
  '02000': 'Bark beetle damage',
  '03000': 'Defoliator damage',
  '04000': 'General disease damage',
  '05000': 'Root disease',
  '06000': 'Stem decay',
  '07000': 'Dwarf mistletoe',
  '08000': 'Fire damage',
  '09000': 'Animal damage',
  '10000': 'Weather damage',
  '11000': 'Human damage',
  '12000': 'Competition suppression',
  '25000': 'White pine blister rust',
  '90000': 'Dead tree',
};
