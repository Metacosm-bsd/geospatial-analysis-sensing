import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import * as authService from '../services/auth.service.js';
import * as userService from '../services/user.service.js';
import {
  RegisterDtoSchema,
  LoginDtoSchema,
  RefreshTokenDtoSchema,
  ForgotPasswordDtoSchema,
  ResetPasswordDtoSchema,
} from '../types/dto.js';

const router = Router();

/**
 * Middleware to validate request body with Zod schema
 */
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

/**
 * POST /api/v1/auth/register
 * Register a new user
 */
router.post(
  '/register',
  validateBody(RegisterDtoSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await authService.register(req.body);

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      logger.error('Registration error:', error);

      // Check for duplicate email error
      if (message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: 'Email already registered',
          message: 'An account with this email already exists',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Registration failed',
        message: 'An error occurred during registration',
      });
    }
  }
);

/**
 * POST /api/v1/auth/login
 * Authenticate user and return tokens
 */
router.post(
  '/login',
  validateBody(LoginDtoSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      logger.warn('Login failed:', message);

      res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: 'Invalid email or password',
      });
    }
  }
);

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  '/refresh',
  validateBody(RefreshTokenDtoSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshTokens(refreshToken);

      res.status(200).json({
        success: true,
        message: 'Tokens refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed';
      logger.warn('Token refresh failed:', message);

      res.status(401).json({
        success: false,
        error: 'Token refresh failed',
        message: 'Invalid or expired refresh token',
      });
    }
  }
);

/**
 * POST /api/v1/auth/logout
 * Revoke refresh token and logout
 */
router.post(
  '/logout',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { refreshToken } = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'User not authenticated',
        });
        return;
      }

      if (refreshToken) {
        // Logout from single device
        await authService.logout(userId, refreshToken);
      } else {
        // Logout from all devices
        await authService.logoutAll(userId);
      }

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed',
        message: 'An error occurred during logout',
      });
    }
  }
);

/**
 * GET /api/v1/auth/me
 * Get current user profile
 */
router.get(
  '/me',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'User not authenticated',
        });
        return;
      }

      const user = await userService.findById(userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'User account not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          user: userService.toUserResponse(user),
        },
      });
    } catch (error) {
      logger.error('Get user error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user profile',
        message: 'An error occurred while fetching user profile',
      });
    }
  }
);

/**
 * POST /api/v1/auth/forgot-password
 * Request password reset email
 */
router.post(
  '/forgot-password',
  validateBody(ForgotPasswordDtoSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;
      const result = await authService.requestPasswordReset(email);

      // Always return success to prevent email enumeration
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error('Password reset request error:', error);
      // Still return success to prevent email enumeration
      res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }
  }
);

/**
 * POST /api/v1/auth/reset-password
 * Reset password using token
 */
router.post(
  '/reset-password',
  validateBody(ResetPasswordDtoSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, password } = req.body;
      await authService.resetPassword(token, password);

      res.status(200).json({
        success: true,
        message: 'Password reset successful. Please login with your new password.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset failed';
      logger.warn('Password reset failed:', message);

      res.status(400).json({
        success: false,
        error: 'Password reset failed',
        message: 'Invalid or expired password reset token',
      });
    }
  }
);

/**
 * POST /api/v1/auth/logout-all
 * Revoke all refresh tokens and logout from all devices
 */
router.post(
  '/logout-all',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'User not authenticated',
        });
        return;
      }

      await authService.logoutAll(userId);

      res.status(200).json({
        success: true,
        message: 'Logged out from all devices successfully',
      });
    } catch (error) {
      logger.error('Logout all error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed',
        message: 'An error occurred during logout',
      });
    }
  }
);

export default router;
