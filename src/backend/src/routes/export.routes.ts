/**
 * Spatial Export Routes
 * Sprint 21-24: FIA Reports & Export
 *
 * API endpoints for exporting trees and stands to various spatial formats.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ExportService, getExportService } from '../services/export.service.js';

const router = Router();

// Initialize export service
let exportService: ExportService;

// Lazy initialization to avoid issues with module loading
const getService = (): ExportService => {
  if (!exportService) {
    exportService = getExportService();
  }
  return exportService;
};

// Request validation schemas
const treeExportSchema = z.object({
  trees: z.array(z.object({
    tree_id: z.string().optional(),
    x: z.number(),
    y: z.number(),
    height_m: z.number().optional(),
    dbh_cm: z.number().optional(),
    crown_diameter_m: z.number().optional(),
    species_code: z.string().optional(),
    volume_m3: z.number().optional(),
    biomass_kg: z.number().optional(),
    carbon_kg: z.number().optional(),
  })).min(1),
  format: z.enum(['geojson', 'shapefile', 'kml', 'csv']).default('geojson'),
  crs: z.string().default('EPSG:4326'),
  output_path: z.string().optional(),
});

const standExportSchema = z.object({
  stands: z.array(z.object({
    stand_id: z.string(),
    boundary: z.object({
      type: z.literal('Polygon'),
      coordinates: z.array(z.array(z.array(z.number()))),
    }).optional(),
    tree_count: z.number().optional(),
    area_hectares: z.number().optional(),
    summary: z.object({
      stems_per_hectare: z.number().optional(),
      basal_area_m2_ha: z.number().optional(),
      volume_m3_ha: z.number().optional(),
      biomass_kg_ha: z.number().optional(),
      carbon_kg_ha: z.number().optional(),
      mean_height_m: z.number().optional(),
      dominant_height_m: z.number().optional(),
      mean_dbh_cm: z.number().optional(),
      dominant_species: z.string().optional(),
    }).optional(),
  })).min(1),
  format: z.enum(['geojson', 'shapefile', 'kml', 'csv']).default('geojson'),
  crs: z.string().default('EPSG:4326'),
  output_path: z.string().optional(),
});

const fiaReportSchema = z.object({
  trees: z.array(z.object({
    tree_id: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    height_m: z.number().optional(),
    height: z.number().optional(),
    dbh_cm: z.number().optional(),
    crown_diameter_m: z.number().optional(),
    species_code: z.string().optional(),
    volume_m3: z.number().optional(),
    biomass_kg: z.number().optional(),
  })).min(1),
  plot_id: z.string().default('PLOT001'),
  state_code: z.string().default('41'),
  county_code: z.string().default('001'),
  plot_area_acres: z.number().positive().default(0.25),
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
 * POST /export/trees
 * Export trees to spatial format
 */
router.post(
  '/trees',
  validate(treeExportSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { trees, format, crs, output_path } = req.body;

      const result = await getService().exportTrees(trees, format, crs, output_path);

      // Return based on format
      if (format === 'geojson') {
        res.json(result.data);
      } else if (format === 'shapefile') {
        // Return file path for shapefile (actual file download handled elsewhere)
        res.json({ success: true, file_path: result.file_path });
      } else if (format === 'kml') {
        res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
        res.setHeader('Content-Disposition', 'attachment; filename="trees.kml"');
        res.send(result.data);
      } else if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="trees.csv"');
        res.send(result.data);
      } else {
        res.json(result);
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /export/stands
 * Export stands to spatial format
 */
router.post(
  '/stands',
  validate(standExportSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stands, format, crs, output_path } = req.body;

      const result = await getService().exportStands(stands, format, crs, output_path);

      // Return based on format
      if (format === 'geojson') {
        res.json(result.data);
      } else if (format === 'shapefile') {
        res.json({ success: true, file_path: result.file_path });
      } else if (format === 'kml') {
        res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
        res.setHeader('Content-Disposition', 'attachment; filename="stands.kml"');
        res.send(result.data);
      } else if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="stands.csv"');
        res.send(result.data);
      } else {
        res.json(result);
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /export/fia
 * Generate FIA-compliant report
 */
router.post(
  '/fia',
  validate(fiaReportSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { trees, plot_id, state_code, county_code, plot_area_acres } = req.body;

      const result = await getService().generateFIAReport(
        trees,
        plot_id,
        state_code,
        county_code,
        plot_area_acres
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /export/fia/species-codes
 * Get FIA species code mapping
 */
router.get(
  '/fia/species-codes',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const codes = await getService().getFIASpeciesCodes();
      res.json(codes);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /export/formats
 * Get supported export formats
 */
router.get(
  '/formats',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        formats: [
          {
            name: 'geojson',
            description: 'GeoJSON FeatureCollection - widely supported web format',
            extension: '.geojson',
            mime_type: 'application/geo+json',
          },
          {
            name: 'shapefile',
            description: 'ESRI Shapefile - industry standard GIS format (zipped)',
            extension: '.zip',
            mime_type: 'application/zip',
          },
          {
            name: 'kml',
            description: 'Keyhole Markup Language - for Google Earth',
            extension: '.kml',
            mime_type: 'application/vnd.google-earth.kml+xml',
          },
          {
            name: 'csv',
            description: 'CSV with WKT geometry - for spreadsheets and databases',
            extension: '.csv',
            mime_type: 'text/csv',
          },
        ],
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
