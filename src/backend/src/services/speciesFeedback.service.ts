/**
 * Species Feedback Service - Sprint 15-16
 * Handles species correction recording, history, and statistics
 */

import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type {
  CorrectionRecord,
  CorrectionStatistics,
} from '../types/species.js';

// ============================================================================
// Types
// ============================================================================

interface CorrectionWithDetails {
  id: string;
  treeDetectionId: string;
  treeDetection: {
    analysisId: string;
    x: number;
    y: number;
    z: number;
    height: number;
    crownDiameter: number;
  };
  predictedSpecies: string;
  correctedSpecies: string;
  confidenceWas: number;
  userId: string;
  user: {
    name: string;
    email: string;
  };
  createdAt: Date;
}

// ============================================================================
// Correction Recording
// ============================================================================

/**
 * Record a species correction made by a user
 * @param treeId - Tree detection ID
 * @param predictedSpecies - Original predicted species
 * @param correctedSpecies - User-corrected species
 * @param userId - User making the correction
 * @returns Created correction record
 */
export async function recordCorrection(
  treeId: string,
  predictedSpecies: string,
  correctedSpecies: string,
  userId: string
): Promise<CorrectionRecord> {
  try {
    // Get the tree detection to verify it exists and get current confidence
    const tree = await prisma.treeDetection.findUnique({
      where: { id: treeId },
      include: {
        analysis: {
          select: {
            id: true,
            project: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!tree) {
      throw new Error('Tree detection not found');
    }

    // Verify user has access to this tree's project
    if (tree.analysis.project.userId !== userId) {
      throw new Error('Access denied: You do not have permission to correct this tree');
    }

    const confidenceWas = tree.speciesConfidence ?? 0;

    // Create the correction record
    const correction = await prisma.speciesCorrection.create({
      data: {
        treeDetectionId: treeId,
        predictedSpecies,
        correctedSpecies,
        confidenceWas,
        userId,
      },
    });

    // Update the tree detection with the corrected species
    await prisma.treeDetection.update({
      where: { id: treeId },
      data: {
        speciesCode: correctedSpecies,
        speciesConfidence: 1.0, // Manual correction = 100% confidence
      },
    });

    logger.info(
      `User ${userId} corrected tree ${treeId} species from ${predictedSpecies} to ${correctedSpecies}`
    );

    return {
      id: correction.id,
      treeId,
      analysisId: tree.analysis.id,
      predictedSpecies,
      correctedSpecies,
      userId,
      confidenceWas,
      timestamp: correction.createdAt.toISOString(),
    };
  } catch (error) {
    logger.error('Error recording species correction:', error);
    throw error;
  }
}

// ============================================================================
// Correction History
// ============================================================================

/**
 * Get correction history for an analysis
 * @param analysisId - Analysis ID
 * @param userId - Optional user ID for access verification
 * @returns Array of correction records
 */
export async function getCorrectionHistory(
  analysisId: string,
  userId?: string
): Promise<CorrectionRecord[]> {
  try {
    // Verify user has access to the analysis
    if (userId) {
      const analysis = await prisma.analysis.findUnique({
        where: { id: analysisId },
        include: {
          project: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!analysis) {
        throw new Error('Analysis not found');
      }

      if (analysis.project.userId !== userId) {
        throw new Error('Access denied: You do not have access to this analysis');
      }
    }

    // Get all corrections for trees in this analysis
    const corrections = await prisma.speciesCorrection.findMany({
      where: {
        treeDetection: {
          analysisId,
        },
      },
      include: {
        treeDetection: {
          select: {
            id: true,
            analysisId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return corrections.map((c: {
      id: string;
      treeDetectionId: string;
      treeDetection: { analysisId: string };
      predictedSpecies: string;
      correctedSpecies: string;
      userId: string;
      confidenceWas: number;
      createdAt: Date;
    }) => ({
      id: c.id,
      treeId: c.treeDetectionId,
      analysisId: c.treeDetection.analysisId,
      predictedSpecies: c.predictedSpecies,
      correctedSpecies: c.correctedSpecies,
      userId: c.userId,
      confidenceWas: c.confidenceWas,
      timestamp: c.createdAt.toISOString(),
    }));
  } catch (error) {
    logger.error('Error getting correction history:', error);
    throw error;
  }
}

// ============================================================================
// Correction Statistics
// ============================================================================

/**
 * Get statistics about species corrections across all analyses
 * @returns Correction statistics
 */
export async function getCorrectionStatistics(): Promise<CorrectionStatistics> {
  try {
    // Get total corrections count
    const totalCorrections = await prisma.speciesCorrection.count();

    // Get unique trees corrected
    const uniqueTrees = await prisma.speciesCorrection.groupBy({
      by: ['treeDetectionId'],
    });
    const uniqueTreesCorrected = uniqueTrees.length;

    // Get correction patterns (from -> to)
    const corrections = await prisma.speciesCorrection.findMany({
      select: {
        predictedSpecies: true,
        correctedSpecies: true,
        confidenceWas: true,
        userId: true,
      },
    });

    // Calculate top correction patterns
    const patternCounts: Record<string, number> = {};
    let totalConfidence = 0;
    const userCounts: Record<string, number> = {};

    for (const c of corrections) {
      const pattern = `${c.predictedSpecies}:${c.correctedSpecies}`;
      patternCounts[pattern] = (patternCounts[pattern] ?? 0) + 1;
      totalConfidence += c.confidenceWas;
      userCounts[c.userId] = (userCounts[c.userId] ?? 0) + 1;
    }

    // Sort patterns by count and take top 10
    const topCorrectionPatterns = Object.entries(patternCounts)
      .map(([pattern, count]) => {
        const [from, to] = pattern.split(':');
        return { from: from!, to: to!, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const avgConfidenceBeforeCorrection =
      corrections.length > 0 ? totalConfidence / corrections.length : 0;

    return {
      totalCorrections,
      uniqueTreesCorrected,
      topCorrectionPatterns,
      avgConfidenceBeforeCorrection,
      correctionsByUser: userCounts,
    };
  } catch (error) {
    logger.error('Error getting correction statistics:', error);
    throw error;
  }
}

// ============================================================================
// Export Corrections
// ============================================================================

/**
 * Export corrections in specified format
 * @param format - Export format (csv or json)
 * @param analysisId - Optional filter by analysis
 * @returns Buffer containing exported data
 */
export async function exportCorrections(
  format: 'csv' | 'json',
  analysisId?: string
): Promise<Buffer> {
  try {
    // Build query filter
    const where = analysisId
      ? {
          treeDetection: {
            analysisId,
          },
        }
      : {};

    const corrections = await prisma.speciesCorrection.findMany({
      where,
      include: {
        treeDetection: {
          select: {
            analysisId: true,
            x: true,
            y: true,
            z: true,
            height: true,
            crownDiameter: true,
          },
        },
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'id',
        'treeId',
        'analysisId',
        'predictedSpecies',
        'correctedSpecies',
        'confidenceWas',
        'userName',
        'userEmail',
        'treeX',
        'treeY',
        'treeZ',
        'treeHeight',
        'crownDiameter',
        'timestamp',
      ];

      const rows = (corrections as CorrectionWithDetails[]).map((c: CorrectionWithDetails) => [
        c.id,
        c.treeDetectionId,
        c.treeDetection.analysisId,
        c.predictedSpecies,
        c.correctedSpecies,
        c.confidenceWas.toString(),
        c.user.name,
        c.user.email,
        c.treeDetection.x.toString(),
        c.treeDetection.y.toString(),
        c.treeDetection.z.toString(),
        c.treeDetection.height.toString(),
        c.treeDetection.crownDiameter.toString(),
        c.createdAt.toISOString(),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row: string[]) =>
          row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      return Buffer.from(csvContent, 'utf-8');
    } else {
      // Generate JSON
      const jsonData = (corrections as CorrectionWithDetails[]).map((c: CorrectionWithDetails) => ({
        id: c.id,
        treeId: c.treeDetectionId,
        analysisId: c.treeDetection.analysisId,
        predictedSpecies: c.predictedSpecies,
        correctedSpecies: c.correctedSpecies,
        confidenceWas: c.confidenceWas,
        user: {
          name: c.user.name,
          email: c.user.email,
        },
        tree: {
          x: c.treeDetection.x,
          y: c.treeDetection.y,
          z: c.treeDetection.z,
          height: c.treeDetection.height,
          crownDiameter: c.treeDetection.crownDiameter,
        },
        timestamp: c.createdAt.toISOString(),
      }));

      return Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8');
    }
  } catch (error) {
    logger.error('Error exporting corrections:', error);
    throw error;
  }
}

// ============================================================================
// Export Service Object
// ============================================================================

export const speciesFeedbackService = {
  recordCorrection,
  getCorrectionHistory,
  getCorrectionStatistics,
  exportCorrections,
};

export default speciesFeedbackService;
