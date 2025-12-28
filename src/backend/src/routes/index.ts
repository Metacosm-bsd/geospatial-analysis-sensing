import { Router } from 'express';
import authRouter from './auth.js';
import projectsRouter from './projects.js';
import analysesRouter from './analyses.js';

const router = Router();

// API routes
router.use('/auth', authRouter);
router.use('/projects', projectsRouter);
router.use('/analyses', analysesRouter);

// API info endpoint
router.get('/', (_req, res) => {
  res.json({
    name: 'LiDAR Forest Analysis API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      projects: '/api/v1/projects',
      analyses: '/api/v1/analyses',
    },
  });
});

export { router };
export default router;
