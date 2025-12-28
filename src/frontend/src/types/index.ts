// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'analyst' | 'viewer';
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Auth types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface RegisterResponse {
  user: User;
  message: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// Project types
export type ProjectStatus = 'active' | 'processing' | 'completed' | 'archived';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  fileCount: number;
  totalSize: number;
  createdAt: string;
  updatedAt: string;
  userId: string;
  analysesCount?: number;
  lastAnalysisAt?: string;
  thumbnailUrl?: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: ProjectStatus;
}

// File types
export interface ProjectFile {
  id: string;
  projectId: string;
  filename: string;
  originalName: string;
  fileType: 'las' | 'laz' | 'geotiff' | 'shapefile' | 'other';
  size: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  uploadedAt: string;
  processedAt?: string;
  metadata?: Record<string, unknown>;
}

// Analysis types
export interface Analysis {
  id: string;
  projectId: string;
  type: 'tree_detection' | 'species_classification' | 'biomass' | 'carbon' | 'full_inventory';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt?: string;
  completedAt?: string;
  results?: Record<string, unknown>;
  error?: string;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// API Error
export interface ApiError {
  message: string;
  code?: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
  statusCode: number;
}
