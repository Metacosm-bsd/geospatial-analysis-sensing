import { create } from 'zustand';
import * as projectsApi from '../api/projects';
import type {
  Project,
  ProjectFile,
  Analysis,
  CreateProjectRequest,
  UpdateProjectRequest,
  PaginationParams,
  ProjectStatus,
} from '../types';

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface ProjectFilters {
  search: string;
  status: ProjectStatus | '';
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface ProjectState {
  // Projects list
  projects: Project[];
  isLoadingProjects: boolean;
  projectsError: string | null;
  pagination: PaginationState;
  filters: ProjectFilters;

  // Current project
  currentProject: Project | null;
  isLoadingCurrentProject: boolean;
  currentProjectError: string | null;

  // Project files
  projectFiles: ProjectFile[];
  isLoadingFiles: boolean;
  filesError: string | null;
  filesPagination: PaginationState;

  // Project analyses
  projectAnalyses: Analysis[];
  isLoadingAnalyses: boolean;
  analysesError: string | null;
  analysesPagination: PaginationState;

  // CRUD loading states
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;

  // Actions - Projects
  fetchProjects: (params?: PaginationParams) => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (data: CreateProjectRequest) => Promise<Project>;
  updateProject: (id: string, data: UpdateProjectRequest) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;

  // Actions - Files
  fetchProjectFiles: (projectId: string, params?: PaginationParams) => Promise<void>;
  deleteProjectFile: (projectId: string, fileId: string) => Promise<void>;

  // Actions - Analyses
  fetchProjectAnalyses: (projectId: string, params?: PaginationParams) => Promise<void>;
  startAnalysis: (
    projectId: string,
    type: Analysis['type'],
    options?: Record<string, unknown>
  ) => Promise<Analysis>;
  cancelAnalysis: (projectId: string, analysisId: string) => Promise<void>;

  // Actions - Filters & Pagination
  setFilters: (filters: Partial<ProjectFilters>) => void;
  setPage: (page: number) => void;
  resetFilters: () => void;

  // Actions - State management
  clearCurrentProject: () => void;
  clearErrors: () => void;
}

const defaultPagination: PaginationState = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

const defaultFilters: ProjectFilters = {
  search: '',
  status: '',
  sortBy: 'updatedAt',
  sortOrder: 'desc',
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial state
  projects: [],
  isLoadingProjects: false,
  projectsError: null,
  pagination: { ...defaultPagination },
  filters: { ...defaultFilters },

  currentProject: null,
  isLoadingCurrentProject: false,
  currentProjectError: null,

  projectFiles: [],
  isLoadingFiles: false,
  filesError: null,
  filesPagination: { ...defaultPagination },

  projectAnalyses: [],
  isLoadingAnalyses: false,
  analysesError: null,
  analysesPagination: { ...defaultPagination },

  isCreating: false,
  isUpdating: false,
  isDeleting: false,

  // Projects actions
  fetchProjects: async (params?: PaginationParams) => {
    const { filters, pagination } = get();
    set({ isLoadingProjects: true, projectsError: null });

    try {
      const response = await projectsApi.getProjects({
        page: params?.page ?? pagination.page,
        limit: params?.limit ?? pagination.limit,
        sortBy: params?.sortBy ?? filters.sortBy,
        sortOrder: params?.sortOrder ?? filters.sortOrder,
        search: params?.search ?? filters.search,
        status: filters.status || undefined,
      });

      set({
        projects: response.data,
        pagination: response.pagination,
        isLoadingProjects: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch projects';
      set({
        projectsError: message,
        isLoadingProjects: false,
      });
    }
  },

  fetchProject: async (id: string) => {
    set({ isLoadingCurrentProject: true, currentProjectError: null });

    try {
      const project = await projectsApi.getProject(id);
      set({
        currentProject: project,
        isLoadingCurrentProject: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch project';
      set({
        currentProjectError: message,
        isLoadingCurrentProject: false,
      });
    }
  },

  createProject: async (data: CreateProjectRequest) => {
    set({ isCreating: true, projectsError: null });

    try {
      const project = await projectsApi.createProject(data);

      // Add new project to the list
      set((state) => ({
        projects: [project, ...state.projects],
        isCreating: false,
        pagination: {
          ...state.pagination,
          total: state.pagination.total + 1,
        },
      }));

      return project;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project';
      set({
        projectsError: message,
        isCreating: false,
      });
      throw error;
    }
  },

  updateProject: async (id: string, data: UpdateProjectRequest) => {
    set({ isUpdating: true, projectsError: null });

    try {
      const updatedProject = await projectsApi.updateProject(id, data);

      // Update project in list
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updatedProject : p)),
        currentProject:
          state.currentProject?.id === id ? updatedProject : state.currentProject,
        isUpdating: false,
      }));

      return updatedProject;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update project';
      set({
        projectsError: message,
        isUpdating: false,
      });
      throw error;
    }
  },

  deleteProject: async (id: string) => {
    set({ isDeleting: true, projectsError: null });

    try {
      await projectsApi.deleteProject(id);

      // Remove project from list
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
        isDeleting: false,
        pagination: {
          ...state.pagination,
          total: state.pagination.total - 1,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete project';
      set({
        projectsError: message,
        isDeleting: false,
      });
      throw error;
    }
  },

  // Files actions
  fetchProjectFiles: async (projectId: string, params?: PaginationParams) => {
    const { filesPagination } = get();
    set({ isLoadingFiles: true, filesError: null });

    try {
      const response = await projectsApi.getProjectFiles(projectId, {
        page: params?.page ?? filesPagination.page,
        limit: params?.limit ?? filesPagination.limit,
        sortBy: params?.sortBy ?? 'uploadedAt',
        sortOrder: params?.sortOrder ?? 'desc',
      });

      set({
        projectFiles: response.data,
        filesPagination: response.pagination,
        isLoadingFiles: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch files';
      set({
        filesError: message,
        isLoadingFiles: false,
      });
    }
  },

  deleteProjectFile: async (projectId: string, fileId: string) => {
    try {
      await projectsApi.deleteProjectFile(projectId, fileId);

      set((state) => ({
        projectFiles: state.projectFiles.filter((f) => f.id !== fileId),
        filesPagination: {
          ...state.filesPagination,
          total: state.filesPagination.total - 1,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete file';
      set({ filesError: message });
      throw error;
    }
  },

  // Analyses actions
  fetchProjectAnalyses: async (projectId: string, params?: PaginationParams) => {
    const { analysesPagination } = get();
    set({ isLoadingAnalyses: true, analysesError: null });

    try {
      const response = await projectsApi.getProjectAnalyses(projectId, {
        page: params?.page ?? analysesPagination.page,
        limit: params?.limit ?? analysesPagination.limit,
        sortBy: params?.sortBy ?? 'createdAt',
        sortOrder: params?.sortOrder ?? 'desc',
      });

      set({
        projectAnalyses: response.data,
        analysesPagination: response.pagination,
        isLoadingAnalyses: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch analyses';
      set({
        analysesError: message,
        isLoadingAnalyses: false,
      });
    }
  },

  startAnalysis: async (
    projectId: string,
    type: Analysis['type'],
    options?: Record<string, unknown>
  ) => {
    try {
      const analysis = await projectsApi.startAnalysis(projectId, type, options);

      set((state) => ({
        projectAnalyses: [analysis, ...state.projectAnalyses],
        analysesPagination: {
          ...state.analysesPagination,
          total: state.analysesPagination.total + 1,
        },
      }));

      return analysis;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start analysis';
      set({ analysesError: message });
      throw error;
    }
  },

  cancelAnalysis: async (projectId: string, analysisId: string) => {
    try {
      await projectsApi.cancelAnalysis(projectId, analysisId);

      set((state) => ({
        projectAnalyses: state.projectAnalyses.map((a) =>
          a.id === analysisId ? { ...a, status: 'failed' as const } : a
        ),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel analysis';
      set({ analysesError: message });
      throw error;
    }
  },

  // Filters & Pagination
  setFilters: (newFilters: Partial<ProjectFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      pagination: { ...state.pagination, page: 1 }, // Reset to first page on filter change
    }));
  },

  setPage: (page: number) => {
    set((state) => ({
      pagination: { ...state.pagination, page },
    }));
  },

  resetFilters: () => {
    set({
      filters: { ...defaultFilters },
      pagination: { ...defaultPagination },
    });
  },

  // State management
  clearCurrentProject: () => {
    set({
      currentProject: null,
      currentProjectError: null,
      projectFiles: [],
      projectAnalyses: [],
      filesError: null,
      analysesError: null,
    });
  },

  clearErrors: () => {
    set({
      projectsError: null,
      currentProjectError: null,
      filesError: null,
      analysesError: null,
    });
  },
}));
