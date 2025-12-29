/**
 * API Key Service
 * Sprint 49-54: Public API
 *
 * Handles API key generation, validation, and management.
 */

import { prisma } from '../config/database.js';
import { createHash, randomBytes } from 'crypto';
import type { ApiTier } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  tier?: ApiTier;
  expiresAt?: Date;
  organizationId?: string;
}

interface ApiKeyWithSecret {
  id: string;
  name: string;
  keyPrefix: string;
  secretKey: string; // Only returned on creation
  scopes: string[];
  tier: ApiTier;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  createdAt: Date;
  expiresAt: Date | null;
}

interface ValidatedApiKey {
  id: string;
  userId: string;
  organizationId: string | null;
  scopes: string[];
  tier: ApiTier;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
}

// Available API scopes
export const API_SCOPES = {
  // Projects
  'read:projects': 'Read project information',
  'write:projects': 'Create and update projects',
  'delete:projects': 'Delete projects',

  // Files
  'read:files': 'Read file information',
  'write:files': 'Upload files',
  'delete:files': 'Delete files',

  // Analyses
  'read:analyses': 'Read analysis results',
  'write:analyses': 'Start analyses',
  'delete:analyses': 'Delete analyses',

  // Reports
  'read:reports': 'Read and download reports',
  'write:reports': 'Generate reports',

  // Trees/Inventory
  'read:inventory': 'Read tree and stand data',

  // Webhooks
  'manage:webhooks': 'Manage webhook subscriptions',
} as const;

// Rate limits by tier
export const TIER_LIMITS: Record<ApiTier, { perMinute: number; perDay: number }> = {
  FREE: { perMinute: 60, perDay: 10000 },
  STARTER: { perMinute: 120, perDay: 50000 },
  PROFESSIONAL: { perMinute: 300, perDay: 200000 },
  ENTERPRISE: { perMinute: 1000, perDay: -1 }, // -1 = unlimited
};

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a secure API key
 * Format: lf_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars total)
 */
function generateApiKey(): { key: string; prefix: string; hash: string } {
  const randomPart = randomBytes(24).toString('base64url');
  const key = `lf_live_${randomPart}`;
  const prefix = key.substring(0, 12); // "lf_live_XXXX"
  const hash = createHash('sha256').update(key).digest('hex');

  return { key, prefix, hash };
}

/**
 * Hash an API key for comparison
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ============================================================================
// API Key Management
// ============================================================================

/**
 * Create a new API key
 */
export async function createApiKey(
  userId: string,
  input: CreateApiKeyInput
): Promise<ApiKeyWithSecret> {
  const { key, prefix, hash } = generateApiKey();
  const tier = input.tier || 'FREE';
  const limits = TIER_LIMITS[tier];

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      organizationId: input.organizationId,
      name: input.name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: input.scopes || Object.keys(API_SCOPES),
      tier,
      rateLimitPerMinute: limits.perMinute,
      rateLimitPerDay: limits.perDay,
      expiresAt: input.expiresAt,
    },
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    secretKey: key, // Only returned on creation!
    scopes: apiKey.scopes,
    tier: apiKey.tier,
    rateLimitPerMinute: apiKey.rateLimitPerMinute,
    rateLimitPerDay: apiKey.rateLimitPerDay,
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expiresAt,
  };
}

/**
 * Validate an API key and return key info
 */
export async function validateApiKey(key: string): Promise<ValidatedApiKey | null> {
  const hash = hashApiKey(key);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
  });

  if (!apiKey) {
    return null;
  }

  // Check if active
  if (!apiKey.isActive) {
    return null;
  }

  // Check if revoked
  if (apiKey.revokedAt) {
    return null;
  }

  // Check expiration
  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    return null;
  }

  // Update last used timestamp (async, don't wait)
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    id: apiKey.id,
    userId: apiKey.userId,
    organizationId: apiKey.organizationId,
    scopes: apiKey.scopes,
    tier: apiKey.tier,
    rateLimitPerMinute: apiKey.rateLimitPerMinute,
    rateLimitPerDay: apiKey.rateLimitPerDay,
  };
}

/**
 * Get API keys for a user
 */
export async function getUserApiKeys(userId: string) {
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      tier: true,
      rateLimitPerMinute: true,
      rateLimitPerDay: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return apiKeys;
}

/**
 * Get a specific API key
 */
export async function getApiKey(keyId: string, userId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      tier: true,
      rateLimitPerMinute: true,
      rateLimitPerDay: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return apiKey;
}

/**
 * Update API key
 */
export async function updateApiKey(
  keyId: string,
  userId: string,
  data: { name?: string; scopes?: string[]; isActive?: boolean }
) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!apiKey) {
    throw new Error('API key not found');
  }

  return prisma.apiKey.update({
    where: { id: keyId },
    data: {
      name: data.name,
      scopes: data.scopes,
      isActive: data.isActive,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      isActive: true,
    },
  });
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string, userId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!apiKey) {
    throw new Error('API key not found');
  }

  return prisma.apiKey.update({
    where: { id: keyId },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });
}

/**
 * Regenerate an API key (revoke old, create new with same settings)
 */
export async function regenerateApiKey(keyId: string, userId: string): Promise<ApiKeyWithSecret> {
  const oldKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!oldKey) {
    throw new Error('API key not found');
  }

  // Revoke old key
  await prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false, revokedAt: new Date() },
  });

  // Create new key with same settings
  return createApiKey(userId, {
    name: oldKey.name,
    scopes: oldKey.scopes,
    tier: oldKey.tier,
    organizationId: oldKey.organizationId || undefined,
  });
}

// ============================================================================
// Usage Tracking
// ============================================================================

/**
 * Log API usage
 */
export async function logApiUsage(data: {
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  ipAddress?: string;
  userAgent?: string;
  requestSize?: number;
  responseSize?: number;
  errorMessage?: string;
}) {
  return prisma.apiUsageLog.create({ data });
}

/**
 * Get API usage statistics
 */
export async function getApiUsageStats(
  keyId: string,
  userId: string,
  period: 'hour' | 'day' | 'week' | 'month' = 'day'
) {
  // Verify ownership
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!apiKey) {
    throw new Error('API key not found');
  }

  const periodMap = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };

  const since = new Date(Date.now() - periodMap[period]);

  const logs = await prisma.apiUsageLog.findMany({
    where: {
      apiKeyId: keyId,
      createdAt: { gte: since },
    },
    select: {
      endpoint: true,
      method: true,
      statusCode: true,
      responseTimeMs: true,
      createdAt: true,
    },
  });

  // Calculate stats
  const totalRequests = logs.length;
  const successfulRequests = logs.filter((l) => l.statusCode < 400).length;
  const errorRequests = logs.filter((l) => l.statusCode >= 400).length;
  const avgResponseTime =
    logs.length > 0
      ? Math.round(logs.reduce((sum, l) => sum + l.responseTimeMs, 0) / logs.length)
      : 0;

  // Requests by endpoint
  const byEndpoint = logs.reduce((acc, log) => {
    const key = `${log.method} ${log.endpoint}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Requests by status code
  const byStatus = logs.reduce((acc, log) => {
    acc[log.statusCode] = (acc[log.statusCode] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return {
    period,
    totalRequests,
    successfulRequests,
    errorRequests,
    avgResponseTime,
    byEndpoint,
    byStatus,
  };
}

/**
 * Check if request count is within rate limits
 */
export async function checkRateLimit(
  apiKeyId: string,
  limits: { perMinute: number; perDay: number }
): Promise<{ allowed: boolean; remaining: { minute: number; day: number }; resetAt: Date }> {
  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [minuteCount, dayCount] = await Promise.all([
    prisma.apiUsageLog.count({
      where: { apiKeyId, createdAt: { gte: minuteAgo } },
    }),
    limits.perDay > 0
      ? prisma.apiUsageLog.count({
          where: { apiKeyId, createdAt: { gte: dayAgo } },
        })
      : 0,
  ]);

  const minuteRemaining = Math.max(0, limits.perMinute - minuteCount);
  const dayRemaining = limits.perDay > 0 ? Math.max(0, limits.perDay - dayCount) : -1;

  const allowed = minuteRemaining > 0 && (limits.perDay < 0 || dayRemaining > 0);

  return {
    allowed,
    remaining: { minute: minuteRemaining, day: dayRemaining },
    resetAt: new Date(minuteAgo.getTime() + 60 * 1000),
  };
}
