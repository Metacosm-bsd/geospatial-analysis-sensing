/**
 * Climate Action Reserve (CAR) Registry Integration
 * Export carbon project data to CAR format
 * Sprint 61-66: Third-Party Integrations
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// Types - CAR Forest Protocol Data Model
// ============================================================================

export interface CARProject {
  projectId: string;
  projectName: string;
  projectDeveloper: string;
  projectType: CARProjectType;
  protocol: CARProtocol;
  projectLocation: {
    state: string;
    county: string;
    latitude: number;
    longitude: number;
  };
  forestArea: number; // acres
  credingPeriodYears: number;
  baselineCarbon: number; // tCO2e
  projectCarbon: number; // tCO2e
  registrationDate: string;
}

export type CARProjectType =
  | 'avoided_conversion'
  | 'improved_forest_management'
  | 'reforestation'
  | 'urban_forest';

export type CARProtocol =
  | 'forest_project_protocol_v5.0'
  | 'urban_forest_protocol_v2.0'
  | 'mexico_forest_protocol_v2.0';

export interface CARInventoryReport {
  reportId: string;
  projectId: string;
  reportingPeriod: {
    start: string;
    end: string;
  };
  inventoryMethod: 'direct_sampling' | 'remote_sensing' | 'hybrid';
  carbonPools: CARCarbonPools;
  harvestData?: CARHarvestData;
  growthEstimates: CARGrowthEstimates;
  uncertaintyAssessment: CARUncertainty;
}

export interface CARCarbonPools {
  standingLiveTrees: {
    aboveGround: number; // tCO2e
    belowGround: number; // tCO2e
    total: number;
  };
  standingDeadTrees: {
    snags: number; // tCO2e
    stumps: number; // tCO2e
    total: number;
  };
  lyingDeadWood: number; // tCO2e
  shrubsAndUnderstory: number; // tCO2e
  forestFloorLitter: number; // tCO2e
  totalAboveGround: number;
  totalBelowGround: number;
  totalOnsite: number;
}

export interface CARHarvestData {
  volumeHarvested: number; // MBF or m³
  harvestType: 'clearcut' | 'selective' | 'thinning';
  harvestDate: string;
  inUseCarbonTransferred: number; // tCO2e
}

export interface CARGrowthEstimates {
  annualGrowthRate: number; // tCO2e/year
  projectedGrowth5Year: number;
  projectedGrowth10Year: number;
  siteIndex: number;
  standAge: number;
}

export interface CARUncertainty {
  samplingUncertainty: number; // percentage
  measurementUncertainty: number; // percentage
  allometricUncertainty: number; // percentage
  totalUncertainty: number; // percentage
  confidenceDeduction: number; // percentage deducted from credits
}

export interface CARCreditIssuance {
  serialNumberStart: string;
  serialNumberEnd: string;
  vintage: number;
  quantityIssued: number;
  bufferPoolContribution: number;
  netCredits: number;
  verificationBody: string;
  issuanceDate: string;
}

// ============================================================================
// CAR Export Service
// ============================================================================

export class CARExportService {
  // ==========================================================================
  // Generate CAR Project Application
  // ==========================================================================

  async generateProjectApplication(projectId: string): Promise<CARProject> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: true,
        analyses: {
          include: {
            carbonCalculation: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const latestAnalysis = project.analyses[0];
    const carbonCalc = latestAnalysis?.carbonCalculation;

    return {
      projectId: project.id,
      projectName: project.name,
      projectDeveloper: project.organization?.name || 'Unknown',
      projectType: 'improved_forest_management',
      protocol: 'forest_project_protocol_v5.0',
      projectLocation: {
        state: project.metadata?.state || 'Unknown',
        county: project.metadata?.county || 'Unknown',
        latitude: project.metadata?.centerLat || 0,
        longitude: project.metadata?.centerLon || 0,
      },
      forestArea: this.convertHectaresToAcres(project.metadata?.areaHectares || 0),
      credingPeriodYears: 100, // CAR requires 100-year crediting period
      baselineCarbon: carbonCalc?.baselineCarbon || 0,
      projectCarbon: carbonCalc?.totalCarbon || 0,
      registrationDate: new Date().toISOString().split('T')[0],
    };
  }

  // ==========================================================================
  // Generate Inventory Report (Annual Reporting)
  // ==========================================================================

  async generateInventoryReport(
    analysisId: string,
    reportingPeriod: { start: string; end: string }
  ): Promise<CARInventoryReport> {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        project: true,
        carbonCalculation: true,
        trees: true,
      },
    });

    if (!analysis) {
      throw new Error(`Analysis ${analysisId} not found`);
    }

    const carbonCalc = analysis.carbonCalculation;
    const trees = analysis.trees;

    // Calculate carbon pools
    const carbonPools = this.calculateCarbonPools(trees, carbonCalc);

    // Estimate growth
    const growthEstimates = this.estimateGrowth(trees, analysis.project);

    // Assess uncertainty
    const uncertaintyAssessment = this.assessUncertainty(carbonCalc);

    return {
      reportId: `CAR-INV-${analysis.project.id}-${Date.now()}`,
      projectId: analysis.project.id,
      reportingPeriod,
      inventoryMethod: 'hybrid', // LiDAR + field sampling
      carbonPools,
      growthEstimates,
      uncertaintyAssessment,
    };
  }

  // ==========================================================================
  // Generate Credit Issuance Request
  // ==========================================================================

  async generateCreditIssuanceRequest(
    inventoryReport: CARInventoryReport,
    verificationBody: string
  ): Promise<CARCreditIssuance> {
    const vintage = new Date().getFullYear();
    const totalCredits = inventoryReport.carbonPools.totalOnsite;

    // Apply confidence deduction for uncertainty
    const confidenceDeduction = totalCredits * (inventoryReport.uncertaintyAssessment.confidenceDeduction / 100);

    // Buffer pool contribution (varies by project type, typically 15-20%)
    const bufferContribution = (totalCredits - confidenceDeduction) * 0.18;

    const netCredits = totalCredits - confidenceDeduction - bufferContribution;

    const serialStart = `CAR1-${inventoryReport.projectId}-${vintage}-0001`;
    const serialEnd = `CAR1-${inventoryReport.projectId}-${vintage}-${Math.floor(netCredits).toString().padStart(4, '0')}`;

    return {
      serialNumberStart: serialStart,
      serialNumberEnd: serialEnd,
      vintage,
      quantityIssued: netCredits,
      bufferPoolContribution: bufferContribution,
      netCredits,
      verificationBody,
      issuanceDate: new Date().toISOString().split('T')[0],
    };
  }

  // ==========================================================================
  // Export Data Package
  // ==========================================================================

  async exportDataPackage(projectId: string): Promise<{
    application: CARProject;
    inventoryData: object;
    spatialData: object;
    supportingDocs: string[];
  }> {
    const application = await this.generateProjectApplication(projectId);

    // Get latest analysis
    const analysis = await prisma.analysis.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        trees: true,
        carbonCalculation: true,
      },
    });

    const inventoryData = {
      samplingDate: analysis?.createdAt,
      method: 'LiDAR-based individual tree detection with field validation',
      treeList: analysis?.trees.map((t) => ({
        treeNumber: t.treeNumber,
        species: t.speciesCode,
        dbh_inches: this.cmToInches(t.dbh),
        height_feet: this.metersToFeet(t.height || 0),
        crownClass: t.crownClass,
        defect: t.healthStatus !== 'healthy',
      })),
      speciesSummary: this.summarizeBySpecies(analysis?.trees || []),
      diameterDistribution: this.calculateDiameterDistribution(analysis?.trees || []),
    };

    const spatialData = {
      projectBoundary: 'GeoJSON polygon required',
      standDelineation: 'Stand polygons with attributes',
      samplePlotLocations: 'Point locations of validation plots',
      coordinateSystem: 'WGS84 / EPSG:4326',
    };

    const supportingDocs = [
      'Deed or Title Documentation',
      'Conservation Easement (if applicable)',
      'Forest Management Plan',
      'Third-party Verification Report',
      'Attestation of Title',
      'Attestation of Additionality',
      'Legal Opinion on Carbon Rights',
    ];

    return {
      application,
      inventoryData,
      spatialData,
      supportingDocs,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private calculateCarbonPools(trees: any[], carbonCalc: any): CARCarbonPools {
    // Above-ground live tree carbon
    const liveTreeAG = carbonCalc?.aboveGroundCarbon || 0;
    const liveTreeBG = liveTreeAG * 0.25; // Standard root:shoot ratio

    // Standing dead (estimate from mortality)
    const deadTrees = trees.filter((t) => t.healthStatus === 'dead');
    const snagCarbon = deadTrees.reduce((sum, t) => {
      const volume = this.estimateVolume(t);
      return sum + volume * 0.5 * 0.47 * (44 / 12); // 50% density reduction
    }, 0);

    // Other pools (estimated as fractions)
    const lyingDeadWood = liveTreeAG * 0.03;
    const shrubs = liveTreeAG * 0.02;
    const litter = liveTreeAG * 0.02;

    const totalAG = liveTreeAG + snagCarbon + lyingDeadWood + shrubs + litter;
    const totalBG = liveTreeBG;

    return {
      standingLiveTrees: {
        aboveGround: liveTreeAG,
        belowGround: liveTreeBG,
        total: liveTreeAG + liveTreeBG,
      },
      standingDeadTrees: {
        snags: snagCarbon,
        stumps: snagCarbon * 0.1,
        total: snagCarbon * 1.1,
      },
      lyingDeadWood,
      shrubsAndUnderstory: shrubs,
      forestFloorLitter: litter,
      totalAboveGround: totalAG,
      totalBelowGround: totalBG,
      totalOnsite: totalAG + totalBG,
    };
  }

  private estimateGrowth(trees: any[], project: any): CARGrowthEstimates {
    // Estimate annual growth based on species and site conditions
    const avgDbh = trees.length > 0
      ? trees.reduce((s, t) => s + t.dbh, 0) / trees.length
      : 0;

    // Simplified growth model
    const annualGrowthRate = avgDbh > 0
      ? trees.length * 0.02 * (44 / 12) // ~2% annual carbon increment
      : 0;

    return {
      annualGrowthRate,
      projectedGrowth5Year: annualGrowthRate * 5,
      projectedGrowth10Year: annualGrowthRate * 10,
      siteIndex: project.metadata?.siteIndex || 80, // Default SI
      standAge: project.metadata?.standAge || 50,
    };
  }

  private assessUncertainty(carbonCalc: any): CARUncertainty {
    const sampling = 8; // LiDAR reduces sampling uncertainty
    const measurement = 5; // LiDAR measurement precision
    const allometric = 15; // Allometric equation uncertainty

    // Combined uncertainty using error propagation
    const total = Math.sqrt(
      Math.pow(sampling, 2) +
      Math.pow(measurement, 2) +
      Math.pow(allometric, 2)
    );

    // CAR confidence deduction table
    let confidenceDeduction: number;
    if (total <= 10) confidenceDeduction = 0;
    else if (total <= 15) confidenceDeduction = 5;
    else if (total <= 20) confidenceDeduction = 10;
    else if (total <= 30) confidenceDeduction = 15;
    else confidenceDeduction = 20;

    return {
      samplingUncertainty: sampling,
      measurementUncertainty: measurement,
      allometricUncertainty: allometric,
      totalUncertainty: total,
      confidenceDeduction,
    };
  }

  private estimateVolume(tree: any): number {
    if (!tree.dbh || !tree.height) return 0;
    // Simplified volume equation
    const dbhM = tree.dbh / 100;
    return 0.4 * Math.PI * Math.pow(dbhM / 2, 2) * tree.height;
  }

  private summarizeBySpecies(trees: any[]): object {
    const summary: Record<string, { count: number; basalArea: number; avgDbh: number }> = {};

    for (const tree of trees) {
      const species = tree.speciesCode || 'Unknown';
      if (!summary[species]) {
        summary[species] = { count: 0, basalArea: 0, avgDbh: 0 };
      }
      summary[species].count++;
      const radiusM = tree.dbh / 200;
      summary[species].basalArea += Math.PI * radiusM * radiusM;
    }

    // Calculate averages
    for (const species of Object.keys(summary)) {
      const speciesTrees = trees.filter((t) => t.speciesCode === species);
      summary[species].avgDbh = speciesTrees.reduce((s, t) => s + t.dbh, 0) / speciesTrees.length;
    }

    return summary;
  }

  private calculateDiameterDistribution(trees: any[]): object {
    const classes: Record<string, number> = {
      '0-10': 0,
      '10-20': 0,
      '20-30': 0,
      '30-40': 0,
      '40-50': 0,
      '50+': 0,
    };

    for (const tree of trees) {
      const dbh = tree.dbh;
      if (dbh < 10) classes['0-10']++;
      else if (dbh < 20) classes['10-20']++;
      else if (dbh < 30) classes['20-30']++;
      else if (dbh < 40) classes['30-40']++;
      else if (dbh < 50) classes['40-50']++;
      else classes['50+']++;
    }

    return classes;
  }

  private convertHectaresToAcres(ha: number): number {
    return ha * 2.47105;
  }

  private cmToInches(cm: number): number {
    return cm / 2.54;
  }

  private metersToFeet(m: number): number {
    return m * 3.28084;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCARExportService(): CARExportService {
  return new CARExportService();
}
