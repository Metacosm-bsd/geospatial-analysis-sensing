/**
 * Public API Routes (v1)
 * Sprint 49-54: Public API
 *
 * Versioned public REST API with API key authentication.
 */

import { Router } from 'express';
import { authenticateApiKey, rateLimiter, requireScopes, logUsage } from '../../middleware/ratelimit.js';

// Import route modules
import projectsRouter from './projects.js';
import filesRouter from './files.js';
import analysesRouter from './analyses.js';
import reportsRouter from './reports.js';

const router = Router();

// Apply API key authentication to all routes
router.use(authenticateApiKey);
router.use(rateLimiter);
router.use(logUsage);

// API version info
router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      version: 'v1',
      documentation: 'https://docs.lidarforest.com/api/v1',
      status: 'stable',
    },
  });
});

// Mount route modules
router.use('/projects', projectsRouter);
router.use('/files', filesRouter);
router.use('/analyses', analysesRouter);
router.use('/reports', reportsRouter);

export default router;
