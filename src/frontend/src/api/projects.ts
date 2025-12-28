import apiClient, { getErrorMessage } from './client';
import type {
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  PaginationParams,
  PaginatedResponse,
  ProjectFile,
  Analysis,
} from '../types';

// Projects API endpoints
const PROJECTS_ENDPOINTS = {
  base: '/projects',
  byId: (id: string) => `/projects/${id}`,
  files: (id: string) => `/projects/${id}/files`,
  fileById: (projectId: string, fileId: string) => `/projects/${projectId}/files/${fileId}`,
  analyses: (id: string) => `/projects/${id}/analyses`,
  analysisById: (projectId: string, analysisId: string) =>
    `/projects/${projectId}/analyses/${analysisId}`,
};

/**
 * Get all projects with pagination and filtering
 */
export async function getProjects(
  params?: PaginationParams & { status?: string }
): Promise<PaginatedResponse<Project>> {
  try {
    const queryParams = new URLSearchParams();

    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.status) queryParams.append('status', params.status);

    const url = queryParams.toString()
      ? `${PROJECTS_ENDPOINTS.base}?${queryParams.toString()}`
      : PROJECTS_ENDPOINTS.base;

    const response = await apiClient.get<PaginatedResponse<Project>>(url);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string): Promise<Project> {
  try {
    const response = await apiClient.get<{ project: Project }>(PROJECTS_ENDPOINTS.byId(id));
    return response.data.project;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectRequest): Promise<Project> {
  try {
    const response = await apiClient.post<{ project: Project }>(PROJECTS_ENDPOINTS.base, data);
    return response.data.project;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Update an existing project
 */
export async function updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
  try {
    const response = await apiClient.patch<{ project: Project }>(
      PROJECTS_ENDPOINTS.byId(id),
      data
    );
    return response.data.project;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Delete a project
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    await apiClient.delete(PROJECTS_ENDPOINTS.byId(id));
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get project files
 */
export async function getProjectFiles(
  projectId: string,
  params?: PaginationParams
): Promise<PaginatedResponse<ProjectFile>> {
  try {
    const queryParams = new URLSearchParams();

    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const url = queryParams.toString()
      ? `${PROJECTS_ENDPOINTS.files(projectId)}?${queryParams.toString()}`
      : PROJECTS_ENDPOINTS.files(projectId);

    const response = await apiClient.get<PaginatedResponse<ProjectFile>>(url);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Delete a project file
 */
export async function deleteProjectFile(projectId: string, fileId: string): Promise<void> {
  try {
    await apiClient.delete(PROJECTS_ENDPOINTS.fileById(projectId, fileId));
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get project analyses
 */
export async function getProjectAnalyses(
  projectId: string,
  params?: PaginationParams
): Promise<PaginatedResponse<Analysis>> {
  try {
    const queryParams = new URLSearchParams();

    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const url = queryParams.toString()
      ? `${PROJECTS_ENDPOINTS.analyses(projectId)}?${queryParams.toString()}`
      : PROJECTS_ENDPOINTS.analyses(projectId);

    const response = await apiClient.get<PaginatedResponse<Analysis>>(url);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get a single analysis
 */
export async function getAnalysis(projectId: string, analysisId: string): Promise<Analysis> {
  try {
    const response = await apiClient.get<{ analysis: Analysis }>(
      PROJECTS_ENDPOINTS.analysisById(projectId, analysisId)
    );
    return response.data.analysis;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Start a new analysis
 */
export async function startAnalysis(
  projectId: string,
  type: Analysis['type'],
  options?: Record<string, unknown>
): Promise<Analysis> {
  try {
    const response = await apiClient.post<{ analysis: Analysis }>(
      PROJECTS_ENDPOINTS.analyses(projectId),
      { type, options }
    );
    return response.data.analysis;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Cancel an analysis
 */
export async function cancelAnalysis(projectId: string, analysisId: string): Promise<void> {
  try {
    await apiClient.post(`${PROJECTS_ENDPOINTS.analysisById(projectId, analysisId)}/cancel`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
