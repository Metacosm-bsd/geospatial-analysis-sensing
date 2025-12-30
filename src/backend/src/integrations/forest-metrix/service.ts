/**
 * Forest Metrix Integration Service
 * Handles data transformation and sync between LiDAR Forest and Forest Metrix
 * Sprint 61-66: Third-Party Integrations
 */

import { PrismaClient } from '@prisma/client';
import {
  ForestMetrixClient,
  ForestMetrixInventory,
  ForestMetrixProject,
  ForestMetrixStand,
  ForestMetrixTree,
  UnitConversion,
} from './client';

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
  success: boolean;
  exported: {
    projects: number;
    stands: number;
    trees: number;
  };
  imported: {
    projects: number;
    stands: number;
    trees: number;
  };
  errors: string[];
  warnings: string[];
  syncedAt: string;
}

export interface IntegrationConfig {
  userId: string;
  apiKey: string;
  apiSecret: string;
  autoSync: boolean;
  syncDirection: 'export' | 'import' | 'bidirectional';
  lastSyncAt?: string;
}

// ============================================================================
// Forest Metrix Integration Service
// ============================================================================

export class ForestMetrixService {
  private client: ForestMetrixClient;

  constructor(config: IntegrationConfig) {
    this.client = new ForestMetrixClient({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
    });
  }

  // ==========================================================================
  // Export to Forest Metrix
  // ==========================================================================

  async exportProject(projectId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      exported: { projects: 0, stands: 0, trees: 0 },
      imported: { projects: 0, stands: 0, trees: 0 },
      errors: [],
      warnings: [],
      syncedAt: new Date().toISOString(),
    };

    try {
      // Fetch project from our database
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          analyses: {
            include: {
              trees: true,
            },
          },
        },
      });

      if (!project) {
        result.success = false;
        result.errors.push(`Project ${projectId} not found`);
        return result;
      }

      // Transform to Forest Metrix format
      const fmInventory = this.transformToForestMetrix(project);

      // Import to Forest Metrix
      const importResult = await this.client.importInventory(fmInventory);

      if (importResult.success) {
        result.exported.projects = 1;
        result.exported.stands = importResult.standsImported;
        result.exported.trees = importResult.treesImported;

        // Store the mapping for future syncs
        await this.saveExportMapping(projectId, importResult.projectId!);
      } else {
        result.success = false;
        result.errors.push(...importResult.errors);
      }

      result.warnings.push(...importResult.warnings);
    } catch (error) {
      result.success = false;
      result.errors.push(`Export failed: ${error}`);
    }

    return result;
  }

  // ==========================================================================
  // Import from Forest Metrix
  // ==========================================================================

  async importProject(forestMetrixProjectId: string, targetUserId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      exported: { projects: 0, stands: 0, trees: 0 },
      imported: { projects: 0, stands: 0, trees: 0 },
      errors: [],
      warnings: [],
      syncedAt: new Date().toISOString(),
    };

    try {
      // Fetch inventory from Forest Metrix
      const fmInventory = await this.client.exportInventory(forestMetrixProjectId);

      // Transform to our format
      const transformedData = this.transformFromForestMetrix(fmInventory);

      // Create project in our database
      const project = await prisma.project.create({
        data: {
          name: transformedData.name,
          description: transformedData.description,
          userId: targetUserId,
          metadata: {
            source: 'forest_metrix',
            sourceProjectId: forestMetrixProjectId,
            importedAt: new Date().toISOString(),
          },
        },
      });

      result.imported.projects = 1;

      // Create analysis with trees
      if (transformedData.trees.length > 0) {
        const analysis = await prisma.analysis.create({
          data: {
            name: `Imported Inventory - ${new Date().toISOString().split('T')[0]}`,
            type: 'IMPORTED',
            status: 'COMPLETED',
            projectId: project.id,
            parameters: { source: 'forest_metrix' },
            results: {
              treeCount: transformedData.trees.length,
              standCount: fmInventory.stands.length,
            },
          },
        });

        // Batch insert trees
        const treeCreateData = transformedData.trees.map((tree) => ({
          analysisId: analysis.id,
          treeNumber: tree.treeNumber,
          speciesCode: tree.speciesCode,
          dbh: tree.dbh,
          height: tree.height,
          crownDiameter: tree.crownDiameter,
          crownClass: tree.crownClass,
          healthStatus: tree.healthStatus,
          latitude: tree.latitude,
          longitude: tree.longitude,
        }));

        await prisma.tree.createMany({
          data: treeCreateData,
        });

        result.imported.trees = treeCreateData.length;
        result.imported.stands = fmInventory.stands.length;
      }

      // Save import mapping
      await this.saveImportMapping(forestMetrixProjectId, project.id);
    } catch (error) {
      result.success = false;
      result.errors.push(`Import failed: ${error}`);
    }

    return result;
  }

  // ==========================================================================
  // List Available Projects
  // ==========================================================================

  async listForestMetrixProjects(params?: { page?: number; limit?: number }): Promise<{
    projects: ForestMetrixProject[];
    total: number;
  }> {
    return this.client.listProjects(params);
  }

  // ==========================================================================
  // Data Transformation
  // ==========================================================================

  private transformToForestMetrix(project: any): ForestMetrixInventory {
    // Group trees by stand/plot
    const standMap = new Map<string, ForestMetrixStand>();
    const trees: ForestMetrixTree[] = [];

    for (const analysis of project.analyses) {
      for (const tree of analysis.trees) {
        const standId = tree.plotId || 'default';

        if (!standMap.has(standId)) {
          standMap.set(standId, {
            id: standId,
            projectId: project.id,
            standNumber: standId === 'default' ? '1' : standId,
            acres: 0, // Will be calculated or set from plot
            siteIndex: 0,
            ageClass: 'unknown',
            forestType: 'mixed',
            stockingPercent: 100,
            basalArea: 0,
            treesPerAcre: 0,
          });
        }

        trees.push({
          id: tree.id,
          standId,
          plotNumber: tree.plotNumber || '1',
          treeNumber: tree.treeNumber,
          species: this.mapToFIASpeciesCode(tree.speciesCode),
          dbh: UnitConversion.cmToInches(tree.dbh),
          totalHeight: UnitConversion.metersToFeet(tree.height || 0),
          crownRatio: this.calculateCrownRatio(tree),
          treeGrade: this.mapToTreeGrade(tree),
          defectCode: this.mapDefects(tree.defects),
        });
      }
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        ownerName: project.organization?.name || 'Unknown',
        propertyAcreage: this.calculateTotalAcres(project),
        state: project.state || 'XX',
        county: project.county || 'Unknown',
        createdDate: project.createdAt,
        lastModifiedDate: project.updatedAt,
      },
      stands: Array.from(standMap.values()),
      trees,
      summaryDate: new Date().toISOString(),
    };
  }

  private transformFromForestMetrix(inventory: ForestMetrixInventory): {
    name: string;
    description: string;
    trees: Array<{
      treeNumber: number;
      speciesCode: string;
      dbh: number;
      height: number;
      crownDiameter: number;
      crownClass: string;
      healthStatus: string;
      latitude: number;
      longitude: number;
    }>;
  } {
    const trees = inventory.trees.map((tree, index) => ({
      treeNumber: tree.treeNumber,
      speciesCode: tree.species,
      dbh: UnitConversion.inchesToCm(tree.dbh),
      height: UnitConversion.feetToMeters(tree.totalHeight),
      crownDiameter: 0, // Not provided by Forest Metrix
      crownClass: this.mapCrownRatioToClass(tree.crownRatio),
      healthStatus: tree.defectCode ? 'declining' : 'healthy',
      latitude: 0, // Not provided by Forest Metrix - would need GPS data
      longitude: 0,
    }));

    return {
      name: inventory.project.name,
      description: inventory.project.description || `Imported from Forest Metrix on ${inventory.summaryDate}`,
      trees,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private mapToFIASpeciesCode(speciesCode: string): string {
    // Map our species codes to FIA codes
    const mapping: Record<string, string> = {
      PSME: '202', // Douglas-fir
      ABGR: '017', // Grand fir
      PIPO: '122', // Ponderosa pine
      THPL: '242', // Western redcedar
      TSHE: '263', // Western hemlock
      PICO: '108', // Lodgepole pine
      LAOC: '073', // Western larch
      ACMA: '312', // Bigleaf maple
      ALRU: '351', // Red alder
      QUGA: '807', // Oregon white oak
    };

    return mapping[speciesCode] || speciesCode;
  }

  private calculateCrownRatio(tree: any): number {
    if (tree.crownDiameter && tree.height) {
      // Estimate crown ratio from crown diameter and height
      return Math.min(100, Math.round((tree.crownDiameter / tree.height) * 100));
    }
    return 50; // Default
  }

  private mapToTreeGrade(tree: any): string {
    // Map health status and defects to tree grade
    if (tree.healthStatus === 'dead') return 'CULL';
    if (tree.healthStatus === 'declining') return '4';
    if (tree.defects && tree.defects.length > 0) return '3';
    return '1'; // Best grade
  }

  private mapDefects(defects: any[]): string | undefined {
    if (!defects || defects.length === 0) return undefined;

    const defectCodes: Record<string, string> = {
      rot: 'ROT',
      damage: 'DMG',
      fork: 'FRK',
      lean: 'LEN',
      broken_top: 'BRK',
      fire_scar: 'FSC',
    };

    return defects.map((d) => defectCodes[d.type] || 'OTH').join(',');
  }

  private mapCrownRatioToClass(crownRatio: number): string {
    if (crownRatio >= 70) return 'dominant';
    if (crownRatio >= 50) return 'codominant';
    if (crownRatio >= 30) return 'intermediate';
    return 'suppressed';
  }

  private calculateTotalAcres(project: any): number {
    // Calculate from boundary if available
    if (project.boundaryGeoJSON) {
      // Would use turf.js to calculate area
      return 0;
    }
    return 0;
  }

  private async saveExportMapping(localProjectId: string, remoteProjectId: string): Promise<void> {
    await prisma.integrationMapping.upsert({
      where: {
        provider_localId: {
          provider: 'forest_metrix',
          localId: localProjectId,
        },
      },
      create: {
        provider: 'forest_metrix',
        localId: localProjectId,
        remoteId: remoteProjectId,
        entityType: 'project',
      },
      update: {
        remoteId: remoteProjectId,
        lastSyncedAt: new Date(),
      },
    });
  }

  private async saveImportMapping(remoteProjectId: string, localProjectId: string): Promise<void> {
    await prisma.integrationMapping.create({
      data: {
        provider: 'forest_metrix',
        localId: localProjectId,
        remoteId: remoteProjectId,
        entityType: 'project',
      },
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createForestMetrixService(config: IntegrationConfig): ForestMetrixService {
  return new ForestMetrixService(config);
}
