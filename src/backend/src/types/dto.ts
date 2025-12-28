/**
 * Data Transfer Objects for the LiDAR Forest Analysis API
 */
import { z } from 'zod';

// ============================================================================
// Auth DTOs
// ============================================================================

export const RegisterDtoSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
});

export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const RefreshTokenDtoSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenDtoSchema>;

export const ForgotPasswordDtoSchema = z.object({
  email: z.string().email('Valid email is required'),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordDtoSchema>;

export const ResetPasswordDtoSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordDtoSchema>;

// ============================================================================
// User DTOs
// ============================================================================

export const CreateUserDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(255),
  role: z.enum(['USER', 'ADMIN']).optional().default('USER'),
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

export const UpdateUserDtoSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;

// ============================================================================
// Project DTOs
// ============================================================================

export const GeoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()))),
});

export const CreateProjectDtoSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255),
  description: z.string().max(2000).optional(),
  bounds: GeoJsonPolygonSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateProjectDto = z.infer<typeof CreateProjectDtoSchema>;

export const UpdateProjectDtoSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'COMPLETED']).optional(),
  bounds: GeoJsonPolygonSchema.optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type UpdateProjectDto = z.infer<typeof UpdateProjectDtoSchema>;

export const ProjectFilterSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'COMPLETED']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type ProjectFilter = z.infer<typeof ProjectFilterSchema>;

// ============================================================================
// File DTOs
// ============================================================================

export const FileTypeSchema = z.enum(['LAS', 'LAZ', 'GEOTIFF', 'SHAPEFILE', 'GEOJSON', 'COG', 'OTHER']);

export type FileType = z.infer<typeof FileTypeSchema>;

export const CreateFileDtoSchema = z.object({
  name: z.string().min(1, 'Filename is required').max(255),
  mimeType: z.string(),
  size: z.number().positive('File size must be positive'),
  fileType: FileTypeSchema,
  storagePath: z.string().optional(),
  checksum: z.string().optional(),
});

export type CreateFileDto = z.infer<typeof CreateFileDtoSchema>;

export const InitUploadDtoSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255),
  size: z.number().positive('File size must be positive'),
  mimeType: z.string().optional(),
});

export type InitUploadDto = z.infer<typeof InitUploadDtoSchema>;

export const CompleteUploadDtoSchema = z.object({
  checksum: z.string().optional(),
});

export type CompleteUploadDto = z.infer<typeof CompleteUploadDtoSchema>;

// ============================================================================
// Response Types
// ============================================================================

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    emailVerified: boolean;
    avatarUrl: string | null;
    createdAt: Date;
  };
  accessToken: string;
  refreshToken: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  status: string;
  bounds: unknown | null;
  metadata: unknown | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  _count?: {
    files: number;
    analyses: number;
  };
}

export interface FileResponse {
  id: string;
  name: string;
  storagePath: string;
  mimeType: string;
  size: bigint;
  checksum: string | null;
  fileType: string;
  status: string;
  processingError: string | null;
  bounds: unknown | null;
  crs: string | null;
  pointCount: bigint | null;
  resolution: number | null;
  metadata: unknown | null;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}
