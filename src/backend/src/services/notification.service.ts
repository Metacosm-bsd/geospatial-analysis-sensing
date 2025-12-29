/**
 * Notification Service
 * Sprint 43-48: Collaboration & Multi-User
 *
 * Handles user notifications for mentions, replies, and system events.
 */

import { prisma } from '../config/database.js';
import type { NotificationType } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  targetType?: string;
  targetId?: string;
}

// ============================================================================
// Notifications
// ============================================================================

/**
 * Create a notification
 */
export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      targetType: input.targetType,
      targetId: input.targetId,
    },
  });
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  userId: string,
  options: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}
) {
  const { unreadOnly = false, limit = 50, offset = 0 } = options;

  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return notifications;
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string) {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string, userId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new Error('Notification not found');
  }

  if (notification.userId !== userId) {
    throw new Error('Permission denied');
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string, userId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new Error('Notification not found');
  }

  if (notification.userId !== userId) {
    throw new Error('Permission denied');
  }

  return prisma.notification.delete({
    where: { id: notificationId },
  });
}

/**
 * Delete all read notifications older than N days
 */
export async function cleanupOldNotifications(userId: string, daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return prisma.notification.deleteMany({
    where: {
      userId,
      isRead: true,
      createdAt: { lt: cutoffDate },
    },
  });
}

// ============================================================================
// Notification Helpers
// ============================================================================

/**
 * Send analysis complete notification
 */
export async function notifyAnalysisComplete(
  userId: string,
  analysisId: string,
  analysisName: string
) {
  return createNotification({
    userId,
    type: 'ANALYSIS_COMPLETE',
    title: 'Analysis Complete',
    message: `Your analysis "${analysisName}" has completed successfully.`,
    targetType: 'analysis',
    targetId: analysisId,
  });
}

/**
 * Send analysis failed notification
 */
export async function notifyAnalysisFailed(
  userId: string,
  analysisId: string,
  analysisName: string,
  errorMessage: string
) {
  return createNotification({
    userId,
    type: 'ANALYSIS_FAILED',
    title: 'Analysis Failed',
    message: `Your analysis "${analysisName}" failed: ${errorMessage.substring(0, 100)}`,
    targetType: 'analysis',
    targetId: analysisId,
  });
}

/**
 * Send report ready notification
 */
export async function notifyReportReady(
  userId: string,
  reportId: string,
  reportName: string
) {
  return createNotification({
    userId,
    type: 'REPORT_READY',
    title: 'Report Ready',
    message: `Your report "${reportName}" is ready for download.`,
    targetType: 'report',
    targetId: reportId,
  });
}

/**
 * Send invitation notification
 */
export async function notifyInvitation(
  userId: string,
  organizationId: string,
  organizationName: string,
  inviterName: string
) {
  return createNotification({
    userId,
    type: 'INVITATION',
    title: 'Organization Invitation',
    message: `${inviterName} invited you to join "${organizationName}".`,
    targetType: 'organization',
    targetId: organizationId,
  });
}

/**
 * Send project shared notification
 */
export async function notifyProjectShared(
  userId: string,
  projectId: string,
  projectName: string,
  sharerName: string
) {
  return createNotification({
    userId,
    type: 'PROJECT_SHARED',
    title: 'Project Shared',
    message: `${sharerName} shared the project "${projectName}" with you.`,
    targetType: 'project',
    targetId: projectId,
  });
}

/**
 * Send role changed notification
 */
export async function notifyRoleChanged(
  userId: string,
  organizationId: string,
  organizationName: string,
  newRole: string
) {
  return createNotification({
    userId,
    type: 'ROLE_CHANGED',
    title: 'Role Changed',
    message: `Your role in "${organizationName}" has been changed to ${newRole}.`,
    targetType: 'organization',
    targetId: organizationId,
  });
}
