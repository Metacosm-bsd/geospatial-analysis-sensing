/**
 * Webhook Service
 * Sprint 49-54: Public API
 *
 * Handles webhook subscriptions and delivery with retry logic.
 */

import { prisma } from '../config/database.js';
import { createHash, createHmac, randomBytes } from 'crypto';
import type { WebhookDeliveryStatus } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

interface CreateWebhookInput {
  url: string;
  events: string[];
  description?: string;
  headers?: Record<string, string>;
}

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// Available webhook events
export const WEBHOOK_EVENTS = {
  // Project events
  'project.created': 'Triggered when a new project is created',
  'project.updated': 'Triggered when project details are updated',
  'project.deleted': 'Triggered when a project is deleted',

  // File events
  'file.uploaded': 'Triggered when a file is uploaded',
  'file.processed': 'Triggered when file processing completes',
  'file.deleted': 'Triggered when a file is deleted',

  // Analysis events
  'analysis.started': 'Triggered when an analysis begins',
  'analysis.completed': 'Triggered when an analysis completes successfully',
  'analysis.failed': 'Triggered when an analysis fails',

  // Report events
  'report.generated': 'Triggered when a report is generated',
  'report.downloaded': 'Triggered when a report is downloaded',

  // Member events
  'member.invited': 'Triggered when a team member is invited',
  'member.joined': 'Triggered when a member accepts an invitation',
  'member.removed': 'Triggered when a member is removed',
} as const;

// Retry configuration
const RETRY_DELAYS = [
  60 * 1000,        // 1 minute
  5 * 60 * 1000,    // 5 minutes
  30 * 60 * 1000,   // 30 minutes
  60 * 60 * 1000,   // 1 hour
  6 * 60 * 60 * 1000, // 6 hours
];

const MAX_RETRIES = RETRY_DELAYS.length;

// ============================================================================
// Webhook Management
// ============================================================================

/**
 * Create a new webhook subscription
 */
export async function createWebhook(
  userId: string,
  organizationId: string | null,
  input: CreateWebhookInput
) {
  // Generate signing secret
  const secret = randomBytes(32).toString('hex');

  const webhook = await prisma.webhook.create({
    data: {
      userId,
      organizationId,
      url: input.url,
      events: input.events,
      description: input.description,
      headers: input.headers || {},
      secret,
    },
  });

  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    description: webhook.description,
    secret, // Only returned on creation
    isActive: webhook.isActive,
    createdAt: webhook.createdAt,
  };
}

/**
 * Get user's webhooks
 */
export async function getUserWebhooks(userId: string, organizationId?: string) {
  const webhooks = await prisma.webhook.findMany({
    where: {
      userId,
      ...(organizationId && { organizationId }),
    },
    select: {
      id: true,
      url: true,
      events: true,
      description: true,
      isActive: true,
      lastTriggeredAt: true,
      createdAt: true,
      _count: {
        select: {
          deliveries: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return webhooks.map((w) => ({
    ...w,
    deliveryCount: w._count.deliveries,
    _count: undefined,
  }));
}

/**
 * Get a specific webhook
 */
export async function getWebhook(webhookId: string, userId: string) {
  return prisma.webhook.findFirst({
    where: { id: webhookId, userId },
    select: {
      id: true,
      url: true,
      events: true,
      description: true,
      headers: true,
      isActive: true,
      lastTriggeredAt: true,
      createdAt: true,
    },
  });
}

/**
 * Update a webhook
 */
export async function updateWebhook(
  webhookId: string,
  userId: string,
  data: {
    url?: string;
    events?: string[];
    description?: string;
    headers?: Record<string, string>;
    isActive?: boolean;
  }
) {
  const webhook = await prisma.webhook.findFirst({
    where: { id: webhookId, userId },
  });

  if (!webhook) {
    throw new Error('Webhook not found');
  }

  return prisma.webhook.update({
    where: { id: webhookId },
    data: {
      url: data.url,
      events: data.events,
      description: data.description,
      headers: data.headers,
      isActive: data.isActive,
    },
    select: {
      id: true,
      url: true,
      events: true,
      description: true,
      isActive: true,
    },
  });
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(webhookId: string, userId: string) {
  const webhook = await prisma.webhook.findFirst({
    where: { id: webhookId, userId },
  });

  if (!webhook) {
    throw new Error('Webhook not found');
  }

  await prisma.webhook.delete({ where: { id: webhookId } });
}

/**
 * Regenerate webhook secret
 */
export async function regenerateWebhookSecret(webhookId: string, userId: string) {
  const webhook = await prisma.webhook.findFirst({
    where: { id: webhookId, userId },
  });

  if (!webhook) {
    throw new Error('Webhook not found');
  }

  const newSecret = randomBytes(32).toString('hex');

  await prisma.webhook.update({
    where: { id: webhookId },
    data: { secret: newSecret },
  });

  return { secret: newSecret };
}

// ============================================================================
// Webhook Delivery
// ============================================================================

/**
 * Generate signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver webhook to endpoint
 */
async function deliverWebhook(
  webhook: { id: string; url: string; secret: string; headers: Record<string, unknown> },
  payload: WebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; statusCode?: number; error?: string; responseBody?: string }> {
  const body = JSON.stringify(payload);
  const signature = generateSignature(body, webhook.secret);
  const timestamp = Math.floor(Date.now() / 1000);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Id': webhook.id,
    'X-Webhook-Signature': `sha256=${signature}`,
    'X-Webhook-Timestamp': timestamp.toString(),
    'X-Delivery-Id': deliveryId,
    'User-Agent': 'LidarForest-Webhooks/1.0',
    ...(webhook.headers as Record<string, string>),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text().catch(() => '');

    return {
      success: response.ok,
      statusCode: response.status,
      responseBody: responseBody.substring(0, 1000), // Limit stored response
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Trigger webhooks for an event
 */
export async function triggerWebhooks(
  event: string,
  data: Record<string, unknown>,
  context: { userId?: string; organizationId?: string }
) {
  // Find all active webhooks subscribed to this event
  const webhooks = await prisma.webhook.findMany({
    where: {
      isActive: true,
      events: { has: event },
      OR: [
        { userId: context.userId },
        { organizationId: context.organizationId },
      ],
    },
  });

  if (webhooks.length === 0) {
    return { triggered: 0 };
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const deliveries = await Promise.all(
    webhooks.map(async (webhook) => {
      // Create delivery record
      const delivery = await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: payload as unknown as Record<string, unknown>,
          status: 'PENDING',
        },
      });

      // Attempt delivery
      const result = await deliverWebhook(
        {
          id: webhook.id,
          url: webhook.url,
          secret: webhook.secret,
          headers: webhook.headers as Record<string, unknown>,
        },
        payload,
        delivery.id
      );

      // Update delivery record
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: result.success ? 'DELIVERED' : 'FAILED',
          statusCode: result.statusCode,
          responseBody: result.responseBody || result.error,
          deliveredAt: result.success ? new Date() : null,
        },
      });

      // Update webhook last triggered
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastTriggeredAt: new Date() },
      });

      return {
        webhookId: webhook.id,
        deliveryId: delivery.id,
        success: result.success,
      };
    })
  );

  return {
    triggered: deliveries.length,
    deliveries,
  };
}

/**
 * Retry failed webhook deliveries
 */
export async function retryFailedDeliveries() {
  const now = new Date();

  // Find failed deliveries eligible for retry
  const failedDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: 'FAILED',
      attempts: { lt: MAX_RETRIES },
    },
    include: {
      webhook: true,
    },
    take: 100, // Process in batches
  });

  const results = await Promise.all(
    failedDeliveries.map(async (delivery) => {
      // Check if enough time has passed for retry
      const retryDelay = RETRY_DELAYS[delivery.attempts - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      const retryAfter = new Date(delivery.updatedAt.getTime() + retryDelay);

      if (now < retryAfter) {
        return { skipped: true, deliveryId: delivery.id };
      }

      if (!delivery.webhook.isActive) {
        return { skipped: true, deliveryId: delivery.id, reason: 'webhook_disabled' };
      }

      // Attempt redelivery
      const result = await deliverWebhook(
        {
          id: delivery.webhook.id,
          url: delivery.webhook.url,
          secret: delivery.webhook.secret,
          headers: delivery.webhook.headers as Record<string, unknown>,
        },
        delivery.payload as unknown as WebhookPayload,
        delivery.id
      );

      // Update delivery
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: result.success ? 'DELIVERED' : 'FAILED',
          statusCode: result.statusCode,
          responseBody: result.responseBody || result.error,
          attempts: delivery.attempts + 1,
          deliveredAt: result.success ? new Date() : null,
        },
      });

      return {
        deliveryId: delivery.id,
        success: result.success,
        attempt: delivery.attempts + 1,
      };
    })
  );

  return results.filter((r) => !r.skipped);
}

/**
 * Get webhook delivery history
 */
export async function getWebhookDeliveries(
  webhookId: string,
  userId: string,
  options: { limit?: number; offset?: number } = {}
) {
  // Verify ownership
  const webhook = await prisma.webhook.findFirst({
    where: { id: webhookId, userId },
  });

  if (!webhook) {
    throw new Error('Webhook not found');
  }

  const { limit = 50, offset = 0 } = options;

  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        event: true,
        status: true,
        statusCode: true,
        attempts: true,
        createdAt: true,
        deliveredAt: true,
      },
    }),
    prisma.webhookDelivery.count({ where: { webhookId } }),
  ]);

  return {
    deliveries,
    total,
    limit,
    offset,
  };
}

/**
 * Get a specific delivery details
 */
export async function getDeliveryDetails(deliveryId: string, userId: string) {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId },
    include: {
      webhook: {
        select: { userId: true },
      },
    },
  });

  if (!delivery || delivery.webhook.userId !== userId) {
    throw new Error('Delivery not found');
  }

  return {
    id: delivery.id,
    event: delivery.event,
    payload: delivery.payload,
    status: delivery.status,
    statusCode: delivery.statusCode,
    responseBody: delivery.responseBody,
    attempts: delivery.attempts,
    createdAt: delivery.createdAt,
    deliveredAt: delivery.deliveredAt,
  };
}

/**
 * Manually retry a specific delivery
 */
export async function retryDelivery(deliveryId: string, userId: string) {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId },
    include: { webhook: true },
  });

  if (!delivery || delivery.webhook.userId !== userId) {
    throw new Error('Delivery not found');
  }

  if (!delivery.webhook.isActive) {
    throw new Error('Webhook is disabled');
  }

  // Attempt redelivery
  const result = await deliverWebhook(
    {
      id: delivery.webhook.id,
      url: delivery.webhook.url,
      secret: delivery.webhook.secret,
      headers: delivery.webhook.headers as Record<string, unknown>,
    },
    delivery.payload as unknown as WebhookPayload,
    delivery.id
  );

  // Update delivery
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: result.success ? 'DELIVERED' : 'FAILED',
      statusCode: result.statusCode,
      responseBody: result.responseBody || result.error,
      attempts: delivery.attempts + 1,
      deliveredAt: result.success ? new Date() : null,
    },
  });

  return {
    success: result.success,
    statusCode: result.statusCode,
  };
}

/**
 * Test webhook endpoint
 */
export async function testWebhook(webhookId: string, userId: string) {
  const webhook = await prisma.webhook.findFirst({
    where: { id: webhookId, userId },
  });

  if (!webhook) {
    throw new Error('Webhook not found');
  }

  const testPayload: WebhookPayload = {
    event: 'test.ping',
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test webhook delivery',
      webhookId: webhook.id,
    },
  };

  // Create test delivery record
  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event: 'test.ping',
      payload: testPayload as unknown as Record<string, unknown>,
      status: 'PENDING',
    },
  });

  // Attempt delivery
  const result = await deliverWebhook(
    {
      id: webhook.id,
      url: webhook.url,
      secret: webhook.secret,
      headers: webhook.headers as Record<string, unknown>,
    },
    testPayload,
    delivery.id
  );

  // Update delivery record
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: result.success ? 'DELIVERED' : 'FAILED',
      statusCode: result.statusCode,
      responseBody: result.responseBody || result.error,
      deliveredAt: result.success ? new Date() : null,
    },
  });

  return {
    success: result.success,
    statusCode: result.statusCode,
    deliveryId: delivery.id,
    error: result.error,
  };
}
