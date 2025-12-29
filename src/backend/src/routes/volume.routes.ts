/**
 * Volume Estimation Routes
 * Sprint 17-18: DBH & Volume Estimation
 *
 * API endpoints for tree volume, biomass, and carbon estimation.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { VolumeService, getVolumeService } from '../services/volume.service.js';

const router = Router();

// Initialize volume service
let volumeService: VolumeService;

// Lazy initialization to avoid issues with module loading
const getService = (): VolumeService => {
  if (!volumeService) {
    volumeService = getVolumeService();
  }
  return volumeService;
};

// Request validation schemas
const estimateDbhSchema = z.object({
  height_m: z.number().positive(),
  crown_diameter_m: z.number().positive().optional(),
  species_code: z.string().optional(),
  method: z.enum(['height', 'crown', 'combined']).default('combined'),
});

const estimateVolumeSchema = z.object({
  dbh_cm: z.number().positive(),
  height_m: z.number().positive(),
  species_code: z.string().optional(),
});

const estimateBiomassSchema = z.object({
  dbh_cm: z.number().positive(),
  species_code: z.string().optional(),
  include_roots: z.boolean().default(true),
});

const estimateTreeSchema = z.object({
  tree_id: z.string(),
  height_m: z.number().positive(),
  crown_diameter_m: z.number().positive().optional(),
  species_code: z.string().optional(),
  dbh_cm: z.number().positive().optional(),
});

const treeInputSchema = z.object({
  tree_id: z.string().optional(),
  height: z.number().positive(),
  crown_diameter: z.number().positive().optional(),
  species_code: z.string().optional(),
  dbh: z.number().positive().optional(),
});

const estimateBatchSchema = z.object({
  trees: z.array(treeInputSchema).min(1),
  height_field: z.string().default('height'),
  crown_field: z.string().default('crown_diameter'),
  species_field: z.string().default('species_code'),
  id_field: z.string().default('tree_id'),
});

const estimateStandSchema = z.object({
  trees: z.array(treeInputSchema).min(1),
  area_hectares: z.number().positive(),
  height_field: z.string().default('height'),
  crown_field: z.string().default('crown_diameter'),
  species_field: z.string().default('species_code'),
  id_field: z.string().default('tree_id'),
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
 * POST /volume/estimate-dbh
 * Estimate DBH from height and crown diameter
 */
router.post(
  '/estimate-dbh',
  validate(estimateDbhSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { height_m, crown_diameter_m, species_code, method } = req.body;

      const result = await getService().estimateDbh(
        height_m,
        crown_diameter_m,
        species_code,
        method
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /volume/estimate-volume
 * Estimate tree volume from DBH and height
 */
router.post(
  '/estimate-volume',
  validate(estimateVolumeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { dbh_cm, height_m, species_code } = req.body;

      const result = await getService().estimateVolume(dbh_cm, height_m, species_code);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /volume/estimate-biomass
 * Estimate tree biomass and carbon from DBH
 */
router.post(
  '/estimate-biomass',
  validate(estimateBiomassSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { dbh_cm, species_code, include_roots } = req.body;

      const result = await getService().estimateBiomass(dbh_cm, species_code, include_roots);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /volume/estimate-tree
 * Get complete tree estimates from available measurements
 */
router.post(
  '/estimate-tree',
  validate(estimateTreeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tree_id, height_m, crown_diameter_m, species_code, dbh_cm } = req.body;

      const result = await getService().estimateTreeComplete(
        tree_id,
        height_m,
        crown_diameter_m,
        species_code,
        dbh_cm
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /volume/estimate-batch
 * Estimate metrics for a batch of trees
 */
router.post(
  '/estimate-batch',
  validate(estimateBatchSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { trees, height_field, crown_field, species_field, id_field } = req.body;

      const result = await getService().estimateBatch(
        trees,
        height_field,
        crown_field,
        species_field,
        id_field
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /volume/estimate-stand
 * Calculate stand-level totals from trees
 */
router.post(
  '/estimate-stand',
  validate(estimateStandSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { trees, area_hectares, height_field, crown_field, species_field, id_field } = req.body;

      const result = await getService().estimateStand(
        trees,
        area_hectares,
        height_field,
        crown_field,
        species_field,
        id_field
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /volume/allometry/species
 * Get list of species with allometric equations
 */
router.get(
  '/allometry/species',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const species = await getService().getAvailableSpecies();
      res.json(species);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /volume/allometry/species/:speciesCode
 * Get allometric equation details for a species
 */
router.get(
  '/allometry/species/:speciesCode',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { speciesCode } = req.params;
      const allometry = await getService().getSpeciesAllometry(speciesCode);
      res.json(allometry);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /volume/carbon-credits
 * Calculate carbon credits from CO2 equivalent
 */
router.post(
  '/carbon-credits',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { co2_equivalent_kg } = req.body;

      if (typeof co2_equivalent_kg !== 'number' || co2_equivalent_kg < 0) {
        res.status(400).json({
          error: 'Invalid co2_equivalent_kg value',
        });
        return;
      }

      const credits = getService().calculateCarbonCredits(co2_equivalent_kg);
      res.json(credits);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /volume/convert
 * Convert between volume and biomass units
 */
router.post(
  '/convert',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { value, from_unit, to_unit, type } = req.body;

      if (typeof value !== 'number') {
        res.status(400).json({ error: 'Value must be a number' });
        return;
      }

      let result: number;

      if (type === 'volume') {
        if (from_unit !== 'm3') {
          res.status(400).json({ error: 'Volume conversion only supports m3 as source unit' });
          return;
        }
        result = getService().convertVolume(value, to_unit as 'board_feet' | 'cords' | 'cubic_feet');
      } else if (type === 'biomass') {
        if (from_unit !== 'kg') {
          res.status(400).json({ error: 'Biomass conversion only supports kg as source unit' });
          return;
        }
        result = getService().convertBiomass(value, to_unit as 'tonnes' | 'pounds' | 'tons_us');
      } else {
        res.status(400).json({ error: 'Type must be "volume" or "biomass"' });
        return;
      }

      res.json({
        original_value: value,
        original_unit: from_unit,
        converted_value: Math.round(result * 1000) / 1000,
        converted_unit: to_unit,
        type,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
