/**
 * API Client Service
 * HTTP client for communicating with LiDAR Forest backend
 * Sprint 55-60: Mobile Field App
 */

import { useAppStore } from '../store/appStore';

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = __DEV__
  ? 'http://localhost:4000'
  : 'https://api.lidarforest.com';

const TIMEOUT = 30000; // 30 seconds

// ============================================================================
// Types
// ============================================================================

interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  timeout?: number;
}

interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
}

interface ApiError extends Error {
  status?: number;
  code?: string;
  data?: unknown;
}

// ============================================================================
// API Client
// ============================================================================

class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number;

  constructor(baseUrl: string, timeout: number) {
    this.baseUrl = baseUrl;
    this.defaultTimeout = timeout;
  }

  private getAuthHeaders(): Record<string, string> {
    const store = useAppStore.getState();
    const headers: Record<string, string> = {};

    if (store.auth.accessToken) {
      headers['Authorization'] = `Bearer ${store.auth.accessToken}`;
    } else if (store.auth.apiKey) {
      headers['X-API-Key'] = store.auth.apiKey;
    }

    return headers;
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(path, this.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  async request<T = unknown>(path: string, config: RequestConfig): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, config.params);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
      ...config.headers,
    };

    // Remove Content-Type for FormData
    if (config.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, config.timeout || this.defaultTimeout);

    try {
      const response = await fetch(url, {
        method: config.method,
        headers,
        body: config.body instanceof FormData
          ? config.body
          : config.body ? JSON.stringify(config.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error: ApiError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;

        try {
          error.data = await response.json();
        } catch {
          // Response body is not JSON
        }

        throw error;
      }

      const data = await response.json();

      return {
        data,
        status: response.status,
        headers: response.headers,
      };
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError: ApiError = new Error('Request timeout');
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }

      throw error;
    }
  }

  async get<T = unknown>(
    path: string,
    options?: { params?: Record<string, string | number | undefined>; headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'GET',
      ...options,
    });
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'POST',
      body,
      ...options,
    });
  }

  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'PUT',
      body,
      ...options,
    });
  }

  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'PATCH',
      body,
      ...options,
    });
  }

  async delete<T = unknown>(
    path: string,
    options?: { params?: Record<string, string | number | undefined>; headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'DELETE',
      ...options,
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const apiClient = new ApiClient(API_BASE_URL, TIMEOUT);

// ============================================================================
// Authentication API
// ============================================================================

export async function login(email: string, password: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
}> {
  const response = await apiClient.post<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; name: string };
  }>('/api/auth/login', { email, password });

  return response.data;
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const response = await apiClient.post<{
    accessToken: string;
    refreshToken: string;
  }>('/api/auth/refresh', { refreshToken });

  return response.data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout');
  } catch {
    // Ignore logout errors
  }
}

// ============================================================================
// Projects API
// ============================================================================

export async function fetchProjects(options?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<{
  data: Array<{
    id: string;
    name: string;
    description?: string;
    status: string;
    startDate: string;
    endDate?: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const response = await apiClient.get('/api/v1/projects', { params: options });
  return response.data as ReturnType<typeof fetchProjects> extends Promise<infer T> ? T : never;
}

export async function fetchProject(id: string): Promise<{
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  boundaryGeoJSON?: GeoJSON.Polygon;
  targetTreeCount?: number;
  assignedCrewIds: string[];
  status: string;
  startDate: string;
  endDate?: string;
}> {
  const response = await apiClient.get(`/api/v1/projects/${id}`);
  return response.data as ReturnType<typeof fetchProject> extends Promise<infer T> ? T : never;
}

// ============================================================================
// Species API
// ============================================================================

export async function fetchSpeciesList(): Promise<Array<{
  code: string;
  commonName: string;
  scientificName: string;
  genus: string;
  family: string;
  isCommon: boolean;
}>> {
  const response = await apiClient.get('/api/v1/species');
  return response.data as ReturnType<typeof fetchSpeciesList> extends Promise<infer T> ? T : never;
}

// ============================================================================
// Field Data API
// ============================================================================

export async function submitFieldTree(data: {
  projectId: string;
  plotId?: string;
  treeNumber: number;
  location: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy: number;
    timestamp: string;
  };
  dbh: number;
  height?: number;
  crownDiameter?: number;
  speciesCode?: string;
  healthStatus: string;
  crownClass: string;
  defects: Array<{ type: string; severity: string; notes?: string }>;
  notes?: string;
  measuredBy: string;
  localId: string;
}): Promise<{ id: string }> {
  const response = await apiClient.post('/api/v1/field/trees', data);
  return response.data as { id: string };
}

export async function submitFieldPlot(data: {
  projectId: string;
  plotNumber: string;
  centerPoint: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy: number;
  };
  radius: number;
  shape: string;
  notes?: string;
  measuredBy: string;
  localId: string;
}): Promise<{ id: string }> {
  const response = await apiClient.post('/api/v1/field/plots', data);
  return response.data as { id: string };
}

export async function uploadFieldPhoto(formData: FormData): Promise<{ url: string }> {
  const response = await apiClient.post('/api/v1/field/photos', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data as { url: string };
}
