/**
 * Trimble Forestry Integration Client
 * Integration with Trimble Forestry software suite
 * Sprint 61-66: Third-Party Integrations
 */

import axios, { AxiosInstance } from 'axios';
import * as xml2js from 'xml2js';

// ============================================================================
// Types
// ============================================================================

export interface TrimbleConfig {
  apiKey: string;
  organizationId: string;
  baseUrl?: string;
  timeout?: number;
}

export interface TrimblePlot {
  plotId: string;
  plotNumber: string;
  plotType: 'fixed' | 'variable' | 'prism';
  shape: 'circular' | 'rectangular' | 'polygon';
  area: number; // square meters
  centerLat: number;
  centerLon: number;
  radius?: number; // meters for circular plots
  bafFactor?: number; // for variable radius plots
}

export interface TrimbleTree {
  treeId: string;
  plotId: string;
  treeNumber: number;
  species: string;
  dbh: number; // cm
  height?: number; // meters
  merchantableHeight?: number;
  crownClass: 'D' | 'C' | 'I' | 'S' | 'O'; // Dominant, Codominant, Intermediate, Suppressed, Overtopped
  treeFactor?: number; // expansion factor for variable plots
  products: TrimbleProduct[];
}

export interface TrimbleProduct {
  productName: string;
  volume: number; // cubic meters
  grade: string;
}

export interface TrimbleCruise {
  cruiseId: string;
  cruiseName: string;
  cruiseDate: string;
  cruiser: string;
  client: string;
  location: string;
  plots: TrimblePlot[];
  trees: TrimbleTree[];
  summary: TrimbleCruiseSummary;
}

export interface TrimbleCruiseSummary {
  totalPlots: number;
  totalTrees: number;
  meanDbh: number;
  meanHeight: number;
  basalAreaPerHectare: number;
  volumePerHectare: number;
  treesPerHectare: number;
}

// Trimble CFD (Cruise Field Data) format
export interface TrimbleCFDExport {
  header: {
    version: string;
    exportDate: string;
    software: string;
  };
  cruise: TrimbleCruise;
}

// ============================================================================
// Trimble Client
// ============================================================================

export class TrimbleClient {
  private client: AxiosInstance;
  private xmlBuilder: xml2js.Builder;
  private xmlParser: xml2js.Parser;

  constructor(private config: TrimbleConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.trimble-forestry.com/v1',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        'X-Organization-Id': config.organizationId,
      },
    });

    this.xmlBuilder = new xml2js.Builder({
      rootName: 'TrimbleCFD',
      headless: false,
      renderOpts: { pretty: true },
    });

    this.xmlParser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
    });
  }

  // ==========================================================================
  // Cruise Operations
  // ==========================================================================

  async listCruises(params?: {
    fromDate?: string;
    toDate?: string;
    client?: string;
  }): Promise<TrimbleCruise[]> {
    const response = await this.client.get('/cruises', { params });
    return response.data.cruises;
  }

  async getCruise(cruiseId: string): Promise<TrimbleCruise> {
    const response = await this.client.get(`/cruises/${cruiseId}`);
    return response.data;
  }

  async createCruise(cruise: Omit<TrimbleCruise, 'cruiseId'>): Promise<TrimbleCruise> {
    const response = await this.client.post('/cruises', cruise);
    return response.data;
  }

  async updateCruise(cruiseId: string, updates: Partial<TrimbleCruise>): Promise<TrimbleCruise> {
    const response = await this.client.patch(`/cruises/${cruiseId}`, updates);
    return response.data;
  }

  // ==========================================================================
  // CFD File Export/Import
  // ==========================================================================

  async exportToCFD(cruiseId: string): Promise<string> {
    const cruise = await this.getCruise(cruiseId);

    const cfdData: TrimbleCFDExport = {
      header: {
        version: '3.0',
        exportDate: new Date().toISOString(),
        software: 'LidarForest',
      },
      cruise,
    };

    return this.xmlBuilder.buildObject(cfdData);
  }

  async importFromCFD(cfdXml: string): Promise<TrimbleCruise> {
    const parsed = await this.xmlParser.parseStringPromise(cfdXml);
    const cfdData = parsed.TrimbleCFD as TrimbleCFDExport;

    // Create cruise in Trimble
    const cruise = await this.createCruise(cfdData.cruise);

    return cruise;
  }

  // ==========================================================================
  // Export to Standard Formats
  // ==========================================================================

  async exportToCSV(cruiseId: string): Promise<string> {
    const cruise = await this.getCruise(cruiseId);

    const headers = [
      'PlotNumber',
      'TreeNumber',
      'Species',
      'DBH_cm',
      'Height_m',
      'CrownClass',
      'Grade',
      'Volume_m3',
      'Latitude',
      'Longitude',
    ];

    const rows = cruise.trees.map((tree) => {
      const plot = cruise.plots.find((p) => p.plotId === tree.plotId);
      const totalVolume = tree.products.reduce((sum, p) => sum + p.volume, 0);

      return [
        plot?.plotNumber || '',
        tree.treeNumber,
        tree.species,
        tree.dbh.toFixed(1),
        tree.height?.toFixed(1) || '',
        tree.crownClass,
        tree.products[0]?.grade || '',
        totalVolume.toFixed(3),
        plot?.centerLat.toFixed(6) || '',
        plot?.centerLon.toFixed(6) || '',
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  // ==========================================================================
  // Timber Cruise Analysis
  // ==========================================================================

  calculateCruiseSummary(cruise: TrimbleCruise): TrimbleCruiseSummary {
    const trees = cruise.trees;
    const plots = cruise.plots;

    if (trees.length === 0) {
      return {
        totalPlots: plots.length,
        totalTrees: 0,
        meanDbh: 0,
        meanHeight: 0,
        basalAreaPerHectare: 0,
        volumePerHectare: 0,
        treesPerHectare: 0,
      };
    }

    // Calculate mean DBH
    const totalDbh = trees.reduce((sum, t) => sum + t.dbh, 0);
    const meanDbh = totalDbh / trees.length;

    // Calculate mean height (only for trees with height)
    const treesWithHeight = trees.filter((t) => t.height);
    const meanHeight = treesWithHeight.length > 0
      ? treesWithHeight.reduce((sum, t) => sum + t.height!, 0) / treesWithHeight.length
      : 0;

    // Calculate total plot area in hectares
    const totalPlotArea = plots.reduce((sum, p) => sum + p.area / 10000, 0);

    // Calculate basal area (sum of tree cross-sectional areas at DBH)
    const totalBasalArea = trees.reduce((sum, t) => {
      const radiusCm = t.dbh / 2;
      const areaCm2 = Math.PI * radiusCm * radiusCm;
      const areaM2 = areaCm2 / 10000;
      return sum + areaM2 * (t.treeFactor || 1);
    }, 0);

    // Calculate total volume
    const totalVolume = trees.reduce((sum, t) => {
      return sum + t.products.reduce((pSum, p) => pSum + p.volume, 0) * (t.treeFactor || 1);
    }, 0);

    // Per hectare calculations
    const expansionFactor = totalPlotArea > 0 ? 1 / totalPlotArea : 0;

    return {
      totalPlots: plots.length,
      totalTrees: trees.length,
      meanDbh,
      meanHeight,
      basalAreaPerHectare: totalBasalArea * expansionFactor,
      volumePerHectare: totalVolume * expansionFactor,
      treesPerHectare: trees.length * expansionFactor,
    };
  }
}

// ============================================================================
// Species Code Mapping
// ============================================================================

export const TrimbleSpeciesCodes: Record<string, { code: string; name: string }> = {
  PSME: { code: 'DF', name: 'Douglas-fir' },
  ABGR: { code: 'GF', name: 'Grand Fir' },
  PIPO: { code: 'PP', name: 'Ponderosa Pine' },
  THPL: { code: 'RC', name: 'Western Redcedar' },
  TSHE: { code: 'WH', name: 'Western Hemlock' },
  PICO: { code: 'LP', name: 'Lodgepole Pine' },
  LAOC: { code: 'WL', name: 'Western Larch' },
  ACMA: { code: 'BM', name: 'Bigleaf Maple' },
  ALRU: { code: 'RA', name: 'Red Alder' },
};

export function mapToTrimbleSpecies(ourCode: string): string {
  return TrimbleSpeciesCodes[ourCode]?.code || ourCode;
}

export function mapFromTrimbleSpecies(trimbleCode: string): string {
  for (const [ourCode, trimble] of Object.entries(TrimbleSpeciesCodes)) {
    if (trimble.code === trimbleCode) return ourCode;
  }
  return trimbleCode;
}
