/**
 * Species Components Export
 * Sprint 13-14: Species Classification UI
 */

// Main components
export { SpeciesClassifier } from './SpeciesClassifier';
export { SpeciesBreakdown } from './SpeciesBreakdown';
export { SpeciesLegend } from './SpeciesLegend';
export { SpeciesCard, SpeciesCardCompact } from './SpeciesCard';
export { TreeSpeciesEditor, TreeSpeciesEditorInline } from './TreeSpeciesEditor';

// Color utilities
export {
  SPECIES_COLORS,
  SPECIES_NAMES,
  SPECIES_SCIENTIFIC_NAMES,
  SPECIES_TYPES,
  getSpeciesColor,
  getSpeciesName,
  getSpeciesColorArray,
  getChartColors,
} from './speciesColors';

// Default export
export { default as speciesColors } from './speciesColors';
