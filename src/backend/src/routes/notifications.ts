/**
 * Notifications Routes
 * Sprint 43-48: Collaboration & Multi-User
 *
 * Handles user notification management.
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as notificationService from '../services/notification.service.js';

const router = Router();

/**
 * GET /api/v1/notifications
 * Get user notifications
 */
router.get(
  '/',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { unreadOnly, limit = '50', offset = '0' } = req.query;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const notifications = await notificationService.getNotifications(userId, {
        unreadOnly: unreadOnly === 'true',
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });

      res.status(200).json({
        success: true,
        data: { notifications },
      });
    } catch (error) {
      logger.error('Get notifications error:', error);
      res.status(500).json({ success: false, error: 'Failed to get notifications' });
    }
  }
);

/**
 * GET /api/v1/notifications/unread-count
 * Get unread notification count
 */
router.get(
  '/unread-count',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const count = await notificationService.getUnreadCount(userId);

      res.status(200).json({
        success: true,
        data: { count },
      });
    } catch (error) {
      logger.error('Get unread count error:', error);
      res.status(500).json({ success: false, error: 'Failed to get unread count' });
    }
  }
);

/**
 * POST /api/v1/notifications/:notificationId/read
 * Mark notification as read
 */
router.post(
  '/:notificationId/read',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { notificationId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const notification = await notificationService.markAsRead(notificationId, userId);

      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: { notification },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mark as read';
      logger.error('Mark as read error:', error);

      if (message.includes('not found')) {
        res.status(404).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * POST /api/v1/notifications/read-all
 * Mark all notifications as read
 */
router.post(
  '/read-all',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const result = await notificationService.markAllAsRead(userId);

      res.status(200).json({
        success: true,
        message: `Marked ${result.count} notifications as read`,
        data: { count: result.count },
      });
    } catch (error) {
      logger.error('Mark all as read error:', error);
      res.status(500).json({ success: false, error: 'Failed to mark all as read' });
    }
  }
);

/**
 * DELETE /api/v1/notifications/:notificationId
 * Delete a notification
 */
router.delete(
  '/:notificationId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { notificationId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      await notificationService.deleteNotification(notificationId, userId);

      res.status(200).json({
        success: true,
        message: 'Notification deleted',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete notification';
      logger.error('Delete notification error:', error);

      if (message.includes('not found')) {
        res.status(404).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * POST /api/v1/notifications/cleanup
 * Delete old read notifications
 */
router.post(
  '/cleanup',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { daysOld = '30' } = req.query;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const result = await notificationService.cleanupOldNotifications(
        userId,
        parseInt(daysOld as string, 10)
      );

      res.status(200).json({
        success: true,
        message: `Cleaned up ${result.count} old notifications`,
        data: { count: result.count },
      });
    } catch (error) {
      logger.error('Cleanup notifications error:', error);
      res.status(500).json({ success: false, error: 'Failed to cleanup notifications' });
    }
  }
);

export default router;
