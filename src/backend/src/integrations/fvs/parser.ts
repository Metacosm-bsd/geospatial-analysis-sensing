/**
 * FVS Output Parser
 * Parse Forest Vegetation Simulator output files
 * Sprint 61-66: Third-Party Integrations
 */

import {
  FVSProjectionOutput,
  FVSYearlyOutput,
  FVSHarvestEvent,
  FVSMortalityRecord,
  FVSCarbonReport,
  FVSTreeRecord,
} from './types';

// ============================================================================
// FVS Output Parser
// ============================================================================

export class FVSOutputParser {
  // ==========================================================================
  // Parse Summary Output File
  // ==========================================================================

  parseSummaryOutput(content: string): FVSProjectionOutput[] {
    const projections: FVSProjectionOutput[] = [];
    const lines = content.split('\n');

    let currentStand: string | null = null;
    let currentYears: FVSYearlyOutput[] = [];
    let currentHarvests: FVSHarvestEvent[] = [];
    let currentMortality: FVSMortalityRecord[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Look for stand identification
      if (line.includes('STAND ID:') || line.includes('STAND =')) {
        // Save previous stand if exists
        if (currentStand) {
          projections.push({
            standId: currentStand,
            projectionYears: currentYears,
            harvestSchedule: currentHarvests,
            mortality: currentMortality,
          });
        }

        // Extract new stand ID
        const match = line.match(/(?:STAND ID:|STAND =)\s*(\S+)/);
        currentStand = match ? match[1] : 'UNKNOWN';
        currentYears = [];
        currentHarvests = [];
        currentMortality = [];
      }

      // Parse summary table rows
      if (this.isSummaryTableRow(line)) {
        const yearOutput = this.parseSummaryRow(line);
        if (yearOutput) {
          currentYears.push(yearOutput);
        }
      }

      // Parse harvest records
      if (line.includes('HARVEST') || line.includes('REMOVAL')) {
        const harvest = this.parseHarvestLine(line, lines[i + 1]);
        if (harvest) {
          currentHarvests.push(harvest);
        }
      }

      // Parse mortality records
      if (line.includes('MORTALITY') && !line.includes('BACKGROUND')) {
        const mortality = this.parseMortalityLine(line);
        if (mortality) {
          currentMortality.push(mortality);
        }
      }
    }

    // Save last stand
    if (currentStand) {
      projections.push({
        standId: currentStand,
        projectionYears: currentYears,
        harvestSchedule: currentHarvests,
        mortality: currentMortality,
      });
    }

    return projections;
  }

  // ==========================================================================
  // Parse Tree List Output
  // ==========================================================================

  parseTreeList(content: string): Map<string, FVSTreeRecord[]> {
    const treesByStand = new Map<string, FVSTreeRecord[]>();
    const lines = content.split('\n');

    let currentStand: string | null = null;
    let inTreeSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect stand header
      if (trimmed.includes('STAND:') || trimmed.includes('STAND =')) {
        const match = trimmed.match(/(?:STAND:|STAND =)\s*(\S+)/);
        currentStand = match ? match[1] : null;
        if (currentStand && !treesByStand.has(currentStand)) {
          treesByStand.set(currentStand, []);
        }
      }

      // Detect tree list section
      if (trimmed.includes('TREE') && trimmed.includes('SPECIES') && trimmed.includes('DBH')) {
        inTreeSection = true;
        continue;
      }

      // Parse tree data
      if (inTreeSection && currentStand && this.isTreeDataRow(trimmed)) {
        const tree = this.parseTreeRow(trimmed, currentStand);
        if (tree) {
          treesByStand.get(currentStand)!.push(tree);
        }
      }

      // End of tree section
      if (inTreeSection && (trimmed === '' || trimmed.startsWith('-'))) {
        inTreeSection = false;
      }
    }

    return treesByStand;
  }

  // ==========================================================================
  // Parse Carbon Report
  // ==========================================================================

  parseCarbonReport(content: string): FVSCarbonReport[] {
    const reports: FVSCarbonReport[] = [];
    const lines = content.split('\n');

    let inCarbonSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect carbon report section
      if (line.includes('CARBON REPORT') || line.includes('STAND CARBON')) {
        inCarbonSection = true;
        continue;
      }

      // Parse carbon data rows
      if (inCarbonSection && this.isCarbonDataRow(line)) {
        const report = this.parseCarbonRow(line);
        if (report) {
          reports.push(report);
        }
      }

      // End of carbon section
      if (inCarbonSection && line === '') {
        inCarbonSection = false;
      }
    }

    return reports;
  }

  // ==========================================================================
  // Parse Database Output (SQLite)
  // ==========================================================================

  async parseDatabaseOutput(dbPath: string): Promise<{
    summary: FVSYearlyOutput[];
    trees: FVSTreeRecord[];
    carbon: FVSCarbonReport[];
  }> {
    // This would use better-sqlite3 or similar to read FVS output database
    // For now, return structure placeholder
    return {
      summary: [],
      trees: [],
      carbon: [],
    };
  }

  // ==========================================================================
  // Parse FVS Suppose Output
  // ==========================================================================

  parseSupposeOutput(content: string): {
    runInfo: object;
    summaries: FVSProjectionOutput[];
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const runInfo: Record<string, any> = {};

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Collect warnings
      if (trimmed.includes('WARNING') || trimmed.includes('WARN')) {
        warnings.push(trimmed);
      }

      // Collect errors
      if (trimmed.includes('ERROR') || trimmed.includes('ERR')) {
        errors.push(trimmed);
      }

      // Extract run info
      if (trimmed.includes('FVS VERSION')) {
        runInfo.version = trimmed.split(':')[1]?.trim();
      }
      if (trimmed.includes('RUN DATE')) {
        runInfo.runDate = trimmed.split(':')[1]?.trim();
      }
      if (trimmed.includes('VARIANT')) {
        runInfo.variant = trimmed.split(':')[1]?.trim();
      }
    }

    return {
      runInfo,
      summaries: this.parseSummaryOutput(content),
      warnings,
      errors,
    };
  }

  // ==========================================================================
  // Helper Parsing Methods
  // ==========================================================================

  private isSummaryTableRow(line: string): boolean {
    // Summary rows typically start with a year (4 digits)
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) return false;
    const year = parseInt(parts[0]);
    return !isNaN(year) && year > 1900 && year < 2200;
  }

  private parseSummaryRow(line: string): FVSYearlyOutput | null {
    const parts = line.trim().split(/\s+/).map(p => parseFloat(p));

    if (parts.length < 10) return null;

    // Standard FVS summary output format
    // Year Age TPA BA SDI CCF TopHt QMD TotCuFt MerchCuFt MerchBdFt
    return {
      year: parts[0],
      age: parts[1],
      treesPerAcre: parts[2],
      basalAreaPerAcre: parts[3],
      sdi: parts[4],
      ccf: parts[5],
      topHeight: parts[6],
      qmd: parts[7],
      totalCuFt: parts[8],
      merchCuFt: parts[9],
      merchBdFt: parts[10] || 0,
    };
  }

  private parseHarvestLine(line: string, nextLine?: string): FVSHarvestEvent | null {
    // Extract harvest information
    const yearMatch = line.match(/(\d{4})/);
    if (!yearMatch) return null;

    const year = parseInt(yearMatch[1]);

    // Determine harvest type from keywords
    let harvestType: FVSHarvestEvent['harvestType'] = 'thinning';
    if (line.includes('CLEARCUT')) harvestType = 'clearcut';
    else if (line.includes('SELECTION')) harvestType = 'selection';
    else if (line.includes('SALVAGE')) harvestType = 'salvage';

    // Extract volumes if present
    const volumeMatch = line.match(/(\d+\.?\d*)\s*(?:MBF|BF|CUFT)/i);
    const volumeRemoved = volumeMatch ? parseFloat(volumeMatch[1]) : 0;

    return {
      year,
      harvestType,
      volumeRemoved,
      treesRemoved: 0, // Would need additional parsing
      residualBasalArea: 0,
      residualTPA: 0,
    };
  }

  private parseMortalityLine(line: string): FVSMortalityRecord | null {
    const parts = line.trim().split(/\s+/);

    // Look for year and TPA values
    const yearMatch = line.match(/(\d{4})/);
    if (!yearMatch) return null;

    return {
      year: parseInt(yearMatch[1]),
      speciesCode: 'ALL', // Would need species-specific parsing
      mortalityTPA: 0, // Would need additional parsing
      mortalityCause: 'background',
    };
  }

  private isTreeDataRow(line: string): boolean {
    // Tree data rows have numeric tree ID and DBH
    const parts = line.split(/\s+/);
    if (parts.length < 4) return false;
    return !isNaN(parseInt(parts[0])) && !isNaN(parseFloat(parts[2]));
  }

  private parseTreeRow(line: string, standId: string): FVSTreeRecord | null {
    const parts = line.split(/\s+/);

    if (parts.length < 5) return null;

    return {
      standId,
      plotId: 1,
      treeId: parseInt(parts[0]) || 0,
      speciesCode: parts[1] || 'UNK',
      dbh: parseFloat(parts[2]) || 0,
      height: parseFloat(parts[3]) || 0,
      crownRatio: parseInt(parts[4]) || 0,
      damageCodes: [],
      treeValue: 0,
      treesPerAcre: parseFloat(parts[5]) || 1,
    };
  }

  private isCarbonDataRow(line: string): boolean {
    const parts = line.split(/\s+/);
    if (parts.length < 5) return false;
    const year = parseInt(parts[0]);
    return !isNaN(year) && year > 1900 && year < 2200;
  }

  private parseCarbonRow(line: string): FVSCarbonReport | null {
    const parts = line.split(/\s+/).map(p => parseFloat(p));

    if (parts.length < 10) return null;

    // Carbon report format varies by FVS version
    // Year AbvGndLive BlwGndLive BlwGndDead StandDead ForDwnDead ForFloor Shrub Total
    return {
      year: parts[0],
      aboveGroundLive: parts[1] || 0,
      belowGroundLive: parts[2] || 0,
      belowGroundDead: parts[3] || 0,
      standingDead: parts[4] || 0,
      forestDownedDead: parts[5] || 0,
      forestFloor: parts[6] || 0,
      forestShrubHerb: parts[7] || 0,
      totalStand: parts[8] || 0,
      totalRemoved: parts[9] || 0,
      carbonReleased: parts[10] || 0,
      netCarbonStored: parts[11] || (parts[8] - (parts[10] || 0)),
    };
  }

  // ==========================================================================
  // Convert FVS Output to Platform Format
  // ==========================================================================

  convertToAnalysisFormat(projection: FVSProjectionOutput): {
    growthProjections: Array<{
      year: number;
      totalCarbon: number;
      carbonPerHectare: number;
      treesPerHectare: number;
      basalAreaPerHectare: number;
    }>;
    harvestPlan: Array<{
      year: number;
      type: string;
      volumeRemoved: number;
    }>;
  } {
    const growthProjections = projection.projectionYears.map(year => ({
      year: year.year,
      // Convert tons C/acre to tonnes CO2e/hectare
      totalCarbon: this.tonsCAcreToTonnesCO2eHa(year.totalCuFt * 0.012), // Rough conversion
      carbonPerHectare: this.tonsCAcreToTonnesCO2eHa(year.totalCuFt * 0.012 / (year.treesPerAcre || 1)),
      treesPerHectare: this.tpaToTph(year.treesPerAcre),
      basalAreaPerHectare: this.sqftAcreToSqmHa(year.basalAreaPerAcre),
    }));

    const harvestPlan = (projection.harvestSchedule || []).map(h => ({
      year: h.year,
      type: h.harvestType,
      volumeRemoved: h.volumeRemoved,
    }));

    return { growthProjections, harvestPlan };
  }

  // Unit conversions
  private tonsCAcreToTonnesCO2eHa(tonsCAcre: number): number {
    // tons C/acre -> tonnes C/ha -> tonnes CO2e/ha
    return tonsCAcre * 2.47105 * 0.907185 * (44 / 12);
  }

  private tpaToTph(tpa: number): number {
    return tpa * 2.47105; // Trees per acre to trees per hectare
  }

  private sqftAcreToSqmHa(sqftAcre: number): number {
    return sqftAcre * 0.229568; // sq ft/acre to sq m/ha
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFVSOutputParser(): FVSOutputParser {
  return new FVSOutputParser();
}
