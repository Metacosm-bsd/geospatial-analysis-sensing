// API Client
export { default as apiClient, tokenStorage, getErrorMessage } from './client';

// Auth API
export {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  verifyEmail,
  isAuthenticated,
} from './auth';

// Projects API
export {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectFiles,
  deleteProjectFile,
  getProjectAnalyses,
  getAnalysis,
  startAnalysis,
  cancelAnalysis,
} from './projects';

// Files API
export {
  initUpload,
  uploadChunk,
  completeUpload,
  getFileStatus,
  deleteFile,
  getProjectFiles as getFilesForProject,
  getFile,
  cancelUpload,
  getUploadProgress,
  getDownloadUrl,
} from './files';

// Processing API
export {
  getProcessingProgress,
  cancelProcessing,
  getProcessingResults,
  getReportDownloadUrl,
  generateReport,
} from './processing';
export type {
  ProcessingStageInfo,
  ProcessingProgress,
  ProcessingResultsResponse,
} from './processing';

// Viewer API
export {
  getPointCloudMetadata,
  getPointCloudData,
  streamPointCloudData,
  getDetectedTrees,
  getTreesForFile,
  getPointCloudUrl,
} from './viewer';
export type {
  PointCloudMetadata,
  PointCloudChunk,
  PointCloudLoadOptions,
  StreamingOptions,
  TreeDetectionResult,
} from './viewer';
