/**
 * API Keys Routes
 * Sprint 49-54: Public API
 *
 * Handles API key CRUD operations and usage statistics.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import {
  createApiKey,
  getUserApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  regenerateApiKey,
  getApiUsageStats,
  API_SCOPES,
  TIER_LIMITS,
} from '../services/apikey.service.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ============================================================================
// Schemas
// ============================================================================

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/api-keys
 * List all API keys for the current user
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const apiKeys = await getUserApiKeys(userId);

    res.json({
      success: true,
      data: apiKeys,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/api-keys
 * Create a new API key
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const data = createKeySchema.parse(req.body);

    // Validate scopes
    if (data.scopes) {
      const validScopes = Object.keys(API_SCOPES);
      const invalidScopes = data.scopes.filter((s) => !validScopes.includes(s));
      if (invalidScopes.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid scopes: ${invalidScopes.join(', ')}`,
        });
      }
    }

    const apiKey = await createApiKey(userId, {
      name: data.name,
      scopes: data.scopes,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    res.status(201).json({
      success: true,
      data: apiKey,
      message: 'API key created. Save the secret key - it will not be shown again.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/api-keys/scopes
 * Get available API scopes
 */
router.get('/scopes', (_req, res) => {
  res.json({
    success: true,
    data: API_SCOPES,
  });
});

/**
 * GET /api/api-keys/tiers
 * Get API tier rate limits
 */
router.get('/tiers', (_req, res) => {
  res.json({
    success: true,
    data: TIER_LIMITS,
  });
});

/**
 * GET /api/api-keys/:keyId
 * Get a specific API key
 */
router.get('/:keyId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { keyId } = req.params;

    const apiKey = await getApiKey(keyId, userId);

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
      });
    }

    res.json({
      success: true,
      data: apiKey,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/api-keys/:keyId
 * Update an API key
 */
router.patch('/:keyId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { keyId } = req.params;
    const data = updateKeySchema.parse(req.body);

    // Validate scopes
    if (data.scopes) {
      const validScopes = Object.keys(API_SCOPES);
      const invalidScopes = data.scopes.filter((s) => !validScopes.includes(s));
      if (invalidScopes.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid scopes: ${invalidScopes.join(', ')}`,
        });
      }
    }

    const apiKey = await updateApiKey(keyId, userId, data);

    res.json({
      success: true,
      data: apiKey,
    });
  } catch (error) {
    if ((error as Error).message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/api-keys/:keyId
 * Revoke an API key
 */
router.delete('/:keyId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { keyId } = req.params;

    await revokeApiKey(keyId, userId);

    res.json({
      success: true,
      message: 'API key revoked',
    });
  } catch (error) {
    if ((error as Error).message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
      });
    }
    next(error);
  }
});

/**
 * POST /api/api-keys/:keyId/regenerate
 * Regenerate an API key (revoke old, create new)
 */
router.post('/:keyId/regenerate', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { keyId } = req.params;

    const newApiKey = await regenerateApiKey(keyId, userId);

    res.json({
      success: true,
      data: newApiKey,
      message: 'API key regenerated. Save the new secret key - it will not be shown again.',
    });
  } catch (error) {
    if ((error as Error).message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
      });
    }
    next(error);
  }
});

/**
 * GET /api/api-keys/:keyId/usage
 * Get API usage statistics
 */
router.get('/:keyId/usage', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { keyId } = req.params;
    const period = (req.query.period as 'hour' | 'day' | 'week' | 'month') || 'day';

    const stats = await getApiUsageStats(keyId, userId, period);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    if ((error as Error).message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
      });
    }
    next(error);
  }
});

export default router;
