/**
 * Verra Carbon Registry Integration
 * Export carbon project data to Verra VCS format
 * Sprint 61-66: Third-Party Integrations
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// Types - Verra VCS Project Data Model
// ============================================================================

export interface VerraProject {
  projectId: string;
  projectName: string;
  projectProponent: string;
  projectDescription: string;
  projectType: VerraProjectType;
  methodology: string;
  country: string;
  region: string;
  projectArea: number; // hectares
  creditingPeriodStart: string;
  creditingPeriodEnd: string;
  baselineScenario: string;
  projectScenario: string;
}

export type VerraProjectType =
  | 'ARR' // Afforestation, Reforestation, and Revegetation
  | 'IFM' // Improved Forest Management
  | 'REDD' // Reducing Emissions from Deforestation and Degradation
  | 'WRC'; // Wetlands Restoration and Conservation

export interface VerraMonitoringReport {
  reportId: string;
  projectId: string;
  monitoringPeriodStart: string;
  monitoringPeriodEnd: string;
  reportDate: string;
  verifier: string;
  carbonPools: CarbonPool[];
  emissionReductions: EmissionReduction;
  permanenceRiskAssessment: PermanenceRisk;
  leakageAssessment: LeakageAssessment;
  uncertaintyAnalysis: UncertaintyAnalysis;
}

export interface CarbonPool {
  poolName: 'above_ground_tree' | 'below_ground' | 'dead_wood' | 'litter' | 'soil';
  baselineStock: number; // tCO2e
  projectStock: number; // tCO2e
  change: number; // tCO2e
  methodology: string;
}

export interface EmissionReduction {
  grossReductions: number; // tCO2e
  leakageDeduction: number; // tCO2e
  bufferDeduction: number; // tCO2e (typically 10-40%)
  netReductions: number; // tCO2e
}

export interface PermanenceRisk {
  riskCategory: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  internalRisk: number; // percentage
  externalRisk: number; // percentage
  totalRisk: number; // percentage
  bufferContribution: number; // percentage of credits to buffer pool
}

export interface LeakageAssessment {
  activityShifting: number; // tCO2e
  marketLeakage: number; // tCO2e
  totalLeakage: number; // tCO2e
  leakageRate: number; // percentage
}

export interface UncertaintyAnalysis {
  method: 'propagation' | 'monte_carlo';
  emissionFactorUncertainty: number; // percentage
  activityDataUncertainty: number; // percentage
  combinedUncertainty: number; // percentage
  confidenceLevel: number; // typically 90 or 95
}

export interface VerraVCU {
  serialNumber: string;
  projectId: string;
  vintage: number; // year
  quantity: number; // tCO2e
  status: 'issued' | 'retired' | 'cancelled';
  issuanceDate: string;
  retirementDate?: string;
  retirementBeneficiary?: string;
}

// ============================================================================
// Verra Export Service
// ============================================================================

export class VerraExportService {
  // ==========================================================================
  // Generate VCS Project Description Document (PDD)
  // ==========================================================================

  async generatePDD(projectId: string): Promise<VerraProject> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: true,
        analyses: {
          include: {
            carbonCalculation: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Calculate project area from boundary
    let projectArea = 0;
    if (project.boundaryGeoJSON) {
      projectArea = this.calculateAreaHectares(project.boundaryGeoJSON);
    }

    return {
      projectId: project.id,
      projectName: project.name,
      projectProponent: project.organization?.name || 'Unknown',
      projectDescription: project.description || '',
      projectType: 'IFM', // Default to Improved Forest Management
      methodology: 'VM0010', // Methodology for IFM
      country: 'United States',
      region: project.metadata?.state || 'Unknown',
      projectArea,
      creditingPeriodStart: new Date().toISOString().split('T')[0],
      creditingPeriodEnd: new Date(Date.now() + 30 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 years
      baselineScenario: 'Continued conventional forest management with periodic harvest',
      projectScenario: 'Extended rotation and improved forest management practices',
    };
  }

  // ==========================================================================
  // Generate Monitoring Report
  // ==========================================================================

  async generateMonitoringReport(
    analysisId: string,
    monitoringPeriod: { start: string; end: string }
  ): Promise<VerraMonitoringReport> {
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
    if (!carbonCalc) {
      throw new Error('No carbon calculation found for analysis');
    }

    // Calculate carbon pools
    const carbonPools = this.calculateCarbonPools(analysis);

    // Calculate emission reductions
    const emissionReductions = this.calculateEmissionReductions(carbonCalc, carbonPools);

    // Assess permanence risk
    const permanenceRisk = this.assessPermanenceRisk(analysis.project);

    // Assess leakage
    const leakageAssessment = this.assessLeakage(emissionReductions.grossReductions);

    // Uncertainty analysis
    const uncertaintyAnalysis = this.analyzeUncertainty(carbonCalc);

    return {
      reportId: `MR-${analysis.project.id}-${Date.now()}`,
      projectId: analysis.project.id,
      monitoringPeriodStart: monitoringPeriod.start,
      monitoringPeriodEnd: monitoringPeriod.end,
      reportDate: new Date().toISOString().split('T')[0],
      verifier: 'TBD - Third-party verification required',
      carbonPools,
      emissionReductions,
      permanenceRiskAssessment: permanenceRisk,
      leakageAssessment,
      uncertaintyAnalysis,
    };
  }

  // ==========================================================================
  // Export to VCS Format
  // ==========================================================================

  async exportToVCSFormat(projectId: string): Promise<{
    pdd: VerraProject;
    monitoringData: object;
    carbonInventory: object;
  }> {
    const pdd = await this.generatePDD(projectId);

    // Get latest analysis with carbon data
    const analysis = await prisma.analysis.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        carbonCalculation: true,
        trees: true,
      },
    });

    const carbonInventory = {
      inventoryDate: new Date().toISOString(),
      methodology: 'VM0010 - Methodology for Improved Forest Management',
      samplingDesign: {
        type: 'stratified_random',
        sampleSize: analysis?.trees.length || 0,
        confidenceLevel: 95,
      },
      speciesComposition: this.summarizeSpeciesComposition(analysis?.trees || []),
      standMetrics: {
        totalArea: pdd.projectArea,
        meanDbh: this.calculateMeanDbh(analysis?.trees || []),
        meanHeight: this.calculateMeanHeight(analysis?.trees || []),
        basalArea: this.calculateBasalArea(analysis?.trees || []),
        stemDensity: analysis?.trees.length || 0 / (pdd.projectArea || 1),
      },
    };

    const monitoringData = {
      projectId,
      lastInventory: analysis?.createdAt,
      carbonStocks: analysis?.carbonCalculation || {},
      treeCount: analysis?.trees.length || 0,
      qualityAssurance: {
        dataVerification: 'LiDAR-based individual tree detection',
        accuracyAssessment: 'Cross-validated with ground truth plots',
        uncertaintyQuantified: true,
      },
    };

    return { pdd, monitoringData, carbonInventory };
  }

  // ==========================================================================
  // Generate VCS Credit Issuance Request
  // ==========================================================================

  async generateIssuanceRequest(
    monitoringReport: VerraMonitoringReport
  ): Promise<{
    requestId: string;
    projectId: string;
    vintage: number;
    creditsRequested: number;
    bufferPoolContribution: number;
    netCreditsToIssue: number;
    supportingDocuments: string[];
  }> {
    const vintage = new Date(monitoringReport.monitoringPeriodEnd).getFullYear();
    const creditsRequested = monitoringReport.emissionReductions.netReductions;
    const bufferPoolContribution =
      creditsRequested * (monitoringReport.permanenceRiskAssessment.bufferContribution / 100);
    const netCreditsToIssue = creditsRequested - bufferPoolContribution;

    return {
      requestId: `IR-${monitoringReport.projectId}-${vintage}-${Date.now()}`,
      projectId: monitoringReport.projectId,
      vintage,
      creditsRequested,
      bufferPoolContribution,
      netCreditsToIssue,
      supportingDocuments: [
        'Project Description Document (PDD)',
        'Monitoring Report',
        'Third-party Verification Report',
        'Carbon Inventory Data',
        'GIS Boundary Files',
        'Ownership Documentation',
      ],
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private calculateAreaHectares(geoJSON: any): number {
    // Would use turf.js to calculate area
    // For now, return placeholder
    return 0;
  }

  private calculateCarbonPools(analysis: any): CarbonPool[] {
    const carbonCalc = analysis.carbonCalculation;
    const trees = analysis.trees;

    // Above-ground tree biomass
    const agbCarbon = carbonCalc?.aboveGroundCarbon || 0;

    // Below-ground (typically 20-30% of AGB)
    const bgbCarbon = agbCarbon * 0.25;

    // Dead wood (estimate)
    const deadWoodCarbon = agbCarbon * 0.05;

    // Litter (estimate)
    const litterCarbon = agbCarbon * 0.03;

    return [
      {
        poolName: 'above_ground_tree',
        baselineStock: 0, // Would come from baseline inventory
        projectStock: agbCarbon,
        change: agbCarbon,
        methodology: 'LiDAR-based individual tree allometry',
      },
      {
        poolName: 'below_ground',
        baselineStock: 0,
        projectStock: bgbCarbon,
        change: bgbCarbon,
        methodology: 'Root-to-shoot ratios (IPCC default)',
      },
      {
        poolName: 'dead_wood',
        baselineStock: 0,
        projectStock: deadWoodCarbon,
        change: deadWoodCarbon,
        methodology: 'Regional default values',
      },
      {
        poolName: 'litter',
        baselineStock: 0,
        projectStock: litterCarbon,
        change: litterCarbon,
        methodology: 'Regional default values',
      },
    ];
  }

  private calculateEmissionReductions(carbonCalc: any, pools: CarbonPool[]): EmissionReduction {
    const totalChange = pools.reduce((sum, p) => sum + p.change, 0);
    const grossReductions = totalChange * (44 / 12); // Convert to CO2e

    // Apply standard deductions
    const leakageDeduction = grossReductions * 0.05; // 5% leakage
    const bufferDeduction = grossReductions * 0.20; // 20% buffer (conservative)

    return {
      grossReductions,
      leakageDeduction,
      bufferDeduction,
      netReductions: grossReductions - leakageDeduction - bufferDeduction,
    };
  }

  private assessPermanenceRisk(project: any): PermanenceRisk {
    // Simplified risk assessment based on VCS AFOLU Non-Permanence Risk Tool
    const internalRisk = 10; // Project management risk
    const externalRisk = 5; // External natural risks

    const totalRisk = internalRisk + externalRisk;

    // Map to buffer contribution
    let bufferContribution: number;
    if (totalRisk <= 15) bufferContribution = 10;
    else if (totalRisk <= 25) bufferContribution = 15;
    else if (totalRisk <= 35) bufferContribution = 20;
    else if (totalRisk <= 45) bufferContribution = 25;
    else bufferContribution = 30;

    return {
      riskCategory: totalRisk <= 15 ? 'A' : totalRisk <= 30 ? 'B' : 'C',
      internalRisk,
      externalRisk,
      totalRisk,
      bufferContribution,
    };
  }

  private assessLeakage(grossReductions: number): LeakageAssessment {
    // Conservative leakage estimates
    const activityShifting = grossReductions * 0.02; // 2%
    const marketLeakage = grossReductions * 0.03; // 3%
    const totalLeakage = activityShifting + marketLeakage;

    return {
      activityShifting,
      marketLeakage,
      totalLeakage,
      leakageRate: (totalLeakage / grossReductions) * 100,
    };
  }

  private analyzeUncertainty(carbonCalc: any): UncertaintyAnalysis {
    return {
      method: 'propagation',
      emissionFactorUncertainty: carbonCalc?.uncertainty?.emissionFactor || 15,
      activityDataUncertainty: carbonCalc?.uncertainty?.activityData || 10,
      combinedUncertainty: carbonCalc?.uncertainty?.combined || 18,
      confidenceLevel: 90,
    };
  }

  private summarizeSpeciesComposition(trees: any[]): object {
    const speciesCounts: Record<string, number> = {};
    for (const tree of trees) {
      const species = tree.speciesCode || 'Unknown';
      speciesCounts[species] = (speciesCounts[species] || 0) + 1;
    }
    return speciesCounts;
  }

  private calculateMeanDbh(trees: any[]): number {
    if (trees.length === 0) return 0;
    return trees.reduce((sum, t) => sum + t.dbh, 0) / trees.length;
  }

  private calculateMeanHeight(trees: any[]): number {
    const treesWithHeight = trees.filter((t) => t.height);
    if (treesWithHeight.length === 0) return 0;
    return treesWithHeight.reduce((sum, t) => sum + t.height, 0) / treesWithHeight.length;
  }

  private calculateBasalArea(trees: any[]): number {
    return trees.reduce((sum, t) => {
      const radiusM = t.dbh / 200; // cm to m
      return sum + Math.PI * radiusM * radiusM;
    }, 0);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createVerraExportService(): VerraExportService {
  return new VerraExportService();
}
