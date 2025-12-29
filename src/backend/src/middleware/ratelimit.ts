/**
 * Rate Limiting Middleware
 * Sprint 49-54: Public API
 *
 * Implements token bucket rate limiting with Redis backing.
 */

import { Request, Response, NextFunction } from 'express';
import { validateApiKey, checkRateLimit, logApiUsage } from '../services/apikey.service.js';

// In-memory fallback store (for development without Redis)
const memoryStore = new Map<string, { count: number; resetAt: number }>();

// ============================================================================
// Types
// ============================================================================

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        userId: string;
        organizationId: string | null;
        scopes: string[];
        tier: string;
        rateLimitPerMinute: number;
        rateLimitPerDay: number;
      };
      rateLimit?: RateLimitInfo;
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract API key from request
 */
function extractApiKey(req: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check X-API-Key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  // Check query parameter (not recommended, but supported)
  if (typeof req.query.api_key === 'string') {
    return req.query.api_key;
  }

  return null;
}

/**
 * In-memory rate limit check (fallback)
 */
function checkMemoryRateLimit(
  keyId: string,
  limit: number
): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const key = `rate:${keyId}`;

  let entry = memoryStore.get(key);

  // Clean up expired entry or create new one
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryStore.set(key, entry);
  }

  const remaining = Math.max(0, limit - entry.count);
  const allowed = remaining > 0;

  if (allowed) {
    entry.count++;
  }

  return {
    allowed,
    remaining: Math.max(0, remaining - 1),
    resetAt: new Date(entry.resetAt),
  };
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * API Key Authentication Middleware
 * Validates API key and attaches key info to request
 */
export function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Missing API key',
      hint: 'Provide API key via Authorization: Bearer <key> header or X-API-Key header',
    });
  }

  // Validate API key
  validateApiKey(apiKey)
    .then((validatedKey) => {
      if (!validatedKey) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired API key',
        });
      }

      req.apiKey = validatedKey;
      next();
    })
    .catch((error) => {
      console.error('API key validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Authentication error',
      });
    });
}

/**
 * Rate Limiting Middleware
 * Enforces rate limits based on API key tier
 */
export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  if (!req.apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required for rate limiting',
    });
  }

  const { id: keyId, rateLimitPerMinute, rateLimitPerDay } = req.apiKey;

  // Check rate limit
  checkRateLimit(keyId, { perMinute: rateLimitPerMinute, perDay: rateLimitPerDay })
    .then((result) => {
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', rateLimitPerMinute);
      res.setHeader('X-RateLimit-Remaining', result.remaining.minute);
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

      if (rateLimitPerDay > 0) {
        res.setHeader('X-RateLimit-Daily-Limit', rateLimitPerDay);
        res.setHeader('X-RateLimit-Daily-Remaining', result.remaining.day);
      }

      req.rateLimit = {
        limit: rateLimitPerMinute,
        remaining: result.remaining.minute,
        reset: result.resetAt,
      };

      if (!result.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
          limits: {
            perMinute: { limit: rateLimitPerMinute, remaining: result.remaining.minute },
            perDay: rateLimitPerDay > 0 ? { limit: rateLimitPerDay, remaining: result.remaining.day } : null,
          },
        });
      }

      next();
    })
    .catch((error) => {
      console.error('Rate limit check error:', error);
      // Fail open in case of errors
      next();
    });
}

/**
 * Simple in-memory rate limiter (for non-API key endpoints)
 */
export function simpleRateLimiter(
  limit: number = 100,
  windowMs: number = 60 * 1000
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `simple:${ip}`;
    const now = Date.now();

    let entry = memoryStore.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      memoryStore.set(key, entry);
    }

    const remaining = Math.max(0, limit - entry.count);

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

    if (remaining <= 0) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter,
      });
    }

    entry.count++;
    next();
  };
}

/**
 * Scope Validation Middleware
 * Checks if API key has required scopes
 */
export function requireScopes(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
      });
    }

    const keyScopes = req.apiKey.scopes;
    const missingScopes = requiredScopes.filter((scope) => !keyScopes.includes(scope));

    if (missingScopes.length > 0) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: requiredScopes,
        missing: missingScopes,
      });
    }

    next();
  };
}

/**
 * Usage Logging Middleware
 * Logs API request for analytics
 */
export function logUsage(req: Request, res: Response, next: NextFunction) {
  if (!req.apiKey) {
    return next();
  }

  const startTime = Date.now();

  // Hook into response finish
  res.on('finish', () => {
    const responseTimeMs = Date.now() - startTime;

    logApiUsage({
      apiKeyId: req.apiKey!.id,
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
      responseTimeMs,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      requestSize: parseInt(req.headers['content-length'] || '0', 10) || undefined,
    }).catch((error) => {
      console.error('Failed to log API usage:', error);
    });
  });

  next();
}

/**
 * Combined middleware for public API endpoints
 */
export function publicApiMiddleware() {
  return [authenticateApiKey, rateLimiter, logUsage];
}

export default {
  authenticateApiKey,
  rateLimiter,
  simpleRateLimiter,
  requireScopes,
  logUsage,
  publicApiMiddleware,
};
