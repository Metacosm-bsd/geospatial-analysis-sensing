/**
 * Trimble Forestry Integration Service
 * Handles data transformation and sync between LiDAR Forest and Trimble
 * Sprint 61-66: Third-Party Integrations
 */

import { PrismaClient } from '@prisma/client';
import {
  TrimbleClient,
  TrimbleCruise,
  TrimblePlot,
  TrimbleTree,
  TrimbleProduct,
  mapToTrimbleSpecies,
  mapFromTrimbleSpecies,
} from './client';

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

export interface TrimbleIntegrationConfig {
  userId: string;
  apiKey: string;
  organizationId: string;
}

export interface ExportResult {
  success: boolean;
  cruiseId?: string;
  plotsExported: number;
  treesExported: number;
  errors: string[];
}

export interface ImportResult {
  success: boolean;
  projectId?: string;
  analysisId?: string;
  treesImported: number;
  errors: string[];
}

// ============================================================================
// Trimble Integration Service
// ============================================================================

export class TrimbleService {
  private client: TrimbleClient;

  constructor(private config: TrimbleIntegrationConfig) {
    this.client = new TrimbleClient({
      apiKey: config.apiKey,
      organizationId: config.organizationId,
    });
  }

  // ==========================================================================
  // Export to Trimble
  // ==========================================================================

  async exportAnalysis(analysisId: string): Promise<ExportResult> {
    const result: ExportResult = {
      success: true,
      plotsExported: 0,
      treesExported: 0,
      errors: [],
    };

    try {
      // Fetch analysis with trees
      const analysis = await prisma.analysis.findUnique({
        where: { id: analysisId },
        include: {
          project: true,
          trees: {
            include: {
              photos: true,
            },
          },
          files: true,
        },
      });

      if (!analysis) {
        result.success = false;
        result.errors.push(`Analysis ${analysisId} not found`);
        return result;
      }

      // Transform to Trimble cruise format
      const cruise = this.transformToCruise(analysis);

      // Create cruise in Trimble
      const createdCruise = await this.client.createCruise(cruise);

      result.cruiseId = createdCruise.cruiseId;
      result.plotsExported = cruise.plots.length;
      result.treesExported = cruise.trees.length;

      // Save mapping
      await prisma.integrationMapping.create({
        data: {
          provider: 'trimble',
          localId: analysisId,
          remoteId: createdCruise.cruiseId,
          entityType: 'analysis',
        },
      });
    } catch (error) {
      result.success = false;
      result.errors.push(`Export failed: ${error}`);
    }

    return result;
  }

  // ==========================================================================
  // Export to CFD File
  // ==========================================================================

  async exportToCFDFile(analysisId: string): Promise<string> {
    // Fetch analysis
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        project: true,
        trees: true,
      },
    });

    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    // Transform to cruise
    const cruise = this.transformToCruise(analysis);

    // Generate CFD XML
    const xmlBuilder = await import('xml2js');
    const builder = new xmlBuilder.Builder({
      rootName: 'TrimbleCFD',
      headless: false,
    });

    return builder.buildObject({
      Header: {
        Version: '3.0',
        ExportDate: new Date().toISOString(),
        Software: 'LidarForest',
        SourceProject: analysis.project.name,
      },
      Cruise: {
        $: { id: cruise.cruiseName },
        Name: cruise.cruiseName,
        Date: cruise.cruiseDate,
        Cruiser: cruise.cruiser,
        Client: cruise.client,
        Location: cruise.location,
        Plots: {
          Plot: cruise.plots.map((p) => ({
            $: { id: p.plotId },
            Number: p.plotNumber,
            Type: p.plotType,
            Shape: p.shape,
            Area: p.area,
            Latitude: p.centerLat,
            Longitude: p.centerLon,
            Radius: p.radius,
          })),
        },
        Trees: {
          Tree: cruise.trees.map((t) => ({
            $: { id: t.treeId },
            PlotId: t.plotId,
            Number: t.treeNumber,
            Species: t.species,
            DBH: t.dbh,
            Height: t.height,
            CrownClass: t.crownClass,
            Products: {
              Product: t.products.map((p) => ({
                Name: p.productName,
                Volume: p.volume,
                Grade: p.grade,
              })),
            },
          })),
        },
      },
    });
  }

  // ==========================================================================
  // Import from Trimble
  // ==========================================================================

  async importCruise(cruiseId: string, targetProjectId: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      treesImported: 0,
      errors: [],
    };

    try {
      // Fetch cruise from Trimble
      const cruise = await this.client.getCruise(cruiseId);

      // Create analysis
      const analysis = await prisma.analysis.create({
        data: {
          name: `Imported: ${cruise.cruiseName}`,
          type: 'IMPORTED',
          status: 'COMPLETED',
          projectId: targetProjectId,
          parameters: {
            source: 'trimble',
            sourceCruiseId: cruiseId,
            cruiseDate: cruise.cruiseDate,
          },
          results: this.client.calculateCruiseSummary(cruise),
        },
      });

      result.analysisId = analysis.id;

      // Import trees
      const treeCreateData = cruise.trees.map((tree) => {
        const plot = cruise.plots.find((p) => p.plotId === tree.plotId);

        return {
          analysisId: analysis.id,
          treeNumber: tree.treeNumber,
          speciesCode: mapFromTrimbleSpecies(tree.species),
          dbh: tree.dbh,
          height: tree.height || null,
          merchantableHeight: tree.merchantableHeight || null,
          crownClass: this.mapTrimbleCrownClass(tree.crownClass),
          latitude: plot?.centerLat || 0,
          longitude: plot?.centerLon || 0,
          volume: tree.products.reduce((sum, p) => sum + p.volume, 0),
        };
      });

      await prisma.tree.createMany({
        data: treeCreateData,
      });

      result.treesImported = treeCreateData.length;

      // Save mapping
      await prisma.integrationMapping.create({
        data: {
          provider: 'trimble',
          localId: analysis.id,
          remoteId: cruiseId,
          entityType: 'analysis',
        },
      });
    } catch (error) {
      result.success = false;
      result.errors.push(`Import failed: ${error}`);
    }

    return result;
  }

  // ==========================================================================
  // Import from CFD File
  // ==========================================================================

  async importFromCFDFile(cfdXml: string, targetProjectId: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      treesImported: 0,
      errors: [],
    };

    try {
      const xml2js = await import('xml2js');
      const parser = new xml2js.Parser({ explicitArray: false });
      const parsed = await parser.parseStringPromise(cfdXml);

      const cruiseData = parsed.TrimbleCFD.Cruise;

      // Create analysis
      const analysis = await prisma.analysis.create({
        data: {
          name: `Imported: ${cruiseData.Name}`,
          type: 'IMPORTED',
          status: 'COMPLETED',
          projectId: targetProjectId,
          parameters: {
            source: 'trimble_cfd',
            cruiseName: cruiseData.Name,
            cruiseDate: cruiseData.Date,
          },
          results: {},
        },
      });

      result.analysisId = analysis.id;

      // Parse and import trees
      const plots = Array.isArray(cruiseData.Plots.Plot)
        ? cruiseData.Plots.Plot
        : [cruiseData.Plots.Plot];

      const trees = Array.isArray(cruiseData.Trees.Tree)
        ? cruiseData.Trees.Tree
        : [cruiseData.Trees.Tree];

      const treeCreateData = trees.map((tree: any) => {
        const plot = plots.find((p: any) => p.$.id === tree.PlotId);

        return {
          analysisId: analysis.id,
          treeNumber: parseInt(tree.Number, 10),
          speciesCode: mapFromTrimbleSpecies(tree.Species),
          dbh: parseFloat(tree.DBH),
          height: tree.Height ? parseFloat(tree.Height) : null,
          crownClass: this.mapTrimbleCrownClass(tree.CrownClass),
          latitude: plot ? parseFloat(plot.Latitude) : 0,
          longitude: plot ? parseFloat(plot.Longitude) : 0,
        };
      });

      await prisma.tree.createMany({
        data: treeCreateData,
      });

      result.treesImported = treeCreateData.length;
    } catch (error) {
      result.success = false;
      result.errors.push(`CFD import failed: ${error}`);
    }

    return result;
  }

  // ==========================================================================
  // Export to CSV
  // ==========================================================================

  async exportToCSV(analysisId: string): Promise<string> {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        project: true,
        trees: true,
      },
    });

    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const headers = [
      'TreeNumber',
      'Species',
      'SpeciesCode',
      'DBH_cm',
      'Height_m',
      'CrownClass',
      'HealthStatus',
      'Latitude',
      'Longitude',
    ];

    const rows = analysis.trees.map((tree) => [
      tree.treeNumber,
      tree.speciesCommonName || '',
      tree.speciesCode || '',
      tree.dbh.toFixed(1),
      tree.height?.toFixed(1) || '',
      tree.crownClass || '',
      tree.healthStatus || '',
      tree.latitude?.toFixed(6) || '',
      tree.longitude?.toFixed(6) || '',
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  // ==========================================================================
  // Data Transformation
  // ==========================================================================

  private transformToCruise(analysis: any): Omit<TrimbleCruise, 'cruiseId'> {
    const plotMap = new Map<string, TrimblePlot>();
    const trees: TrimbleTree[] = [];

    // Group trees by plot
    for (const tree of analysis.trees) {
      const plotId = tree.plotId || 'default';

      if (!plotMap.has(plotId)) {
        plotMap.set(plotId, {
          plotId,
          plotNumber: plotId === 'default' ? '1' : plotId,
          plotType: 'fixed',
          shape: 'circular',
          area: 400, // Default 0.04 ha plot
          centerLat: tree.latitude || 0,
          centerLon: tree.longitude || 0,
          radius: 11.28, // ~400 m² circular plot
        });
      }

      trees.push({
        treeId: tree.id,
        plotId,
        treeNumber: tree.treeNumber,
        species: mapToTrimbleSpecies(tree.speciesCode || 'UNK'),
        dbh: tree.dbh,
        height: tree.height,
        merchantableHeight: tree.merchantableHeight,
        crownClass: this.mapToCrownClassCode(tree.crownClass),
        products: this.calculateProducts(tree),
      });
    }

    return {
      cruiseName: `${analysis.project.name} - ${analysis.name}`,
      cruiseDate: analysis.createdAt.toISOString().split('T')[0],
      cruiser: 'LidarForest',
      client: analysis.project.organizationName || 'Unknown',
      location: analysis.project.location || 'Unknown',
      plots: Array.from(plotMap.values()),
      trees,
      summary: {
        totalPlots: plotMap.size,
        totalTrees: trees.length,
        meanDbh: trees.length > 0 ? trees.reduce((s, t) => s + t.dbh, 0) / trees.length : 0,
        meanHeight: trees.filter((t) => t.height).length > 0
          ? trees.reduce((s, t) => s + (t.height || 0), 0) / trees.filter((t) => t.height).length
          : 0,
        basalAreaPerHectare: 0, // Calculate based on plot areas
        volumePerHectare: 0,
        treesPerHectare: 0,
      },
    };
  }

  private mapToCrownClassCode(crownClass: string | null): 'D' | 'C' | 'I' | 'S' | 'O' {
    const mapping: Record<string, 'D' | 'C' | 'I' | 'S' | 'O'> = {
      dominant: 'D',
      codominant: 'C',
      intermediate: 'I',
      suppressed: 'S',
      overtopped: 'O',
    };
    return mapping[crownClass || ''] || 'C';
  }

  private mapTrimbleCrownClass(code: string): string {
    const mapping: Record<string, string> = {
      D: 'dominant',
      C: 'codominant',
      I: 'intermediate',
      S: 'suppressed',
      O: 'suppressed',
    };
    return mapping[code] || 'unknown';
  }

  private calculateProducts(tree: any): TrimbleProduct[] {
    // Calculate estimated volume using standard equations
    if (!tree.dbh || !tree.height) {
      return [];
    }

    // Simplified volume calculation (Scribner board feet converted to m³)
    const dbhInches = tree.dbh / 2.54;
    const heightFeet = tree.height * 3.28084;

    // Basic taper equation estimate
    const volumeBf = 0.9 * Math.pow(dbhInches, 2) * heightFeet * 0.01;
    const volumeM3 = volumeBf * 0.00235974; // BF to m³

    return [
      {
        productName: 'Sawlog',
        volume: volumeM3,
        grade: tree.healthStatus === 'healthy' ? '1' : '3',
      },
    ];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTrimbleService(config: TrimbleIntegrationConfig): TrimbleService {
  return new TrimbleService(config);
}
