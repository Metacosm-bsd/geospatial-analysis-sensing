/**
 * Species Color Palette Configuration
 * Sprint 13-14: Species Classification UI
 *
 * Color assignments for tree species visualization in the point cloud viewer
 * and species breakdown charts. Colors are chosen to be visually distinct
 * while maintaining a natural forest-themed palette.
 */

/**
 * Species color palette - Pacific Northwest focus
 * Colors designed to be distinct yet harmonious
 */
export const SPECIES_COLORS: Record<string, string> = {
  // Conifers - Greens and Blue-Greens
  'PSME': '#228B22', // Douglas-fir - Forest Green
  'TSHE': '#006400', // Western Hemlock - Dark Green
  'THPL': '#8B4513', // Western Red Cedar - Saddle Brown
  'PISI': '#2E8B57', // Sitka Spruce - Sea Green
  'ABGR': '#3CB371', // Grand Fir - Medium Sea Green
  'ABPR': '#4169E1', // Noble Fir - Royal Blue
  'ABAM': '#5F9EA0', // Pacific Silver Fir - Cadet Blue
  'PICO': '#DAA520', // Lodgepole Pine - Goldenrod
  'PIPO': '#B8860B', // Ponderosa Pine - Dark Goldenrod
  'LAOC': '#FFD700', // Western Larch - Gold
  'PIMO': '#BDB76B', // Western White Pine - Dark Khaki
  'CANO': '#556B2F', // Alaska Yellow Cedar - Dark Olive Green
  'TABR': '#4682B4', // Pacific Yew - Steel Blue
  'JUOC': '#708090', // Western Juniper - Slate Gray

  // Deciduous - Yellows, Oranges, Reds
  'ALRU': '#9ACD32', // Red Alder - Yellow Green
  'ACMA': '#FFA500', // Bigleaf Maple - Orange
  'POTR': '#FFE4B5', // Quaking Aspen - Moccasin
  'POBAT': '#FFEFD5', // Black Cottonwood - Papaya Whip
  'QUGA': '#8B4513', // Oregon White Oak - Saddle Brown
  'FRLA': '#CD853F', // Oregon Ash - Peru
  'ARME': '#DC143C', // Pacific Madrone - Crimson
  'COCO': '#D2691E', // California Hazel - Chocolate
  'SAMY': '#00CED1', // Pacific Willow - Dark Turquoise
  'PRVI': '#FF6347', // Bitter Cherry - Tomato
  'PRSE': '#FF69B4', // Black Cherry - Hot Pink
  'BEAL': '#FFDAB9', // Yellow Birch - Peach Puff
  'BENE': '#E6E6FA', // Water Birch - Lavender

  // Additional Pacific Northwest Species
  'CHLA': '#66CDAA', // Port Orford Cedar - Medium Aquamarine
  'SEGI': '#8B0000', // Coast Redwood - Dark Red
  'SESU': '#A52A2A', // Giant Sequoia - Brown
  'UMCA': '#BC8F8F', // California Bay Laurel - Rosy Brown
  'LIDE': '#F0E68C', // Tanoak - Khaki
  'ARBU': '#FF4500', // Madrone - Orange Red

  // Unknown/Other
  'UNKN': '#9E9E9E', // Unknown - Gray
  'OTHER': '#757575', // Other - Dark Gray
};

/**
 * Get color for a species code, with fallback
 */
export function getSpeciesColor(speciesCode: string): string {
  return SPECIES_COLORS[speciesCode] || SPECIES_COLORS['UNKN'] || '#9E9E9E';
}

/**
 * Species common names for display
 */
export const SPECIES_NAMES: Record<string, string> = {
  // Conifers
  'PSME': 'Douglas-fir',
  'TSHE': 'Western Hemlock',
  'THPL': 'Western Red Cedar',
  'PISI': 'Sitka Spruce',
  'ABGR': 'Grand Fir',
  'ABPR': 'Noble Fir',
  'ABAM': 'Pacific Silver Fir',
  'PICO': 'Lodgepole Pine',
  'PIPO': 'Ponderosa Pine',
  'LAOC': 'Western Larch',
  'PIMO': 'Western White Pine',
  'CANO': 'Alaska Yellow Cedar',
  'TABR': 'Pacific Yew',
  'JUOC': 'Western Juniper',

  // Deciduous
  'ALRU': 'Red Alder',
  'ACMA': 'Bigleaf Maple',
  'POTR': 'Quaking Aspen',
  'POBAT': 'Black Cottonwood',
  'QUGA': 'Oregon White Oak',
  'FRLA': 'Oregon Ash',
  'ARME': 'Pacific Madrone',
  'COCO': 'California Hazel',
  'SAMY': 'Pacific Willow',
  'PRVI': 'Bitter Cherry',
  'PRSE': 'Black Cherry',
  'BEAL': 'Yellow Birch',
  'BENE': 'Water Birch',

  // Additional
  'CHLA': 'Port Orford Cedar',
  'SEGI': 'Coast Redwood',
  'SESU': 'Giant Sequoia',
  'UMCA': 'California Bay Laurel',
  'LIDE': 'Tanoak',
  'ARBU': 'Madrone',

  // Unknown
  'UNKN': 'Unknown',
  'OTHER': 'Other',
};

/**
 * Get species common name
 */
export function getSpeciesName(speciesCode: string): string {
  return SPECIES_NAMES[speciesCode] || speciesCode;
}

/**
 * Species scientific names
 */
export const SPECIES_SCIENTIFIC_NAMES: Record<string, string> = {
  'PSME': 'Pseudotsuga menziesii',
  'TSHE': 'Tsuga heterophylla',
  'THPL': 'Thuja plicata',
  'PISI': 'Picea sitchensis',
  'ABGR': 'Abies grandis',
  'ABPR': 'Abies procera',
  'ABAM': 'Abies amabilis',
  'PICO': 'Pinus contorta',
  'PIPO': 'Pinus ponderosa',
  'LAOC': 'Larix occidentalis',
  'PIMO': 'Pinus monticola',
  'CANO': 'Cupressus nootkatensis',
  'TABR': 'Taxus brevifolia',
  'JUOC': 'Juniperus occidentalis',
  'ALRU': 'Alnus rubra',
  'ACMA': 'Acer macrophyllum',
  'POTR': 'Populus tremuloides',
  'POBAT': 'Populus trichocarpa',
  'QUGA': 'Quercus garryana',
  'FRLA': 'Fraxinus latifolia',
  'ARME': 'Arbutus menziesii',
  'CHLA': 'Chamaecyparis lawsoniana',
  'SEGI': 'Sequoia sempervirens',
  'SESU': 'Sequoiadendron giganteum',
};

/**
 * Species type classification
 */
export const SPECIES_TYPES: Record<string, 'conifer' | 'deciduous' | 'unknown'> = {
  'PSME': 'conifer',
  'TSHE': 'conifer',
  'THPL': 'conifer',
  'PISI': 'conifer',
  'ABGR': 'conifer',
  'ABPR': 'conifer',
  'ABAM': 'conifer',
  'PICO': 'conifer',
  'PIPO': 'conifer',
  'LAOC': 'conifer',
  'PIMO': 'conifer',
  'CANO': 'conifer',
  'TABR': 'conifer',
  'JUOC': 'conifer',
  'CHLA': 'conifer',
  'SEGI': 'conifer',
  'SESU': 'conifer',
  'ALRU': 'deciduous',
  'ACMA': 'deciduous',
  'POTR': 'deciduous',
  'POBAT': 'deciduous',
  'QUGA': 'deciduous',
  'FRLA': 'deciduous',
  'ARME': 'deciduous',
  'COCO': 'deciduous',
  'SAMY': 'deciduous',
  'PRVI': 'deciduous',
  'PRSE': 'deciduous',
  'BEAL': 'deciduous',
  'BENE': 'deciduous',
  'UMCA': 'deciduous',
  'LIDE': 'deciduous',
  'ARBU': 'deciduous',
  'UNKN': 'unknown',
  'OTHER': 'unknown',
};

/**
 * Get all species colors as an array for charts
 */
export function getSpeciesColorArray(speciesCodes: string[]): string[] {
  return speciesCodes.map((code) => getSpeciesColor(code));
}

/**
 * Generate a chart-friendly color palette
 */
export function getChartColors(count: number): string[] {
  const chartColors = [
    '#228B22', '#006400', '#2E8B57', '#3CB371', '#9ACD32',
    '#FFA500', '#DAA520', '#B8860B', '#8B4513', '#CD853F',
    '#DC143C', '#FF6347', '#4169E1', '#4682B4', '#5F9EA0',
    '#556B2F', '#708090', '#BDB76B', '#66CDAA', '#00CED1',
  ];

  if (count <= chartColors.length) {
    return chartColors.slice(0, count);
  }

  // Generate additional colors if needed
  const additionalColors: string[] = [];
  for (let i = chartColors.length; i < count; i++) {
    const hue = (i * 137.5) % 360;
    additionalColors.push(`hsl(${hue}, 60%, 50%)`);
  }

  return [...chartColors, ...additionalColors];
}

export default SPECIES_COLORS;
