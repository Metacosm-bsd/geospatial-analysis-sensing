/**
 * Species Components Export
 * Sprint 13-14: Species Classification UI
 * Sprint 15-16: Added ConfusionMatrix, ValidationMetrics, CorrectionHistory,
 *               SpeciesFilter, and SpeciesExporter components
 */

// Main components
export { SpeciesClassifier } from './SpeciesClassifier';
export { SpeciesBreakdown } from './SpeciesBreakdown';
export { SpeciesLegend } from './SpeciesLegend';
export { SpeciesCard, SpeciesCardCompact } from './SpeciesCard';
export { TreeSpeciesEditor, TreeSpeciesEditorInline } from './TreeSpeciesEditor';

// Sprint 15-16: New components
export { ConfusionMatrix } from './ConfusionMatrix';
export { ValidationMetrics } from './ValidationMetrics';
export { CorrectionHistory } from './CorrectionHistory';
export { SpeciesFilter } from './SpeciesFilter';
export { SpeciesExporter } from './SpeciesExporter';

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
