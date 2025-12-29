/**
 * Stand Delineation Routes
 * Sprint 21-24: FIA Reports & Export
 *
 * API endpoints for stand delineation and summary calculation.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StandService, getStandService } from '../services/stand.service.js';

const router = Router();

// Initialize stand service
let standService: StandService;

// Lazy initialization to avoid issues with module loading
const getService = (): StandService => {
  if (!standService) {
    standService = getStandService();
  }
  return standService;
};

// Request validation schemas
const treeSchema = z.object({
  tree_id: z.string().optional(),
  x: z.number(),
  y: z.number(),
  height: z.number().positive().optional(),
  height_m: z.number().positive().optional(),
  dbh_cm: z.number().positive().optional(),
  crown_diameter_m: z.number().positive().optional(),
  species_code: z.string().optional(),
  volume_m3: z.number().optional(),
  biomass_kg: z.number().optional(),
  carbon_kg: z.number().optional(),
});

const delineateSchema = z.object({
  trees: z.array(treeSchema).min(3),
  method: z.enum(['dbscan', 'kmeans', 'grid', 'attribute']).default('dbscan'),
  min_trees: z.number().int().positive().default(5),
  eps: z.number().positive().default(20.0),
  n_clusters: z.number().int().positive().optional(),
  grid_size: z.number().positive().default(50.0),
  attribute_weights: z.record(z.number()).optional(),
});

const summarySchema = z.object({
  trees: z.array(treeSchema).min(1),
  area_hectares: z.number().positive(),
  stand_id: z.string().default('stand_1'),
});

// Middleware for request validation
const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
        return;
      }
      next(error);
    }
  };
};

/**
 * POST /stands/delineate
 * Delineate forest stands from tree data
 */
router.post(
  '/delineate',
  validate(delineateSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        trees,
        method,
        min_trees,
        eps,
        n_clusters,
        grid_size,
        attribute_weights,
      } = req.body;

      const result = await getService().delineate(
        trees,
        method,
        min_trees,
        eps,
        n_clusters,
        grid_size,
        attribute_weights
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stands/summary
 * Calculate stand-level summary statistics
 */
router.post(
  '/summary',
  validate(summarySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { trees, area_hectares, stand_id } = req.body;

      const result = await getService().calculateSummary(trees, area_hectares, stand_id);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stands/methods
 * Get available delineation methods
 */
router.get(
  '/methods',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        methods: [
          {
            name: 'dbscan',
            description: 'Density-based spatial clustering (DBSCAN)',
            parameters: {
              eps: 'Maximum distance between points in a cluster (meters)',
              min_trees: 'Minimum trees per stand',
            },
            recommended: true,
          },
          {
            name: 'kmeans',
            description: 'K-means clustering with specified number of clusters',
            parameters: {
              n_clusters: 'Number of stands to create',
            },
            recommended: false,
          },
          {
            name: 'grid',
            description: 'Grid-based delineation with specified cell size',
            parameters: {
              grid_size: 'Grid cell size in meters',
            },
            recommended: false,
          },
          {
            name: 'attribute',
            description: 'Clustering based on tree attributes (height, species)',
            parameters: {
              attribute_weights: 'Weight for each attribute in clustering',
            },
            recommended: false,
          },
        ],
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stands/:standId/geojson
 * Get GeoJSON representation of a stand
 */
router.get(
  '/:standId/geojson',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { standId } = req.params;
      const geojson = await getService().getStandGeoJSON(standId);

      if (!geojson) {
        res.status(404).json({ error: 'Stand not found' });
        return;
      }

      res.json(geojson);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
