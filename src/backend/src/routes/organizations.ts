/**
 * Organization Routes
 * Sprint 43-48: Collaboration & Multi-User
 *
 * Handles team workspaces, member management, and organization settings.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as orgService from '../services/organization.service.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(500).optional(),
  website: z.string().url().optional(),
});

const UpdateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  website: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  settings: z.record(z.unknown()).optional(),
});

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'EDITOR', 'VIEWER']).default('MEMBER'),
});

const UpdateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'EDITOR', 'VIEWER']),
});

const ShareProjectSchema = z.object({
  projectId: z.string().uuid(),
  accessLevel: z.enum(['PRIVATE', 'ORG_READ', 'ORG_EDIT', 'PUBLIC']).default('ORG_READ'),
});

// ============================================================================
// Middleware
// ============================================================================

const validateBody = <T>(schema: z.ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
};

// ============================================================================
// Organization CRUD
// ============================================================================

/**
 * POST /api/v1/organizations
 * Create a new organization
 */
router.post(
  '/',
  authenticateToken,
  validateBody(CreateOrganizationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const organization = await orgService.createOrganization(userId, req.body);

      res.status(201).json({
        success: true,
        message: 'Organization created successfully',
        data: { organization },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create organization';
      logger.error('Create organization error:', error);

      if (message.includes('slug') && message.includes('exists')) {
        res.status(409).json({ success: false, error: 'Slug already taken' });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * GET /api/v1/organizations
 * List organizations the user belongs to
 */
router.get(
  '/',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const organizations = await orgService.getUserOrganizations(userId);

      res.status(200).json({
        success: true,
        data: { organizations },
      });
    } catch (error) {
      logger.error('List organizations error:', error);
      res.status(500).json({ success: false, error: 'Failed to list organizations' });
    }
  }
);

/**
 * GET /api/v1/organizations/:orgId
 * Get organization details
 */
router.get(
  '/:orgId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const organization = await orgService.getOrganization(orgId, userId);

      if (!organization) {
        res.status(404).json({ success: false, error: 'Organization not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: { organization },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get organization';
      logger.error('Get organization error:', error);

      if (message.includes('not a member')) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * PATCH /api/v1/organizations/:orgId
 * Update organization settings
 */
router.patch(
  '/:orgId',
  authenticateToken,
  validateBody(UpdateOrganizationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const organization = await orgService.updateOrganization(orgId, userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Organization updated successfully',
        data: { organization },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update organization';
      logger.error('Update organization error:', error);

      if (message.includes('permission')) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * DELETE /api/v1/organizations/:orgId
 * Delete organization (owner only)
 */
router.delete(
  '/:orgId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      await orgService.deleteOrganization(orgId, userId);

      res.status(200).json({
        success: true,
        message: 'Organization deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete organization';
      logger.error('Delete organization error:', error);

      if (message.includes('owner')) {
        res.status(403).json({ success: false, error: 'Only owner can delete organization' });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

// ============================================================================
// Member Management
// ============================================================================

/**
 * GET /api/v1/organizations/:orgId/members
 * List organization members
 */
router.get(
  '/:orgId/members',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const members = await orgService.getOrganizationMembers(orgId, userId);

      res.status(200).json({
        success: true,
        data: { members },
      });
    } catch (error) {
      logger.error('List members error:', error);
      res.status(500).json({ success: false, error: 'Failed to list members' });
    }
  }
);

/**
 * POST /api/v1/organizations/:orgId/invitations
 * Invite a new member
 */
router.post(
  '/:orgId/invitations',
  authenticateToken,
  validateBody(InviteMemberSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const invitation = await orgService.inviteMember(orgId, userId, req.body);

      res.status(201).json({
        success: true,
        message: 'Invitation sent successfully',
        data: { invitation },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invitation';
      logger.error('Invite member error:', error);

      if (message.includes('permission')) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }
      if (message.includes('already')) {
        res.status(409).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * POST /api/v1/organizations/invitations/:token/accept
 * Accept an invitation
 */
router.post(
  '/invitations/:token/accept',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { token } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const membership = await orgService.acceptInvitation(token, userId);

      res.status(200).json({
        success: true,
        message: 'Invitation accepted successfully',
        data: { membership },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept invitation';
      logger.error('Accept invitation error:', error);

      if (message.includes('expired') || message.includes('invalid')) {
        res.status(400).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * PATCH /api/v1/organizations/:orgId/members/:memberId
 * Update member role
 */
router.patch(
  '/:orgId/members/:memberId',
  authenticateToken,
  validateBody(UpdateMemberRoleSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId, memberId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const member = await orgService.updateMemberRole(orgId, memberId, userId, req.body.role);

      res.status(200).json({
        success: true,
        message: 'Member role updated successfully',
        data: { member },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update member';
      logger.error('Update member error:', error);

      if (message.includes('permission')) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * DELETE /api/v1/organizations/:orgId/members/:memberId
 * Remove a member
 */
router.delete(
  '/:orgId/members/:memberId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId, memberId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      await orgService.removeMember(orgId, memberId, userId);

      res.status(200).json({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove member';
      logger.error('Remove member error:', error);

      if (message.includes('owner')) {
        res.status(403).json({ success: false, error: 'Cannot remove organization owner' });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * POST /api/v1/organizations/:orgId/leave
 * Leave an organization
 */
router.post(
  '/:orgId/leave',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      await orgService.leaveOrganization(orgId, userId);

      res.status(200).json({
        success: true,
        message: 'Left organization successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to leave organization';
      logger.error('Leave organization error:', error);

      if (message.includes('owner')) {
        res.status(403).json({ success: false, error: 'Owner cannot leave. Transfer ownership first.' });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

// ============================================================================
// Project Sharing
// ============================================================================

/**
 * GET /api/v1/organizations/:orgId/projects
 * List shared projects in organization
 */
router.get(
  '/:orgId/projects',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const projects = await orgService.getOrganizationProjects(orgId, userId);

      res.status(200).json({
        success: true,
        data: { projects },
      });
    } catch (error) {
      logger.error('List org projects error:', error);
      res.status(500).json({ success: false, error: 'Failed to list projects' });
    }
  }
);

/**
 * POST /api/v1/organizations/:orgId/projects
 * Share a project with the organization
 */
router.post(
  '/:orgId/projects',
  authenticateToken,
  validateBody(ShareProjectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const sharedProject = await orgService.shareProject(orgId, userId, req.body);

      res.status(201).json({
        success: true,
        message: 'Project shared successfully',
        data: { sharedProject },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to share project';
      logger.error('Share project error:', error);

      if (message.includes('permission') || message.includes('owner')) {
        res.status(403).json({ success: false, error: 'You can only share projects you own' });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * DELETE /api/v1/organizations/:orgId/projects/:projectId
 * Unshare a project from the organization
 */
router.delete(
  '/:orgId/projects/:projectId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId, projectId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      await orgService.unshareProject(orgId, projectId, userId);

      res.status(200).json({
        success: true,
        message: 'Project unshared successfully',
      });
    } catch (error) {
      logger.error('Unshare project error:', error);
      res.status(500).json({ success: false, error: 'Failed to unshare project' });
    }
  }
);

// ============================================================================
// Activity Feed
// ============================================================================

/**
 * GET /api/v1/organizations/:orgId/activity
 * Get organization activity feed
 */
router.get(
  '/:orgId/activity',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { orgId } = req.params;
      const { limit = '50', offset = '0' } = req.query;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const activities = await orgService.getActivityFeed(
        orgId,
        userId,
        parseInt(limit as string, 10),
        parseInt(offset as string, 10)
      );

      res.status(200).json({
        success: true,
        data: { activities },
      });
    } catch (error) {
      logger.error('Get activity feed error:', error);
      res.status(500).json({ success: false, error: 'Failed to get activity feed' });
    }
  }
);

export default router;
