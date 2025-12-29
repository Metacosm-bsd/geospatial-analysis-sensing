/**
 * Organization Service
 * Sprint 43-48: Collaboration & Multi-User
 *
 * Handles organization CRUD, member management, and project sharing.
 */

import { prisma } from '../config/database.js';
import { randomBytes } from 'crypto';
import type { OrgRole, ProjectAccessLevel, ActivityAction } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

interface CreateOrgInput {
  name: string;
  slug: string;
  description?: string;
  website?: string;
}

interface UpdateOrgInput {
  name?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  settings?: Record<string, unknown>;
}

interface InviteMemberInput {
  email: string;
  role: OrgRole;
}

interface ShareProjectInput {
  projectId: string;
  accessLevel: ProjectAccessLevel;
}

// ============================================================================
// Organization CRUD
// ============================================================================

/**
 * Create a new organization
 */
export async function createOrganization(userId: string, input: CreateOrgInput) {
  // Check if slug already exists
  const existing = await prisma.organization.findUnique({
    where: { slug: input.slug },
  });

  if (existing) {
    throw new Error('Organization slug already exists');
  }

  // Create organization and add user as owner
  const organization = await prisma.organization.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      website: input.website,
      members: {
        create: {
          userId,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      },
    },
    include: {
      members: {
        include: {
          // We'll need to join with users table
        },
      },
    },
  });

  // Log activity
  await logActivity(organization.id, userId, 'PROJECT_CREATED', 'organization', organization.id, organization.name);

  return organization;
}

/**
 * Get organizations for a user
 */
export async function getUserOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId, status: 'ACTIVE' },
    include: {
      organization: {
        include: {
          _count: {
            select: { members: true, projects: true },
          },
        },
      },
    },
  });

  return memberships.map((m) => ({
    ...m.organization,
    myRole: m.role,
    memberCount: m.organization._count.members,
    projectCount: m.organization._count.projects,
  }));
}

/**
 * Get organization by ID
 */
export async function getOrganization(orgId: string, userId: string) {
  // Check membership
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId },
    },
  });

  if (!membership) {
    throw new Error('You are not a member of this organization');
  }

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      _count: {
        select: { members: true, projects: true },
      },
    },
  });

  if (!organization) {
    return null;
  }

  return {
    ...organization,
    myRole: membership.role,
    memberCount: organization._count.members,
    projectCount: organization._count.projects,
  };
}

/**
 * Update organization
 */
export async function updateOrganization(orgId: string, userId: string, input: UpdateOrgInput) {
  // Check permissions (must be owner or admin)
  await checkPermission(orgId, userId, ['OWNER', 'ADMIN']);

  const organization = await prisma.organization.update({
    where: { id: orgId },
    data: {
      name: input.name,
      description: input.description,
      website: input.website,
      logoUrl: input.logoUrl,
      settings: input.settings as object | undefined,
    },
  });

  await logActivity(orgId, userId, 'ORG_SETTINGS_UPDATED', 'organization', orgId, organization.name);

  return organization;
}

/**
 * Delete organization
 */
export async function deleteOrganization(orgId: string, userId: string) {
  // Only owner can delete
  await checkPermission(orgId, userId, ['OWNER']);

  await prisma.organization.delete({
    where: { id: orgId },
  });
}

// ============================================================================
// Member Management
// ============================================================================

/**
 * Get organization members
 */
export async function getOrganizationMembers(orgId: string, userId: string) {
  // Check membership
  await checkMembership(orgId, userId);

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: orgId },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
  });

  // Get user details for each member
  const userIds = members.map((m) => m.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return members.map((m) => ({
    id: m.id,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    user: userMap.get(m.userId) || { id: m.userId, email: 'Unknown', name: 'Unknown' },
  }));
}

/**
 * Invite a member to organization
 */
export async function inviteMember(orgId: string, inviterUserId: string, input: InviteMemberInput) {
  // Check permissions
  await checkPermission(orgId, inviterUserId, ['OWNER', 'ADMIN']);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    // Check if already a member
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: existingUser.id },
      },
    });

    if (existingMember) {
      throw new Error('User is already a member of this organization');
    }
  }

  // Check for existing pending invitation
  const existingInvite = await prisma.invitation.findFirst({
    where: {
      organizationId: orgId,
      email: input.email,
      status: 'PENDING',
    },
  });

  if (existingInvite) {
    throw new Error('An invitation is already pending for this email');
  }

  // Create invitation
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = await prisma.invitation.create({
    data: {
      organizationId: orgId,
      email: input.email,
      role: input.role,
      token,
      invitedBy: inviterUserId,
      expiresAt,
    },
    include: {
      organization: { select: { name: true } },
    },
  });

  await logActivity(orgId, inviterUserId, 'MEMBER_INVITED', 'invitation', invitation.id, input.email);

  // TODO: Send invitation email

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    organizationName: invitation.organization.name,
  };
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(token: string, userId: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: true },
  });

  if (!invitation) {
    throw new Error('Invalid invitation');
  }

  if (invitation.status !== 'PENDING') {
    throw new Error('Invitation has already been used or cancelled');
  }

  if (new Date() > invitation.expiresAt) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'EXPIRED' },
    });
    throw new Error('Invitation has expired');
  }

  // Get user email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new Error('This invitation was sent to a different email address');
  }

  // Check if already a member
  const existingMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: invitation.organizationId, userId },
    },
  });

  if (existingMember) {
    throw new Error('You are already a member of this organization');
  }

  // Create membership and update invitation
  const [membership] = await prisma.$transaction([
    prisma.organizationMember.create({
      data: {
        organizationId: invitation.organizationId,
        userId,
        role: invitation.role,
        status: 'ACTIVE',
      },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    }),
  ]);

  await logActivity(invitation.organizationId, userId, 'MEMBER_JOINED', 'member', membership.id);

  return {
    id: membership.id,
    organizationId: membership.organizationId,
    organizationName: invitation.organization.name,
    role: membership.role,
  };
}

/**
 * Update member role
 */
export async function updateMemberRole(
  orgId: string,
  memberId: string,
  actorUserId: string,
  newRole: OrgRole
) {
  // Check permissions
  const actorMembership = await checkPermission(orgId, actorUserId, ['OWNER', 'ADMIN']);

  // Get target member
  const targetMember = await prisma.organizationMember.findUnique({
    where: { id: memberId },
  });

  if (!targetMember || targetMember.organizationId !== orgId) {
    throw new Error('Member not found');
  }

  // Cannot change owner's role
  if (targetMember.role === 'OWNER') {
    throw new Error('Cannot change owner role. Transfer ownership first.');
  }

  // Admins cannot promote to owner or change other admins
  if (actorMembership.role === 'ADMIN') {
    if (newRole === 'OWNER') {
      throw new Error('Only owner can transfer ownership');
    }
    if (targetMember.role === 'ADMIN') {
      throw new Error('Admins cannot modify other admins');
    }
  }

  const member = await prisma.organizationMember.update({
    where: { id: memberId },
    data: { role: newRole },
  });

  await logActivity(orgId, actorUserId, 'MEMBER_ROLE_CHANGED', 'member', memberId, undefined, {
    oldRole: targetMember.role,
    newRole,
  });

  return member;
}

/**
 * Remove a member from organization
 */
export async function removeMember(orgId: string, memberId: string, actorUserId: string) {
  // Check permissions
  const actorMembership = await checkPermission(orgId, actorUserId, ['OWNER', 'ADMIN']);

  // Get target member
  const targetMember = await prisma.organizationMember.findUnique({
    where: { id: memberId },
  });

  if (!targetMember || targetMember.organizationId !== orgId) {
    throw new Error('Member not found');
  }

  // Cannot remove owner
  if (targetMember.role === 'OWNER') {
    throw new Error('Cannot remove organization owner');
  }

  // Admins cannot remove other admins
  if (actorMembership.role === 'ADMIN' && targetMember.role === 'ADMIN') {
    throw new Error('Admins cannot remove other admins');
  }

  await prisma.organizationMember.delete({
    where: { id: memberId },
  });

  await logActivity(orgId, actorUserId, 'MEMBER_REMOVED', 'member', memberId);
}

/**
 * Leave organization
 */
export async function leaveOrganization(orgId: string, userId: string) {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId },
    },
  });

  if (!membership) {
    throw new Error('You are not a member of this organization');
  }

  if (membership.role === 'OWNER') {
    throw new Error('Owner cannot leave organization. Transfer ownership or delete the organization.');
  }

  await prisma.organizationMember.delete({
    where: { id: membership.id },
  });
}

// ============================================================================
// Project Sharing
// ============================================================================

/**
 * Get organization projects
 */
export async function getOrganizationProjects(orgId: string, userId: string) {
  await checkMembership(orgId, userId);

  const orgProjects = await prisma.orgProject.findMany({
    where: { organizationId: orgId },
    include: {
      // We need to fetch project details separately since it's just an ID reference
    },
  });

  // Fetch actual project details
  const projectIds = orgProjects.map((op) => op.projectId);
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { files: true, analyses: true } },
    },
  });

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return orgProjects.map((op) => ({
    ...op,
    project: projectMap.get(op.projectId),
  }));
}

/**
 * Share project with organization
 */
export async function shareProject(orgId: string, userId: string, input: ShareProjectInput) {
  // Check org membership
  await checkMembership(orgId, userId);

  // Verify user owns the project
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  if (project.userId !== userId) {
    throw new Error('You can only share projects you own');
  }

  // Check if already shared
  const existing = await prisma.orgProject.findUnique({
    where: {
      organizationId_projectId: { organizationId: orgId, projectId: input.projectId },
    },
  });

  if (existing) {
    // Update access level
    return prisma.orgProject.update({
      where: { id: existing.id },
      data: { accessLevel: input.accessLevel },
    });
  }

  // Create new share
  const orgProject = await prisma.orgProject.create({
    data: {
      organizationId: orgId,
      projectId: input.projectId,
      accessLevel: input.accessLevel,
    },
  });

  await logActivity(orgId, userId, 'PROJECT_SHARED', 'project', input.projectId, project.name);

  return orgProject;
}

/**
 * Unshare project from organization
 */
export async function unshareProject(orgId: string, projectId: string, userId: string) {
  // Check org membership with edit permissions
  await checkPermission(orgId, userId, ['OWNER', 'ADMIN', 'EDITOR']);

  // Verify user owns the project OR is org admin
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId },
    },
  });

  const isOrgAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN';
  const isProjectOwner = project.userId === userId;

  if (!isOrgAdmin && !isProjectOwner) {
    throw new Error('Permission denied');
  }

  await prisma.orgProject.deleteMany({
    where: { organizationId: orgId, projectId },
  });
}

// ============================================================================
// Activity Feed
// ============================================================================

/**
 * Get organization activity feed
 */
export async function getActivityFeed(orgId: string, userId: string, limit = 50, offset = 0) {
  await checkMembership(orgId, userId);

  const activities = await prisma.activityLog.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      actor: true,
    },
  });

  // Get actor user details
  const actorIds = activities.map((a) => a.actor?.userId).filter(Boolean) as string[];
  const users = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, avatarUrl: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return activities.map((a) => ({
    id: a.id,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    targetName: a.targetName,
    metadata: a.metadata,
    createdAt: a.createdAt,
    actor: a.actor ? userMap.get(a.actor.userId) : null,
  }));
}

// ============================================================================
// Helper Functions
// ============================================================================

async function checkMembership(orgId: string, userId: string) {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId },
    },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new Error('You are not a member of this organization');
  }

  return membership;
}

async function checkPermission(orgId: string, userId: string, allowedRoles: OrgRole[]) {
  const membership = await checkMembership(orgId, userId);

  if (!allowedRoles.includes(membership.role)) {
    throw new Error('Insufficient permission for this action');
  }

  return membership;
}

async function logActivity(
  orgId: string,
  actorUserId: string | undefined,
  action: ActivityAction,
  targetType: string,
  targetId?: string,
  targetName?: string,
  metadata?: Record<string, unknown>
) {
  // Get actor membership ID if actor is provided
  let actorId: string | undefined;
  if (actorUserId) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: actorUserId },
      },
    });
    actorId = membership?.id;
  }

  await prisma.activityLog.create({
    data: {
      organizationId: orgId,
      actorId,
      action,
      targetType,
      targetId,
      targetName,
      metadata: metadata as object | undefined,
    },
  });
}

export { logActivity };
