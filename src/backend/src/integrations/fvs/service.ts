/**
 * FVS Integration Service
 * High-level service for Forest Vegetation Simulator integration
 * Sprint 61-66: Third-Party Integrations
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FVSInputGenerator, createFVSInputGenerator } from './generator';
import { FVSOutputParser, createFVSOutputParser } from './parser';
import {
  FVSVariant,
  FVSStandRecord,
  FVSTreeRecord,
  FVSProjectionOutput,
  FVSCarbonReport,
  FVSExtensions,
  FVSKeyword,
} from './types';

const prisma = new PrismaClient();

// ============================================================================
// FVS Integration Service
// ============================================================================

export class FVSService {
  private generator: FVSInputGenerator;
  private parser: FVSOutputParser;
  private outputDir: string;

  constructor(
    variant: FVSVariant = 'PN',
    extensions: FVSExtensions = { carbonReports: true },
    outputDir: string = '/tmp/fvs'
  ) {
    this.generator = createFVSInputGenerator(variant, extensions);
    this.parser = createFVSOutputParser();
    this.outputDir = outputDir;
  }

  // ==========================================================================
  // Export Analysis to FVS Format
  // ==========================================================================

  async exportToFVS(
    analysisId: string,
    options: {
      projectionYears?: number;
      managementScenario?: 'baseline' | 'thinning' | 'harvest' | 'custom';
      customKeywords?: FVSKeyword[];
    } = {}
  ): Promise<{
    standId: string;
    treeFilePath: string;
    keywordFilePath: string;
    runScript: string;
  }> {
    const { projectionYears = 100, managementScenario = 'baseline' } = options;

    // Generate FVS input files
    const { treeFile, keywordFile, standInfo } = await this.generator.generateFromAnalysis(
      analysisId,
      projectionYears
    );

    // Modify keyword file based on management scenario
    let finalKeywordFile = keywordFile;
    if (managementScenario !== 'baseline') {
      finalKeywordFile = this.addManagementScenario(keywordFile, managementScenario, standInfo);
    }

    if (options.customKeywords) {
      finalKeywordFile = this.appendCustomKeywords(finalKeywordFile, options.customKeywords);
    }

    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });

    // Write files
    const treeFilePath = path.join(this.outputDir, `${standInfo.standId}.tre`);
    const keywordFilePath = path.join(this.outputDir, `${standInfo.standId}.key`);

    await fs.writeFile(treeFilePath, treeFile);
    await fs.writeFile(keywordFilePath, finalKeywordFile);

    // Generate run script
    const runScript = this.generateRunScript(standInfo, treeFilePath, keywordFilePath);
    const runScriptPath = path.join(this.outputDir, `run_${standInfo.standId}.sh`);
    await fs.writeFile(runScriptPath, runScript, { mode: 0o755 });

    return {
      standId: standInfo.standId,
      treeFilePath,
      keywordFilePath,
      runScript,
    };
  }

  // ==========================================================================
  // Import FVS Results
  // ==========================================================================

  async importFVSResults(
    analysisId: string,
    outputFilePath: string
  ): Promise<{
    projections: FVSProjectionOutput[];
    carbonReports: FVSCarbonReport[];
    summary: {
      startYear: number;
      endYear: number;
      peakCarbon: number;
      peakCarbonYear: number;
      averageGrowthRate: number;
    };
  }> {
    // Read output file
    const content = await fs.readFile(outputFilePath, 'utf-8');

    // Parse projections
    const projections = this.parser.parseSummaryOutput(content);

    // Parse carbon reports if present
    const carbonReports = this.parser.parseCarbonReport(content);

    // Calculate summary statistics
    const allYears = projections.flatMap(p => p.projectionYears);
    const startYear = Math.min(...allYears.map(y => y.year));
    const endYear = Math.max(...allYears.map(y => y.year));

    // Find peak carbon from carbon reports
    let peakCarbon = 0;
    let peakCarbonYear = startYear;
    for (const report of carbonReports) {
      if (report.totalStand > peakCarbon) {
        peakCarbon = report.totalStand;
        peakCarbonYear = report.year;
      }
    }

    // Calculate average growth rate
    const averageGrowthRate = carbonReports.length > 1
      ? (carbonReports[carbonReports.length - 1].totalStand - carbonReports[0].totalStand) /
        (carbonReports[carbonReports.length - 1].year - carbonReports[0].year)
      : 0;

    // Store projections in database
    await this.storeProjections(analysisId, projections, carbonReports);

    return {
      projections,
      carbonReports,
      summary: {
        startYear,
        endYear,
        peakCarbon,
        peakCarbonYear,
        averageGrowthRate,
      },
    };
  }

  // ==========================================================================
  // Generate Growth Scenarios
  // ==========================================================================

  async generateGrowthScenarios(
    analysisId: string,
    scenarios: Array<{
      name: string;
      description: string;
      managementActions: FVSKeyword[];
    }>
  ): Promise<{
    scenarioFiles: Array<{
      name: string;
      keywordFilePath: string;
    }>;
    comparisonReady: boolean;
  }> {
    const scenarioFiles: Array<{ name: string; keywordFilePath: string }> = [];

    for (const scenario of scenarios) {
      // Generate base files
      const { keywordFile, standInfo } = await this.generator.generateFromAnalysis(analysisId);

      // Add scenario-specific keywords
      const modifiedKeywordFile = this.appendCustomKeywords(keywordFile, scenario.managementActions);

      // Write scenario file
      const scenarioFileName = `${standInfo.standId}_${scenario.name.replace(/\s+/g, '_')}.key`;
      const scenarioFilePath = path.join(this.outputDir, scenarioFileName);
      await fs.writeFile(scenarioFilePath, modifiedKeywordFile);

      scenarioFiles.push({
        name: scenario.name,
        keywordFilePath: scenarioFilePath,
      });
    }

    return {
      scenarioFiles,
      comparisonReady: true,
    };
  }

  // ==========================================================================
  // Common Management Scenarios
  // ==========================================================================

  getPresetScenarios(): Array<{
    name: string;
    description: string;
    keywords: FVSKeyword[];
  }> {
    return [
      {
        name: 'No Action',
        description: 'Natural growth with no management intervention',
        keywords: [],
      },
      {
        name: 'Commercial Thinning',
        description: 'Thin to 60 BA from below at year 10',
        keywords: this.generator.generateThinningKeywords({
          year: new Date().getFullYear() + 10,
          targetBasalArea: 60,
          minDbh: 8,
        }),
      },
      {
        name: 'Pre-Commercial Thinning',
        description: 'Early thinning to reduce competition',
        keywords: this.generator.generateThinningKeywords({
          year: new Date().getFullYear() + 5,
          targetTPA: 200,
          maxDbh: 8,
        }),
      },
      {
        name: 'Variable Retention Harvest',
        description: '70% harvest with 30% retention',
        keywords: this.generator.generateHarvestKeywords({
          year: new Date().getFullYear() + 20,
          harvestType: 'shelterwood',
          retentionPercent: 30,
        }),
      },
      {
        name: 'Selection Harvest',
        description: 'Uneven-aged management with periodic selection',
        keywords: this.generator.generateHarvestKeywords({
          year: new Date().getFullYear() + 15,
          harvestType: 'selection',
        }),
      },
      {
        name: 'Carbon Maximization',
        description: 'Extended rotation to maximize carbon storage',
        keywords: [
          { keyword: 'COMMENT', parameters: ['Carbon maximization - no harvest'], comments: 'Extended rotation' },
          // No harvest keywords - just let it grow
        ],
      },
    ];
  }

  // ==========================================================================
  // Batch Processing
  // ==========================================================================

  async exportMultipleAnalyses(
    analysisIds: string[],
    options: {
      projectionYears?: number;
      managementScenario?: 'baseline' | 'thinning' | 'harvest';
    } = {}
  ): Promise<{
    exported: number;
    files: Array<{ analysisId: string; standId: string; files: string[] }>;
    batchScript: string;
  }> {
    const results: Array<{ analysisId: string; standId: string; files: string[] }> = [];

    for (const analysisId of analysisIds) {
      try {
        const { standId, treeFilePath, keywordFilePath } = await this.exportToFVS(
          analysisId,
          options
        );

        results.push({
          analysisId,
          standId,
          files: [treeFilePath, keywordFilePath],
        });
      } catch (error) {
        console.error(`Failed to export analysis ${analysisId}:`, error);
      }
    }

    // Generate batch run script
    const batchScript = this.generateBatchScript(results);
    const batchScriptPath = path.join(this.outputDir, 'run_batch.sh');
    await fs.writeFile(batchScriptPath, batchScript, { mode: 0o755 });

    return {
      exported: results.length,
      files: results,
      batchScript,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private addManagementScenario(
    keywordFile: string,
    scenario: 'baseline' | 'thinning' | 'harvest' | 'custom',
    stand: FVSStandRecord
  ): string {
    const currentYear = new Date().getFullYear();
    let additionalKeywords: string[] = [];

    switch (scenario) {
      case 'thinning':
        additionalKeywords = [
          '!',
          '! Thinning Scenario',
          'THINBA          Thin to target basal area',
          `${currentYear + 10}  60  1  0  0  999`,
        ];
        break;

      case 'harvest':
        additionalKeywords = [
          '!',
          '! Harvest Scenario',
          'THINDBH          Commercial harvest',
          `${currentYear + 20}  0  12  999  0  0`,
        ];
        break;
    }

    if (additionalKeywords.length > 0) {
      // Insert before PROCESS keyword
      const lines = keywordFile.split('\n');
      const processIndex = lines.findIndex(l => l.trim().startsWith('PROCESS'));
      if (processIndex !== -1) {
        lines.splice(processIndex, 0, ...additionalKeywords);
      }
      return lines.join('\n');
    }

    return keywordFile;
  }

  private appendCustomKeywords(keywordFile: string, keywords: FVSKeyword[]): string {
    const lines = keywordFile.split('\n');

    // Find PROCESS keyword to insert before
    const processIndex = lines.findIndex(l => l.trim().startsWith('PROCESS'));

    const customLines: string[] = ['!', '! Custom Management Keywords'];
    for (const kw of keywords) {
      let line = kw.keyword;
      if (kw.comments) {
        line += `          ${kw.comments}`;
      }
      customLines.push(line);
      if (kw.parameters.length > 0) {
        customLines.push(kw.parameters.join('  '));
      }
    }

    if (processIndex !== -1) {
      lines.splice(processIndex, 0, ...customLines);
    } else {
      lines.push(...customLines);
    }

    return lines.join('\n');
  }

  private generateRunScript(
    stand: FVSStandRecord,
    treeFilePath: string,
    keywordFilePath: string
  ): string {
    const variant = stand.variant.toLowerCase();

    return `#!/bin/bash
# FVS Run Script for Stand: ${stand.standId}
# Generated: ${new Date().toISOString()}
# Variant: ${stand.variant}

# Set FVS environment (adjust paths as needed)
export FVS_HOME=\${FVS_HOME:-/usr/local/fvs}
export PATH=\$FVS_HOME/bin:\$PATH

# Input files
TREE_FILE="${treeFilePath}"
KEYWORD_FILE="${keywordFilePath}"
OUTPUT_DIR="${this.outputDir}"

# Run FVS
echo "Running FVS ${stand.variant} variant..."
echo "Stand: ${stand.standId}"
echo "Tree file: \$TREE_FILE"
echo "Keyword file: \$KEYWORD_FILE"

# Check if FVS executable exists
if ! command -v FVS${variant} &> /dev/null; then
    echo "Error: FVS${variant} executable not found"
    echo "Please install FVS or set FVS_HOME environment variable"
    exit 1
fi

# Run simulation
FVS${variant} --keyfile="\$KEYWORD_FILE" \\
              --treefile="\$TREE_FILE" \\
              --output="\$OUTPUT_DIR/${stand.standId}_output.txt" \\
              --database="\$OUTPUT_DIR/${stand.standId}.db"

# Check exit status
if [ $? -eq 0 ]; then
    echo "FVS run completed successfully"
    echo "Output file: \$OUTPUT_DIR/${stand.standId}_output.txt"
    echo "Database: \$OUTPUT_DIR/${stand.standId}.db"
else
    echo "FVS run failed with exit code $?"
    exit 1
fi
`;
  }

  private generateBatchScript(
    results: Array<{ analysisId: string; standId: string; files: string[] }>
  ): string {
    const runCommands = results.map(r =>
      `./run_${r.standId}.sh || echo "Failed: ${r.standId}"`
    ).join('\n');

    return `#!/bin/bash
# FVS Batch Run Script
# Generated: ${new Date().toISOString()}
# Stands: ${results.length}

cd "${this.outputDir}"

echo "Running FVS batch processing for ${results.length} stands..."
echo ""

# Run each stand
${runCommands}

echo ""
echo "Batch processing complete"
echo "Results in: ${this.outputDir}"
`;
  }

  private async storeProjections(
    analysisId: string,
    projections: FVSProjectionOutput[],
    carbonReports: FVSCarbonReport[]
  ): Promise<void> {
    // Update analysis with FVS results
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        metadata: {
          fvsProjections: projections,
          fvsCarbonReports: carbonReports,
          fvsRunDate: new Date().toISOString(),
        },
      },
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFVSService(
  variant?: FVSVariant,
  extensions?: FVSExtensions,
  outputDir?: string
): FVSService {
  return new FVSService(variant, extensions, outputDir);
}

// ============================================================================
// Variant Selection Helper
// ============================================================================

export function selectFVSVariant(state: string, latitude?: number): FVSVariant {
  // Map US states to FVS variants
  const stateVariants: Record<string, FVSVariant> = {
    // Pacific Northwest
    'WA': 'PN', 'OR': 'PN',
    // California
    'CA': 'CA',
    // Inland Northwest
    'ID': 'NI', 'MT': 'EM',
    // Rocky Mountains
    'CO': 'CR', 'WY': 'TT', 'UT': 'UT',
    // Northeast
    'ME': 'NE', 'NH': 'NE', 'VT': 'NE', 'MA': 'NE', 'CT': 'NE', 'RI': 'NE',
    'NY': 'NE', 'PA': 'NE', 'NJ': 'NE',
    // Lake States
    'MN': 'LS', 'WI': 'LS', 'MI': 'LS',
    // Central States
    'OH': 'CS', 'IN': 'CS', 'IL': 'CS', 'MO': 'CS', 'IA': 'CS',
    // Southeast
    'VA': 'SN', 'NC': 'SN', 'SC': 'SN', 'GA': 'SN', 'FL': 'SN',
    'AL': 'SN', 'MS': 'SN', 'LA': 'SN', 'AR': 'SN', 'TN': 'SN', 'KY': 'SN',
    'TX': 'SN', 'OK': 'SN',
    // Alaska
    'AK': 'AK',
  };

  return stateVariants[state.toUpperCase()] || 'PN';
}
