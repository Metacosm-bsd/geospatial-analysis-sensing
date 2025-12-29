/**
 * Webhooks Routes
 * Sprint 49-54: Public API
 *
 * Handles webhook subscription management and delivery history.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import {
  createWebhook,
  getUserWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  regenerateWebhookSecret,
  getWebhookDeliveries,
  getDeliveryDetails,
  retryDelivery,
  testWebhook,
  WEBHOOK_EVENTS,
} from '../services/webhook.service.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ============================================================================
// Schemas
// ============================================================================

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  description: z.string().max(500).optional(),
  headers: z.record(z.string()).optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  description: z.string().max(500).optional(),
  headers: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/webhooks
 * List all webhooks for the current user
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const organizationId = req.query.organizationId as string | undefined;

    const webhooks = await getUserWebhooks(userId, organizationId);

    res.json({
      success: true,
      data: webhooks,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/webhooks
 * Create a new webhook
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const organizationId = req.body.organizationId || null;
    const data = createWebhookSchema.parse(req.body);

    // Validate events
    const validEvents = Object.keys(WEBHOOK_EVENTS);
    const invalidEvents = data.events.filter((e) => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid events: ${invalidEvents.join(', ')}`,
        validEvents,
      });
    }

    const webhook = await createWebhook(userId, organizationId, data);

    res.status(201).json({
      success: true,
      data: webhook,
      message: 'Webhook created. Save the secret - it will not be shown again.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/webhooks/events
 * Get available webhook events
 */
router.get('/events', (_req, res) => {
  res.json({
    success: true,
    data: WEBHOOK_EVENTS,
  });
});

/**
 * GET /api/webhooks/:webhookId
 * Get a specific webhook
 */
router.get('/:webhookId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { webhookId } = req.params;

    const webhook = await getWebhook(webhookId, userId);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    res.json({
      success: true,
      data: webhook,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/webhooks/:webhookId
 * Update a webhook
 */
router.patch('/:webhookId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { webhookId } = req.params;
    const data = updateWebhookSchema.parse(req.body);

    // Validate events if provided
    if (data.events) {
      const validEvents = Object.keys(WEBHOOK_EVENTS);
      const invalidEvents = data.events.filter((e) => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid events: ${invalidEvents.join(', ')}`,
          validEvents,
        });
      }
    }

    const webhook = await updateWebhook(webhookId, userId, data);

    res.json({
      success: true,
      data: webhook,
    });
  } catch (error) {
    if ((error as Error).message === 'Webhook not found') {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/webhooks/:webhookId
 * Delete a webhook
 */
router.delete('/:webhookId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { webhookId } = req.params;

    await deleteWebhook(webhookId, userId);

    res.json({
      success: true,
      message: 'Webhook deleted',
    });
  } catch (error) {
    if ((error as Error).message === 'Webhook not found') {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }
    next(error);
  }
});

/**
 * POST /api/webhooks/:webhookId/regenerate-secret
 * Regenerate webhook signing secret
 */
router.post('/:webhookId/regenerate-secret', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { webhookId } = req.params;

    const result = await regenerateWebhookSecret(webhookId, userId);

    res.json({
      success: true,
      data: result,
      message: 'Secret regenerated. Save it - it will not be shown again.',
    });
  } catch (error) {
    if ((error as Error).message === 'Webhook not found') {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }
    next(error);
  }
});

/**
 * POST /api/webhooks/:webhookId/test
 * Send a test webhook
 */
router.post('/:webhookId/test', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { webhookId } = req.params;

    const result = await testWebhook(webhookId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if ((error as Error).message === 'Webhook not found') {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }
    next(error);
  }
});

/**
 * GET /api/webhooks/:webhookId/deliveries
 * Get webhook delivery history
 */
router.get('/:webhookId/deliveries', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { webhookId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getWebhookDeliveries(webhookId, userId, { limit, offset });

    res.json({
      success: true,
      data: result.deliveries,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    if ((error as Error).message === 'Webhook not found') {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }
    next(error);
  }
});

/**
 * GET /api/webhooks/:webhookId/deliveries/:deliveryId
 * Get delivery details
 */
router.get('/:webhookId/deliveries/:deliveryId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { deliveryId } = req.params;

    const delivery = await getDeliveryDetails(deliveryId, userId);

    res.json({
      success: true,
      data: delivery,
    });
  } catch (error) {
    if ((error as Error).message === 'Delivery not found') {
      return res.status(404).json({
        success: false,
        error: 'Delivery not found',
      });
    }
    next(error);
  }
});

/**
 * POST /api/webhooks/:webhookId/deliveries/:deliveryId/retry
 * Retry a failed delivery
 */
router.post('/:webhookId/deliveries/:deliveryId/retry', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { deliveryId } = req.params;

    const result = await retryDelivery(deliveryId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Delivery not found') {
      return res.status(404).json({
        success: false,
        error: 'Delivery not found',
      });
    }
    if (errorMessage === 'Webhook is disabled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot retry - webhook is disabled',
      });
    }
    next(error);
  }
});

export default router;
