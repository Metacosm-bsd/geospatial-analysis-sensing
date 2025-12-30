/**
 * Forest Metrix API Client
 * Integration with Forest Metrix forest management software
 * Sprint 61-66: Third-Party Integrations
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// ============================================================================
// Types
// ============================================================================

export interface ForestMetrixConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  timeout?: number;
}

export interface ForestMetrixProject {
  id: string;
  name: string;
  description?: string;
  ownerName: string;
  propertyAcreage: number;
  state: string;
  county: string;
  createdDate: string;
  lastModifiedDate: string;
}

export interface ForestMetrixStand {
  id: string;
  projectId: string;
  standNumber: string;
  acres: number;
  siteIndex: number;
  ageClass: string;
  forestType: string;
  stockingPercent: number;
  basalArea: number;
  treesPerAcre: number;
}

export interface ForestMetrixTree {
  id: string;
  standId: string;
  plotNumber: string;
  treeNumber: number;
  species: string; // FIA species code
  dbh: number; // inches
  totalHeight: number; // feet
  crownRatio: number; // percentage
  treeGrade: string;
  defectCode?: string;
}

export interface ForestMetrixInventory {
  project: ForestMetrixProject;
  stands: ForestMetrixStand[];
  trees: ForestMetrixTree[];
  summaryDate: string;
}

export interface ExportOptions {
  projectId: string;
  includePhotos?: boolean;
  format?: 'json' | 'csv' | 'shapefile';
  units?: 'metric' | 'imperial';
}

export interface ImportResult {
  success: boolean;
  projectId?: string;
  standsImported: number;
  treesImported: number;
  warnings: string[];
  errors: string[];
}

// ============================================================================
// Forest Metrix Client
// ============================================================================

export class ForestMetrixClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(private config: ForestMetrixConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.forestmetrix.com/v2',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LidarForest/1.0',
      },
    });

    this.client.interceptors.request.use(async (config) => {
      const token = await this.getAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Request new token
    const response = await axios.post(
      `${this.config.baseUrl || 'https://api.forestmetrix.com/v2'}/auth/token`,
      {
        grant_type: 'client_credentials',
        client_id: this.config.apiKey,
        client_secret: this.config.apiSecret,
      }
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 60) * 1000);

    return this.accessToken;
  }

  // ==========================================================================
  // Projects
  // ==========================================================================

  async listProjects(params?: {
    page?: number;
    limit?: number;
    state?: string;
  }): Promise<{ projects: ForestMetrixProject[]; total: number }> {
    const response = await this.client.get('/projects', { params });
    return {
      projects: response.data.data,
      total: response.data.meta.total,
    };
  }

  async getProject(projectId: string): Promise<ForestMetrixProject> {
    const response = await this.client.get(`/projects/${projectId}`);
    return response.data;
  }

  async createProject(project: Omit<ForestMetrixProject, 'id' | 'createdDate' | 'lastModifiedDate'>): Promise<ForestMetrixProject> {
    const response = await this.client.post('/projects', project);
    return response.data;
  }

  // ==========================================================================
  // Stands
  // ==========================================================================

  async getStands(projectId: string): Promise<ForestMetrixStand[]> {
    const response = await this.client.get(`/projects/${projectId}/stands`);
    return response.data.data;
  }

  async createStand(projectId: string, stand: Omit<ForestMetrixStand, 'id' | 'projectId'>): Promise<ForestMetrixStand> {
    const response = await this.client.post(`/projects/${projectId}/stands`, stand);
    return response.data;
  }

  // ==========================================================================
  // Trees
  // ==========================================================================

  async getTrees(standId: string): Promise<ForestMetrixTree[]> {
    const response = await this.client.get(`/stands/${standId}/trees`);
    return response.data.data;
  }

  async createTree(standId: string, tree: Omit<ForestMetrixTree, 'id' | 'standId'>): Promise<ForestMetrixTree> {
    const response = await this.client.post(`/stands/${standId}/trees`, tree);
    return response.data;
  }

  async bulkCreateTrees(standId: string, trees: Omit<ForestMetrixTree, 'id' | 'standId'>[]): Promise<ForestMetrixTree[]> {
    const response = await this.client.post(`/stands/${standId}/trees/bulk`, { trees });
    return response.data.data;
  }

  // ==========================================================================
  // Full Inventory Export/Import
  // ==========================================================================

  async exportInventory(projectId: string): Promise<ForestMetrixInventory> {
    const [project, stands] = await Promise.all([
      this.getProject(projectId),
      this.getStands(projectId),
    ]);

    // Fetch trees for each stand
    const treesPromises = stands.map((stand) => this.getTrees(stand.id));
    const treesArrays = await Promise.all(treesPromises);
    const trees = treesArrays.flat();

    return {
      project,
      stands,
      trees,
      summaryDate: new Date().toISOString(),
    };
  }

  async importInventory(inventory: ForestMetrixInventory): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      standsImported: 0,
      treesImported: 0,
      warnings: [],
      errors: [],
    };

    try {
      // Create project
      const project = await this.createProject({
        name: inventory.project.name,
        description: inventory.project.description,
        ownerName: inventory.project.ownerName,
        propertyAcreage: inventory.project.propertyAcreage,
        state: inventory.project.state,
        county: inventory.project.county,
      });

      result.projectId = project.id;

      // Create stands
      for (const stand of inventory.stands) {
        try {
          const newStand = await this.createStand(project.id, {
            standNumber: stand.standNumber,
            acres: stand.acres,
            siteIndex: stand.siteIndex,
            ageClass: stand.ageClass,
            forestType: stand.forestType,
            stockingPercent: stand.stockingPercent,
            basalArea: stand.basalArea,
            treesPerAcre: stand.treesPerAcre,
          });

          result.standsImported++;

          // Get trees for this stand
          const standTrees = inventory.trees.filter((t) => t.standId === stand.id);

          if (standTrees.length > 0) {
            // Bulk create trees
            const createdTrees = await this.bulkCreateTrees(
              newStand.id,
              standTrees.map((t) => ({
                plotNumber: t.plotNumber,
                treeNumber: t.treeNumber,
                species: t.species,
                dbh: t.dbh,
                totalHeight: t.totalHeight,
                crownRatio: t.crownRatio,
                treeGrade: t.treeGrade,
                defectCode: t.defectCode,
              }))
            );

            result.treesImported += createdTrees.length;
          }
        } catch (error) {
          result.warnings.push(`Failed to import stand ${stand.standNumber}: ${error}`);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Import failed: ${error}`);
    }

    return result;
  }
}

// ============================================================================
// Unit Conversion Utilities
// ============================================================================

export const UnitConversion = {
  // Length
  cmToInches: (cm: number): number => cm / 2.54,
  inchesToCm: (inches: number): number => inches * 2.54,
  metersToFeet: (m: number): number => m * 3.28084,
  feetToMeters: (ft: number): number => ft / 3.28084,

  // Area
  hectaresToAcres: (ha: number): number => ha * 2.47105,
  acresToHectares: (acres: number): number => acres / 2.47105,

  // Volume
  cubicMetersToCubicFeet: (m3: number): number => m3 * 35.3147,
  cubicFeetToCubicMeters: (cf: number): number => cf / 35.3147,
};
