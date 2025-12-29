/**
 * Developer Portal Types
 * Sprint 49-54: Public API
 */

export type ApiTier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  secretKey?: string; // Only returned on creation
  scopes: string[];
  tier: ApiTier;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyUsageStats {
  period: 'hour' | 'day' | 'week' | 'month';
  totalRequests: number;
  successfulRequests: number;
  errorRequests: number;
  avgResponseTime: number;
  byEndpoint: Record<string, number>;
  byStatus: Record<number, number>;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  description?: string;
  secret?: string;
  isActive: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  deliveryCount?: number;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  statusCode?: number;
  attempts: number;
  createdAt: string;
  deliveredAt: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  expiresAt?: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  description?: string;
}

export const API_SCOPES: Record<string, string> = {
  'read:projects': 'Read project information',
  'write:projects': 'Create and update projects',
  'delete:projects': 'Delete projects',
  'read:files': 'Read file information',
  'write:files': 'Upload files',
  'delete:files': 'Delete files',
  'read:analyses': 'Read analysis results',
  'write:analyses': 'Start analyses',
  'delete:analyses': 'Delete analyses',
  'read:reports': 'Read and download reports',
  'write:reports': 'Generate reports',
  'read:inventory': 'Read tree and stand data',
  'manage:webhooks': 'Manage webhook subscriptions',
};

export const WEBHOOK_EVENTS: Record<string, string> = {
  'project.created': 'Triggered when a new project is created',
  'project.updated': 'Triggered when project details are updated',
  'project.deleted': 'Triggered when a project is deleted',
  'file.uploaded': 'Triggered when a file is uploaded',
  'file.processed': 'Triggered when file processing completes',
  'file.deleted': 'Triggered when a file is deleted',
  'analysis.started': 'Triggered when an analysis begins',
  'analysis.completed': 'Triggered when an analysis completes successfully',
  'analysis.failed': 'Triggered when an analysis fails',
  'report.generated': 'Triggered when a report is generated',
  'report.downloaded': 'Triggered when a report is downloaded',
  'member.invited': 'Triggered when a team member is invited',
  'member.joined': 'Triggered when a member accepts an invitation',
  'member.removed': 'Triggered when a member is removed',
};

export const TIER_LIMITS: Record<ApiTier, { perMinute: number; perDay: number }> = {
  FREE: { perMinute: 60, perDay: 10000 },
  STARTER: { perMinute: 120, perDay: 50000 },
  PROFESSIONAL: { perMinute: 300, perDay: 200000 },
  ENTERPRISE: { perMinute: 1000, perDay: -1 },
};
