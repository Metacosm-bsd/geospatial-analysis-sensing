import { Router } from 'express';
import authRouter from './auth.js';
import projectsRouter from './projects.js';
import analysesRouter from './analyses.js';
import filesRouter from './files.js';
import viewerRouter from './viewer.js';
import reportsRouter from './reports.js';
import speciesRouter from './species.js';

const router = Router();

// API routes
router.use('/auth', authRouter);
router.use('/projects', projectsRouter);
router.use('/analyses', analysesRouter);
router.use('/files', filesRouter);
router.use('/viewer', viewerRouter);
router.use('/reports', reportsRouter);
router.use('/species', speciesRouter);

// API info endpoint
router.get('/', (_req, res) => {
  res.json({
    name: 'LiDAR Forest Analysis API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      projects: '/api/v1/projects',
      analyses: '/api/v1/analyses',
      files: '/api/v1/files',
      viewer: '/api/v1/viewer',
      reports: '/api/v1/reports',
      species: '/api/v1/species',
    },
  });
});

export { router };
export default router;
