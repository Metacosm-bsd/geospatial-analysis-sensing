/**
 * Auth Service - Handles authentication and authorization logic
 */
import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { generateTokens, verifyRefreshToken, type JwtPayload } from '../middleware/auth.js';
import type { RegisterDto, LoginDto, AuthResponse } from '../types/dto.js';
import * as userService from './user.service.js';

// Token expiry times
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const PASSWORD_RESET_EXPIRY_HOURS = 1;

/**
 * Register a new user and generate tokens
 */
export async function register(data: RegisterDto): Promise<AuthResponse> {
  try {
    // Create the user
    const user = await userService.createUser({
      email: data.email,
      password: data.password,
      name: data.name,
    });

    // Generate tokens
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'user' | 'admin',
    });

    // Store refresh token in database
    await storeRefreshToken(user.id, tokens.refreshToken);

    // Update last login
    await userService.updateLastLogin(user.id);

    logger.info(`User registered successfully: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error) {
    logger.error('Registration failed:', error);
    throw error;
  }
}

/**
 * Login user with email and password
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  try {
    // Find user by email
    const user = await userService.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Validate password
    const isValidPassword = await userService.validatePassword(user, password);
    if (!isValidPassword) {
      logger.warn(`Failed login attempt for email: ${email}`);
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'user' | 'admin',
    });

    // Store refresh token in database
    await storeRefreshToken(user.id, tokens.refreshToken);

    // Update last login
    await userService.updateLastLogin(user.id);

    logger.info(`User logged in successfully: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error) {
    logger.error('Login failed:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  try {
    // Verify the refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new Error('Invalid or expired refresh token');
    }

    // Check if token exists in database and is not revoked
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        userId: payload.id,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!storedToken) {
      throw new Error('Refresh token not found or revoked');
    }

    // Get fresh user data
    const user = await userService.findById(payload.id);
    if (!user) {
      throw new Error('User not found');
    }

    // Revoke the old refresh token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new token pair
    const newTokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase() as 'user' | 'admin',
    });

    // Store new refresh token
    await storeRefreshToken(user.id, newTokens.refreshToken);

    logger.debug(`Tokens refreshed for user: ${user.id}`);

    return newTokens;
  } catch (error) {
    logger.error('Token refresh failed:', error);
    throw error;
  }
}

/**
 * Logout user by revoking refresh token
 */
export async function logout(userId: string, refreshToken: string): Promise<void> {
  try {
    // Revoke the specific refresh token
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        token: refreshToken,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    logger.info(`User logged out: ${userId}`);
  } catch (error) {
    logger.error('Logout failed:', error);
    throw error;
  }
}

/**
 * Logout user from all devices by revoking all refresh tokens
 */
export async function logoutAll(userId: string): Promise<void> {
  try {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    logger.info(`User logged out from all devices: ${userId}`);
  } catch (error) {
    logger.error('Logout all failed:', error);
    throw error;
  }
}

/**
 * Request password reset - generates and stores reset token
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await userService.findByEmail(email);

    // Always return success message to prevent email enumeration
    if (!user) {
      logger.debug(`Password reset requested for non-existent email: ${email}`);
      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      };
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token expiry (1 hour from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_EXPIRY_HOURS);

    // Store hashed token in database
    await userService.setPasswordResetToken(user.id, hashedToken, expiresAt);

    // In a real application, you would send an email here
    // For now, we'll log the token (only in development)
    if (config.isDevelopment) {
      logger.info(`Password reset token for ${email}: ${resetToken}`);
    }

    logger.info(`Password reset requested for user: ${user.id}`);

    return {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    };
  } catch (error) {
    logger.error('Password reset request failed:', error);
    throw error;
  }
}

/**
 * Reset password using reset token
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  try {
    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await userService.findByResetToken(hashedToken);

    if (!user) {
      throw new Error('Invalid or expired password reset token');
    }

    // Update password and clear reset token
    await userService.updatePassword(user.id, newPassword);

    // Revoke all existing refresh tokens for security
    await logoutAll(user.id);

    logger.info(`Password reset completed for user: ${user.id}`);
  } catch (error) {
    logger.error('Password reset failed:', error);
    throw error;
  }
}

/**
 * Store refresh token in database
 */
async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
}

/**
 * Clean up expired refresh tokens (should be run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });

    logger.info(`Cleaned up ${result.count} expired/revoked refresh tokens`);
    return result.count;
  } catch (error) {
    logger.error('Token cleanup failed:', error);
    throw error;
  }
}

/**
 * Validate that a user exists and return their profile
 */
export async function validateUser(userId: string) {
  const user = await userService.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  return userService.toUserResponse(user);
}

export const authService = {
  register,
  login,
  refreshTokens,
  logout,
  logoutAll,
  requestPasswordReset,
  resetPassword,
  cleanupExpiredTokens,
  validateUser,
};

export default authService;
