/**
 * User Service - Handles all user-related database operations
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { CreateUserDto, UpdateUserDto, UserResponse } from '../types/dto.js';

const BCRYPT_ROUNDS = 12;

/**
 * Find a user by their email address
 */
export async function findByEmail(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return user;
  } catch (error) {
    logger.error('Error finding user by email:', error);
    throw error;
  }
}

/**
 * Find a user by their ID
 */
export async function findById(id: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
    });
    return user;
  } catch (error) {
    logger.error('Error finding user by ID:', error);
    throw error;
  }
}

/**
 * Create a new user with hashed password
 */
export async function createUser(data: CreateUserDto) {
  try {
    // Check if user already exists
    const existingUser = await findByEmail(data.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // Create the user
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        name: data.name,
        role: data.role || 'USER',
      },
    });

    logger.info(`User created successfully: ${user.id}`);
    return user;
  } catch (error) {
    logger.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Validate a user's password against the stored hash
 */
export async function validatePassword(
  user: { passwordHash: string },
  password: string
): Promise<boolean> {
  try {
    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid;
  } catch (error) {
    logger.error('Error validating password:', error);
    return false;
  }
}

/**
 * Update a user's profile information
 */
export async function updateUser(id: string, data: UpdateUserDto) {
  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      },
    });

    logger.info(`User updated successfully: ${user.id}`);
    return user;
  } catch (error) {
    logger.error('Error updating user:', error);
    throw error;
  }
}

/**
 * Update the user's last login timestamp
 */
export async function updateLastLogin(id: string) {
  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    logger.debug(`Updated last login for user: ${id}`);
    return user;
  } catch (error) {
    logger.error('Error updating last login:', error);
    throw error;
  }
}

/**
 * Update user's password (used for password reset)
 */
export async function updatePassword(id: string, newPassword: string) {
  try {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    const user = await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    logger.info(`Password updated for user: ${id}`);
    return user;
  } catch (error) {
    logger.error('Error updating password:', error);
    throw error;
  }
}

/**
 * Set a password reset token for a user
 */
export async function setPasswordResetToken(
  id: string,
  token: string,
  expiresAt: Date
) {
  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        passwordResetToken: token,
        passwordResetExpiresAt: expiresAt,
      },
    });

    logger.info(`Password reset token set for user: ${id}`);
    return user;
  } catch (error) {
    logger.error('Error setting password reset token:', error);
    throw error;
  }
}

/**
 * Find a user by their password reset token
 */
export async function findByResetToken(token: string) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiresAt: {
          gt: new Date(),
        },
      },
    });
    return user;
  } catch (error) {
    logger.error('Error finding user by reset token:', error);
    throw error;
  }
}

/**
 * Clear a user's password reset token
 */
export async function clearPasswordResetToken(id: string) {
  try {
    await prisma.user.update({
      where: { id },
      data: {
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    logger.debug(`Password reset token cleared for user: ${id}`);
  } catch (error) {
    logger.error('Error clearing password reset token:', error);
    throw error;
  }
}

/**
 * Verify a user's email
 */
export async function verifyEmail(id: string) {
  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    logger.info(`Email verified for user: ${id}`);
    return user;
  } catch (error) {
    logger.error('Error verifying email:', error);
    throw error;
  }
}

/**
 * Delete a user and all associated data
 */
export async function deleteUser(id: string) {
  try {
    await prisma.user.delete({
      where: { id },
    });

    logger.info(`User deleted: ${id}`);
  } catch (error) {
    logger.error('Error deleting user:', error);
    throw error;
  }
}

/**
 * Transform user object to safe response format (excludes sensitive data)
 */
export function toUserResponse(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export const userService = {
  findByEmail,
  findById,
  createUser,
  validatePassword,
  updateUser,
  updateLastLogin,
  updatePassword,
  setPasswordResetToken,
  findByResetToken,
  clearPasswordResetToken,
  verifyEmail,
  deleteUser,
  toUserResponse,
};

export default userService;
