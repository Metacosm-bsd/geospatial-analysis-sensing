/**
 * Comment & Annotation Service
 * Sprint 43-48: Collaboration & Multi-User
 *
 * Handles comments on projects/analyses and 3D viewer annotations.
 */

import { prisma } from '../config/database.js';
import type { CommentTargetType } from '@prisma/client';
import * as notificationService from './notification.service.js';

// ============================================================================
// Types
// ============================================================================

interface CreateCommentInput {
  content: string;
  targetType: CommentTargetType;
  targetId: string;
  parentId?: string;
  mentions?: string[];
}

interface CreateAnnotationInput {
  analysisId: string;
  title: string;
  description?: string;
  position: { x: number; y: number; z: number };
  cameraState?: {
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    target?: { x: number; y: number; z: number };
  };
  color?: string;
  icon?: string;
  isPublic?: boolean;
}

interface UpdateAnnotationInput {
  title?: string;
  description?: string;
  color?: string;
  icon?: string;
  isPublic?: boolean;
}

// ============================================================================
// Comments
// ============================================================================

/**
 * Get comments for a target
 */
export async function getComments(
  userId: string,
  targetType: string,
  targetId: string,
  limit = 50,
  offset = 0
) {
  // Verify user has access to target
  await verifyTargetAccess(userId, targetType as CommentTargetType, targetId);

  // Get top-level comments with replies
  const comments = await prisma.comment.findMany({
    where: {
      targetType: targetType as CommentTargetType,
      targetId,
      parentId: null,
      isDeleted: false,
    },
    include: {
      author: true,
      replies: {
        where: { isDeleted: false },
        include: {
          author: true,
          mentions: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      mentions: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  // Get author user details
  const authorIds = new Set<string>();
  comments.forEach((c) => {
    authorIds.add(c.author.userId);
    c.replies.forEach((r) => authorIds.add(r.author.userId));
  });

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(authorIds) } },
    select: { id: true, name: true, avatarUrl: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return comments.map((c) => formatComment(c, userMap));
}

/**
 * Create a new comment
 */
export async function createComment(userId: string, input: CreateCommentInput) {
  // Verify user has access to target
  await verifyTargetAccess(userId, input.targetType, input.targetId);

  // Find user's org membership for authoring
  const membership = await findMembershipForTarget(userId, input.targetType, input.targetId);

  if (!membership) {
    throw new Error('You must be an organization member to comment');
  }

  // Create comment
  const comment = await prisma.comment.create({
    data: {
      content: input.content,
      targetType: input.targetType,
      targetId: input.targetId,
      parentId: input.parentId,
      authorId: membership.id,
    },
    include: {
      author: true,
    },
  });

  // Handle mentions
  if (input.mentions && input.mentions.length > 0) {
    await prisma.commentMention.createMany({
      data: input.mentions.map((mentionedUserId) => ({
        commentId: comment.id,
        mentionedUserId,
      })),
    });

    // Send mention notifications
    for (const mentionedUserId of input.mentions) {
      await notificationService.createNotification({
        userId: mentionedUserId,
        type: 'MENTION',
        title: 'You were mentioned in a comment',
        message: `${comment.content.substring(0, 100)}...`,
        targetType: input.targetType.toLowerCase(),
        targetId: input.targetId,
      });
    }
  }

  // If this is a reply, notify the parent comment author
  if (input.parentId) {
    const parentComment = await prisma.comment.findUnique({
      where: { id: input.parentId },
      include: { author: true },
    });

    if (parentComment && parentComment.author.userId !== userId) {
      await notificationService.createNotification({
        userId: parentComment.author.userId,
        type: 'COMMENT_REPLY',
        title: 'Someone replied to your comment',
        message: `${comment.content.substring(0, 100)}...`,
        targetType: input.targetType.toLowerCase(),
        targetId: input.targetId,
      });
    }
  }

  // Get user details
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, avatarUrl: true },
  });

  return {
    id: comment.id,
    content: comment.content,
    targetType: comment.targetType,
    targetId: comment.targetId,
    parentId: comment.parentId,
    isEdited: comment.isEdited,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: user,
  };
}

/**
 * Update a comment
 */
export async function updateComment(commentId: string, userId: string, content: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { author: true },
  });

  if (!comment) {
    throw new Error('Comment not found');
  }

  if (comment.author.userId !== userId) {
    throw new Error('You can only edit your own comments');
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: {
      content,
      isEdited: true,
    },
    include: { author: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, avatarUrl: true },
  });

  return {
    id: updated.id,
    content: updated.content,
    isEdited: updated.isEdited,
    updatedAt: updated.updatedAt,
    author: user,
  };
}

/**
 * Delete a comment (soft delete)
 */
export async function deleteComment(commentId: string, userId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { author: true },
  });

  if (!comment) {
    throw new Error('Comment not found');
  }

  // Check if user is author or org admin
  const isAuthor = comment.author.userId === userId;

  if (!isAuthor) {
    // Check if user is org admin
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId,
        organizationId: comment.author.organizationId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      throw new Error('Permission denied');
    }
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { isDeleted: true },
  });
}

// ============================================================================
// Annotations
// ============================================================================

/**
 * Get annotations for an analysis
 */
export async function getAnnotations(userId: string, analysisId: string) {
  // Verify user has access to analysis
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: { project: true },
  });

  if (!analysis) {
    throw new Error('Analysis not found');
  }

  // Get annotations (public ones + user's own)
  const annotations = await prisma.annotation.findMany({
    where: {
      analysisId,
      OR: [
        { isPublic: true },
        { author: { userId } },
      ],
    },
    include: { author: true },
    orderBy: { createdAt: 'desc' },
  });

  // Get author details
  const authorIds = annotations.map((a) => a.author.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, avatarUrl: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return annotations.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    position: a.position,
    cameraState: a.cameraState,
    color: a.color,
    icon: a.icon,
    isPublic: a.isPublic,
    isOwn: a.author.userId === userId,
    createdAt: a.createdAt,
    author: userMap.get(a.author.userId),
  }));
}

/**
 * Create an annotation
 */
export async function createAnnotation(userId: string, input: CreateAnnotationInput) {
  // Verify analysis exists and user has access
  const analysis = await prisma.analysis.findUnique({
    where: { id: input.analysisId },
    include: { project: true },
  });

  if (!analysis) {
    throw new Error('Analysis not found');
  }

  // Find user's membership
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, status: 'ACTIVE' },
  });

  if (!membership) {
    throw new Error('Organization membership required');
  }

  const annotation = await prisma.annotation.create({
    data: {
      authorId: membership.id,
      analysisId: input.analysisId,
      title: input.title,
      description: input.description,
      position: input.position as object,
      cameraState: input.cameraState as object | undefined,
      color: input.color,
      icon: input.icon,
      isPublic: input.isPublic ?? true,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, avatarUrl: true },
  });

  return {
    id: annotation.id,
    title: annotation.title,
    description: annotation.description,
    position: annotation.position,
    cameraState: annotation.cameraState,
    color: annotation.color,
    icon: annotation.icon,
    isPublic: annotation.isPublic,
    isOwn: true,
    createdAt: annotation.createdAt,
    author: user,
  };
}

/**
 * Update an annotation
 */
export async function updateAnnotation(
  annotationId: string,
  userId: string,
  input: UpdateAnnotationInput
) {
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    include: { author: true },
  });

  if (!annotation) {
    throw new Error('Annotation not found');
  }

  if (annotation.author.userId !== userId) {
    throw new Error('You can only edit your own annotations');
  }

  const updated = await prisma.annotation.update({
    where: { id: annotationId },
    data: {
      title: input.title,
      description: input.description,
      color: input.color,
      icon: input.icon,
      isPublic: input.isPublic,
    },
  });

  return updated;
}

/**
 * Delete an annotation
 */
export async function deleteAnnotation(annotationId: string, userId: string) {
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    include: { author: true },
  });

  if (!annotation) {
    throw new Error('Annotation not found');
  }

  if (annotation.author.userId !== userId) {
    throw new Error('You can only delete your own annotations');
  }

  await prisma.annotation.delete({
    where: { id: annotationId },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

async function verifyTargetAccess(userId: string, targetType: CommentTargetType, targetId: string) {
  switch (targetType) {
    case 'PROJECT': {
      const project = await prisma.project.findUnique({ where: { id: targetId } });
      if (!project) throw new Error('Project not found');
      // Check if user owns it or has org access
      if (project.userId !== userId) {
        const hasOrgAccess = await checkOrgProjectAccess(userId, targetId);
        if (!hasOrgAccess) throw new Error('Access denied');
      }
      break;
    }
    case 'ANALYSIS': {
      const analysis = await prisma.analysis.findUnique({
        where: { id: targetId },
        include: { project: true },
      });
      if (!analysis) throw new Error('Analysis not found');
      if (analysis.project.userId !== userId) {
        const hasOrgAccess = await checkOrgProjectAccess(userId, analysis.projectId);
        if (!hasOrgAccess) throw new Error('Access denied');
      }
      break;
    }
    case 'REPORT': {
      const report = await prisma.report.findUnique({
        where: { id: targetId },
        include: { project: true },
      });
      if (!report) throw new Error('Report not found');
      if (report.project.userId !== userId) {
        const hasOrgAccess = await checkOrgProjectAccess(userId, report.projectId);
        if (!hasOrgAccess) throw new Error('Access denied');
      }
      break;
    }
    case 'FILE': {
      const file = await prisma.file.findUnique({
        where: { id: targetId },
        include: { project: true },
      });
      if (!file) throw new Error('File not found');
      if (file.project.userId !== userId) {
        const hasOrgAccess = await checkOrgProjectAccess(userId, file.projectId);
        if (!hasOrgAccess) throw new Error('Access denied');
      }
      break;
    }
  }
}

async function checkOrgProjectAccess(userId: string, projectId: string): Promise<boolean> {
  // Check if project is shared with any org the user belongs to
  const userOrgs = await prisma.organizationMember.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { organizationId: true },
  });

  const orgIds = userOrgs.map((o) => o.organizationId);

  const sharedProject = await prisma.orgProject.findFirst({
    where: {
      projectId,
      organizationId: { in: orgIds },
    },
  });

  return !!sharedProject;
}

async function findMembershipForTarget(
  userId: string,
  targetType: CommentTargetType,
  targetId: string
) {
  // Find the org this target belongs to
  let projectId: string | undefined;

  switch (targetType) {
    case 'PROJECT':
      projectId = targetId;
      break;
    case 'ANALYSIS': {
      const analysis = await prisma.analysis.findUnique({ where: { id: targetId } });
      projectId = analysis?.projectId;
      break;
    }
    case 'REPORT': {
      const report = await prisma.report.findUnique({ where: { id: targetId } });
      projectId = report?.projectId;
      break;
    }
    case 'FILE': {
      const file = await prisma.file.findUnique({ where: { id: targetId } });
      projectId = file?.projectId;
      break;
    }
  }

  if (!projectId) return null;

  // Find org that has this project shared
  const orgProject = await prisma.orgProject.findFirst({
    where: { projectId },
  });

  if (!orgProject) {
    // Return any membership for user
    return prisma.organizationMember.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
  }

  // Return membership for this specific org
  return prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgProject.organizationId,
        userId,
      },
    },
  });
}

function formatComment(
  comment: {
    id: string;
    content: string;
    targetType: CommentTargetType;
    targetId: string;
    parentId: string | null;
    isEdited: boolean;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
    author: { id: string; userId: string };
    replies?: Array<{
      id: string;
      content: string;
      isEdited: boolean;
      createdAt: Date;
      author: { id: string; userId: string };
    }>;
    mentions?: Array<{ mentionedUserId: string }>;
  },
  userMap: Map<string, { id: string; name: string; avatarUrl: string | null }>
) {
  return {
    id: comment.id,
    content: comment.content,
    targetType: comment.targetType,
    targetId: comment.targetId,
    isEdited: comment.isEdited,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: userMap.get(comment.author.userId),
    replies: comment.replies?.map((r) => ({
      id: r.id,
      content: r.content,
      isEdited: r.isEdited,
      createdAt: r.createdAt,
      author: userMap.get(r.author.userId),
    })),
    mentionCount: comment.mentions?.length || 0,
  };
}
