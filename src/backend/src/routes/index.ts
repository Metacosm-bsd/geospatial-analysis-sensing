import { Router } from 'express';
import authRouter from './auth.js';
import projectsRouter from './projects.js';
import analysesRouter from './analyses.js';
import filesRouter from './files.js';
import viewerRouter from './viewer.js';
import reportsRouter from './reports.js';
import speciesRouter from './species.js';
import volumeRouter from './volume.routes.js';
import standsRouter from './stands.routes.js';
import exportRouter from './export.routes.js';
import organizationsRouter from './organizations.js';
import commentsRouter from './comments.js';
import notificationsRouter from './notifications.js';

const router = Router();

// API routes
router.use('/auth', authRouter);
router.use('/projects', projectsRouter);
router.use('/analyses', analysesRouter);
router.use('/files', filesRouter);
router.use('/viewer', viewerRouter);
router.use('/reports', reportsRouter);
router.use('/species', speciesRouter);
router.use('/volume', volumeRouter);
router.use('/stands', standsRouter);
router.use('/export', exportRouter);
router.use('/organizations', organizationsRouter);
router.use('/comments', commentsRouter);
router.use('/notifications', notificationsRouter);

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
      volume: '/api/v1/volume',
      stands: '/api/v1/stands',
      export: '/api/v1/export',
      organizations: '/api/v1/organizations',
      comments: '/api/v1/comments',
      notifications: '/api/v1/notifications',
    },
  });
});

export { router };
export default router;
