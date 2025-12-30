/**
 * FVS Input File Generator
 * Creates .tre (tree list) and .key (keyword) files for FVS
 * Sprint 61-66: Third-Party Integrations
 */

import { PrismaClient } from '@prisma/client';
import {
  FVSVariant,
  FVSStandRecord,
  FVSTreeRecord,
  FVSKeyword,
  FVSExtensions,
  FVS_SPECIES_CODES,
} from './types';

const prisma = new PrismaClient();

// ============================================================================
// FVS Input Generator
// ============================================================================

export class FVSInputGenerator {
  private variant: FVSVariant;
  private extensions: FVSExtensions;

  constructor(variant: FVSVariant, extensions: FVSExtensions = {}) {
    this.variant = variant;
    this.extensions = extensions;
  }

  // ==========================================================================
  // Generate Complete FVS Input Package
  // ==========================================================================

  async generateFromAnalysis(
    analysisId: string,
    projectionYears: number = 100,
    outputPath?: string
  ): Promise<{
    treeFile: string;
    keywordFile: string;
    standInfo: FVSStandRecord;
  }> {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        project: true,
        trees: true,
        carbonCalculation: true,
      },
    });

    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    // Build stand record from project metadata
    const standInfo = this.buildStandRecord(analysis.project, analysis);

    // Build tree records
    const treeRecords = this.buildTreeRecords(analysis.trees, standInfo.standId);

    // Generate tree file (.tre)
    const treeFile = this.generateTreeFile(treeRecords);

    // Generate keyword file (.key)
    const keywordFile = this.generateKeywordFile(standInfo, projectionYears);

    return {
      treeFile,
      keywordFile,
      standInfo,
    };
  }

  // ==========================================================================
  // Build Stand Record
  // ==========================================================================

  private buildStandRecord(project: any, analysis: any): FVSStandRecord {
    const metadata = project.metadata || {};

    return {
      standId: project.id.substring(0, 10).toUpperCase(),
      variant: this.variant,
      inventoryYear: new Date(analysis.createdAt).getFullYear(),
      latitude: metadata.centerLat || 0,
      longitude: metadata.centerLon || 0,
      elevation: this.metersToFeet(metadata.elevation || 0),
      aspect: metadata.aspect || 0,
      slope: metadata.slope || 0,
      habitatType: metadata.habitatType || this.getDefaultHabitatType(),
      siteIndex: metadata.siteIndex || 80,
      basalAreaFactor: 40, // Standard 40 BAF
      numPlots: 1,
      plotSize: this.hectaresToAcres(metadata.areaHectares || 1),
      forestType: metadata.forestType || this.getDefaultForestType(),
      ecoregion: metadata.ecoregion,
      owner: project.organization?.name,
      county: metadata.county,
      state: metadata.state,
    };
  }

  // ==========================================================================
  // Build Tree Records
  // ==========================================================================

  private buildTreeRecords(trees: any[], standId: string): FVSTreeRecord[] {
    const records: FVSTreeRecord[] = [];
    const plotSize = 0.1; // Assume 0.1 acre plots for expansion factor

    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const fvsSpecies = this.mapToFVSSpecies(tree.speciesCode);

      // Calculate expansion factor (trees per acre)
      const expansionFactor = 1 / plotSize;

      records.push({
        standId,
        plotId: 1,
        treeId: i + 1,
        speciesCode: fvsSpecies,
        dbh: this.cmToInches(tree.dbh || 0),
        height: this.metersToFeet(tree.height || 0),
        crownRatio: this.estimateCrownRatio(tree),
        damageCodes: this.mapDamageCodes(tree),
        treeValue: 0,
        treesPerAcre: expansionFactor,
        age: tree.age,
        crownClass: this.mapCrownClass(tree.crownClass),
        treeStatus: tree.healthStatus === 'dead' ? 'D' : 'L',
      });
    }

    return records;
  }

  // ==========================================================================
  // Generate Tree List File (.tre)
  // ==========================================================================

  generateTreeFile(trees: FVSTreeRecord[]): string {
    const lines: string[] = [];

    // Header comment
    lines.push('! FVS Tree List File');
    lines.push(`! Generated: ${new Date().toISOString()}`);
    lines.push(`! Variant: ${this.variant}`);
    lines.push('!');
    lines.push('! Columns: Plot Tree Species DBH Height CrownRatio Damage1 Damage2 Damage3 TreeValue TPA HtGrowth RadGrowth Age CrClass');
    lines.push('!');

    // Group trees by stand
    const treesByStand = new Map<string, FVSTreeRecord[]>();
    for (const tree of trees) {
      const standTrees = treesByStand.get(tree.standId) || [];
      standTrees.push(tree);
      treesByStand.set(tree.standId, standTrees);
    }

    // Write tree data for each stand
    for (const [standId, standTrees] of treesByStand) {
      // Stand ID line
      lines.push(`${standId}`);

      // Tree records in FVS fixed-width format
      for (const tree of standTrees) {
        const line = this.formatTreeLine(tree);
        lines.push(line);
      }

      // End of stand marker
      lines.push('-999');
    }

    return lines.join('\n');
  }

  private formatTreeLine(tree: FVSTreeRecord): string {
    // FVS tree record format (fixed width columns)
    const plot = tree.plotId.toString().padStart(4);
    const treeNum = tree.treeId.toString().padStart(4);
    const species = tree.speciesCode.padEnd(3);
    const dbh = tree.dbh.toFixed(1).padStart(6);
    const height = tree.height > 0 ? tree.height.toFixed(0).padStart(4) : '   0';
    const crownRatio = tree.crownRatio.toString().padStart(3);
    const damage1 = (tree.damageCodes[0] || '00000').padStart(5);
    const damage2 = (tree.damageCodes[1] || '00000').padStart(5);
    const damage3 = (tree.damageCodes[2] || '00000').padStart(5);
    const treeValue = tree.treeValue.toFixed(0).padStart(6);
    const tpa = tree.treesPerAcre.toFixed(1).padStart(8);
    const htGrowth = (tree.heightGrowth || 0).toFixed(1).padStart(6);
    const radGrowth = (tree.radialGrowth || 0).toFixed(2).padStart(6);
    const age = (tree.age || 0).toString().padStart(4);
    const crClass = (tree.crownClass || ' ').padStart(1);

    return `${plot}${treeNum} ${species}${dbh}${height}${crownRatio}${damage1}${damage2}${damage3}${treeValue}${tpa}${htGrowth}${radGrowth}${age} ${crClass}`;
  }

  // ==========================================================================
  // Generate Keyword File (.key)
  // ==========================================================================

  generateKeywordFile(
    stand: FVSStandRecord,
    projectionYears: number = 100
  ): string {
    const lines: string[] = [];
    const keywords: FVSKeyword[] = [];

    // Header
    lines.push('! FVS Keyword File');
    lines.push(`! Generated: ${new Date().toISOString()}`);
    lines.push(`! Stand: ${stand.standId}`);
    lines.push(`! Variant: ${stand.variant}`);
    lines.push('!');

    // Standard keywords
    keywords.push({ keyword: 'STDIDENT', parameters: [stand.standId], comments: 'Stand identifier' });
    keywords.push({ keyword: 'STDINFO', parameters: [stand.forestType, stand.habitatType], comments: 'Stand info' });

    // Location and site
    keywords.push({
      keyword: 'SITECODE',
      parameters: [stand.habitatType],
      comments: 'Habitat type code'
    });

    keywords.push({
      keyword: 'DESIGN',
      parameters: [stand.basalAreaFactor, stand.numPlots, stand.plotSize],
      comments: 'Sample design: BAF, plots, plot size'
    });

    keywords.push({
      keyword: 'SDIMAX',
      parameters: [this.getSDIMax()],
      comments: 'Maximum stand density index'
    });

    // Inventory year and projection period
    const inventoryYear = stand.inventoryYear;
    const endYear = inventoryYear + projectionYears;
    const cycleLength = 10;

    keywords.push({
      keyword: 'INVYEAR',
      parameters: [inventoryYear],
      comments: 'Inventory year'
    });

    keywords.push({
      keyword: 'NUMCYCLE',
      parameters: [Math.ceil(projectionYears / cycleLength)],
      comments: 'Number of projection cycles'
    });

    keywords.push({
      keyword: 'TIMEINT',
      parameters: [0, cycleLength],
      comments: 'Time interval between cycles'
    });

    // Input files
    keywords.push({
      keyword: 'TREEFMT',
      parameters: [],
      comments: 'Tree record format (using default)'
    });

    // Output options
    keywords.push({
      keyword: 'ECHOSUM',
      parameters: [],
      comments: 'Echo summary statistics'
    });

    keywords.push({
      keyword: 'TREELIST',
      parameters: [0, 0, 0, 1, cycleLength],
      comments: 'Tree list output options'
    });

    keywords.push({
      keyword: 'CUTLIST',
      parameters: [0, 0, 0, 1, cycleLength],
      comments: 'Cut list output options'
    });

    keywords.push({
      keyword: 'ATRTLIST',
      parameters: [0],
      comments: 'Attribute list output'
    });

    // Database output
    keywords.push({
      keyword: 'DATABASE',
      parameters: [],
      comments: 'Database output'
    });

    keywords.push({
      keyword: 'DSNOUT',
      parameters: [`${stand.standId}.db`],
      comments: 'Output database file'
    });

    // Extensions
    if (this.extensions.carbonReports) {
      lines.push('!');
      lines.push('! Carbon Reports Extension');
      keywords.push({ keyword: 'CARBREPT', parameters: [], comments: 'Enable carbon reporting' });
      keywords.push({
        keyword: 'CARBCALC',
        parameters: [0, endYear],
        comments: 'Carbon calculation period'
      });
    }

    if (this.extensions.fireAndFuels) {
      lines.push('!');
      lines.push('! Fire and Fuels Extension (FFE)');
      keywords.push({ keyword: 'FMIN', parameters: [], comments: 'Fire model initialization' });
      keywords.push({ keyword: 'FUELFOTO', parameters: [], comments: 'Fuel photo series' });
      keywords.push({ keyword: 'CARBREPT', parameters: [], comments: 'Carbon reports for fire' });
    }

    if (this.extensions.climate) {
      lines.push('!');
      lines.push('! Climate-FVS Extension');
      keywords.push({
        keyword: 'CLIMATE',
        parameters: ['RCP45'], // Representative Concentration Pathway 4.5
        comments: 'Climate scenario'
      });
    }

    // Management scenarios (placeholder - would be customized)
    lines.push('!');
    lines.push('! Management Activities');
    lines.push('! (Add thinning, harvest, planting keywords as needed)');

    // End of run
    keywords.push({ keyword: 'PROCESS', parameters: [], comments: 'Process the simulation' });
    keywords.push({ keyword: 'STOP', parameters: [], comments: 'End of simulation' });

    // Write keywords
    for (const kw of keywords) {
      lines.push(this.formatKeywordLine(kw));
    }

    return lines.join('\n');
  }

  private formatKeywordLine(keyword: FVSKeyword): string {
    let line = keyword.keyword;

    if (keyword.parameters.length > 0) {
      // First line with keyword
      if (keyword.comments) {
        line += `          ${keyword.comments}`;
      }
      line += '\n';
      // Second line with parameters
      line += keyword.parameters.map(p => p.toString()).join('  ');
    } else if (keyword.comments) {
      line += `          ${keyword.comments}`;
    }

    return line;
  }

  // ==========================================================================
  // Generate Thinning Keywords
  // ==========================================================================

  generateThinningKeywords(options: {
    year: number;
    targetBasalArea?: number;
    targetTPA?: number;
    minDbh?: number;
    maxDbh?: number;
    speciesRemove?: string[];
  }): FVSKeyword[] {
    const keywords: FVSKeyword[] = [];

    keywords.push({
      keyword: 'THINDBH',
      parameters: [
        options.year,
        0, // All trees
        options.minDbh || 0,
        options.maxDbh || 999,
        0, // Proportional
        options.targetTPA || 0,
      ],
      comments: `Thin from ${options.minDbh || 'all'} to ${options.maxDbh || 'all'} inches`,
    });

    if (options.targetBasalArea) {
      keywords.push({
        keyword: 'THINBA',
        parameters: [
          options.year,
          options.targetBasalArea,
          1, // From below
          0, 0, 999,
        ],
        comments: `Thin to ${options.targetBasalArea} BA from below`,
      });
    }

    return keywords;
  }

  // ==========================================================================
  // Generate Harvest Keywords
  // ==========================================================================

  generateHarvestKeywords(options: {
    year: number;
    harvestType: 'clearcut' | 'shelterwood' | 'selection';
    retentionPercent?: number;
    minDbh?: number;
  }): FVSKeyword[] {
    const keywords: FVSKeyword[] = [];

    switch (options.harvestType) {
      case 'clearcut':
        keywords.push({
          keyword: 'THINDBH',
          parameters: [options.year, 0, options.minDbh || 6, 999, 0, 0],
          comments: 'Clearcut harvest',
        });
        break;

      case 'shelterwood':
        const retention = options.retentionPercent || 30;
        keywords.push({
          keyword: 'THINPRSC',
          parameters: [options.year, retention, 1, 0, 0, 999],
          comments: `Shelterwood with ${retention}% retention`,
        });
        break;

      case 'selection':
        keywords.push({
          keyword: 'THINBTA',
          parameters: [options.year, 60, 1, 0, 12, 999],
          comments: 'Selection harvest to 60 BA',
        });
        break;
    }

    return keywords;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private mapToFVSSpecies(speciesCode: string): string {
    const fvsInfo = FVS_SPECIES_CODES[speciesCode];
    if (fvsInfo && fvsInfo.variants.includes(this.variant)) {
      return fvsInfo.code;
    }
    // Default species by variant
    return this.getDefaultSpecies();
  }

  private getDefaultSpecies(): string {
    const variantDefaults: Record<FVSVariant, string> = {
      'PN': 'DF', 'WC': 'DF', 'EC': 'PP', 'NC': 'RO', 'NE': 'SM',
      'SN': 'LL', 'SO': 'PP', 'CA': 'WF', 'WS': 'WF', 'BM': 'DF',
      'EM': 'DF', 'IE': 'DF', 'NI': 'WH', 'UT': 'DF', 'CR': 'DF',
      'KT': 'DF', 'TT': 'DF', 'CI': 'DF', 'AK': 'SS', 'CS': 'WO',
      'LS': 'SM', 'OP': 'WH', 'SE': 'SS',
    };
    return variantDefaults[this.variant] || 'DF';
  }

  private getDefaultHabitatType(): string {
    const variantHabitats: Partial<Record<FVSVariant, string>> = {
      'PN': 'CHS221', 'WC': 'CDS531', 'EC': 'CPS111',
      'NE': 'SM2', 'SN': 'LP1', 'CA': 'WF1',
    };
    return variantHabitats[this.variant] || 'DEFAULT';
  }

  private getDefaultForestType(): string {
    const variantForests: Partial<Record<FVSVariant, string>> = {
      'PN': 'Douglas-fir', 'WC': 'Douglas-fir', 'EC': 'Ponderosa pine',
      'NE': 'Northern hardwoods', 'SN': 'Loblolly pine', 'CA': 'Mixed conifer',
    };
    return variantForests[this.variant] || 'Mixed';
  }

  private getSDIMax(): number {
    // SDI max varies by variant/species
    const variantSDI: Partial<Record<FVSVariant, number>> = {
      'PN': 600, 'WC': 600, 'EC': 400, 'NE': 450, 'SN': 450, 'CA': 500,
    };
    return variantSDI[this.variant] || 500;
  }

  private estimateCrownRatio(tree: any): number {
    // Estimate crown ratio from crown diameter and height
    if (tree.crownDiameter && tree.height) {
      const ratio = (tree.crownDiameter / tree.height) * 100;
      return Math.min(95, Math.max(5, Math.round(ratio * 2)));
    }
    return 40; // Default crown ratio
  }

  private mapCrownClass(crownClass?: string): 'D' | 'C' | 'I' | 'S' | undefined {
    const mapping: Record<string, 'D' | 'C' | 'I' | 'S'> = {
      'dominant': 'D',
      'codominant': 'C',
      'intermediate': 'I',
      'suppressed': 'S',
      'overtopped': 'S',
    };
    return crownClass ? mapping[crownClass.toLowerCase()] : undefined;
  }

  private mapDamageCodes(tree: any): string[] {
    const codes: string[] = [];

    if (tree.healthStatus === 'dead') {
      codes.push('90000');
    } else if (tree.healthStatus === 'declining') {
      codes.push('12000'); // Competition suppression
    }

    // Pad to 3 codes
    while (codes.length < 3) {
      codes.push('00000');
    }

    return codes.slice(0, 3);
  }

  // Unit conversions
  private cmToInches(cm: number): number {
    return cm / 2.54;
  }

  private metersToFeet(m: number): number {
    return m * 3.28084;
  }

  private hectaresToAcres(ha: number): number {
    return ha * 2.47105;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFVSInputGenerator(
  variant: FVSVariant,
  extensions?: FVSExtensions
): FVSInputGenerator {
  return new FVSInputGenerator(variant, extensions);
}
