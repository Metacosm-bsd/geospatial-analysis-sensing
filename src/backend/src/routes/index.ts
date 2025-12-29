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
import apikeysRouter from './apikeys.js';
import webhooksRouter from './webhooks.js';
import publicApiRouter from './public-api/index.js';

const router = Router();

// API routes (authenticated via session/JWT)
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
router.use('/api-keys', apikeysRouter);
router.use('/webhooks', webhooksRouter);

// Public API routes (authenticated via API key)
router.use('/v1', publicApiRouter);

// API info endpoint
router.get('/', (_req, res) => {
  res.json({
    name: 'LiDAR Forest Analysis API',
    version: '1.0.0',
    endpoints: {
      // Web app routes (JWT auth)
      auth: '/api/auth',
      projects: '/api/projects',
      analyses: '/api/analyses',
      files: '/api/files',
      viewer: '/api/viewer',
      reports: '/api/reports',
      species: '/api/species',
      volume: '/api/volume',
      stands: '/api/stands',
      export: '/api/export',
      organizations: '/api/organizations',
      comments: '/api/comments',
      notifications: '/api/notifications',
      apiKeys: '/api/api-keys',
      webhooks: '/api/webhooks',
      // Public API (API key auth)
      publicApi: '/api/v1',
    },
    documentation: 'https://docs.lidarforest.com/api',
  });
});

export { router };
export default router;
