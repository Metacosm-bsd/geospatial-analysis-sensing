/**
 * LiDAR Forest Analysis SDK
 * Official JavaScript/TypeScript SDK
 */

// ============================================================================
// Types
// ============================================================================

export interface LidarForestConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  location?: string;
  status: string;
  fileCount?: number;
  analysisCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  location?: string;
  metadata?: Record<string, unknown>;
}

export interface File {
  id: string;
  projectId: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UploadUrlInput {
  projectId: string;
  filename: string;
  fileSize: number;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface UploadUrlResponse {
  fileId: string;
  uploadUrl: string;
  expiresAt: string;
  instructions: {
    method: string;
    headers: Record<string, string>;
  };
}

export type AnalysisType = 'TREE_DETECTION' | 'SPECIES_CLASSIFICATION' | 'CARBON_ESTIMATE' | 'FULL_INVENTORY';

export interface Analysis {
  id: string;
  projectId: string;
  name: string;
  type: AnalysisType;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress?: number;
  parameters?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CreateAnalysisInput {
  projectId: string;
  name: string;
  type: AnalysisType;
  fileIds: string[];
  parameters?: Record<string, unknown>;
}

export type ReportType = 'INVENTORY' | 'CARBON' | 'TIMBER_VALUE' | 'GROWTH_PROJECTION' | 'FULL';
export type ReportFormat = 'PDF' | 'EXCEL' | 'CSV' | 'JSON';

export interface Report {
  id: string;
  analysisId: string;
  name: string;
  type: ReportType;
  format: ReportFormat;
  status: 'GENERATING' | 'COMPLETED' | 'FAILED';
  fileSize?: number;
  createdAt: string;
  generatedAt?: string;
  expiresAt: string;
}

export interface CreateReportInput {
  analysisId: string;
  name: string;
  type: ReportType;
  format?: ReportFormat;
  options?: {
    includeCharts?: boolean;
    includeMaps?: boolean;
    includeAppendix?: boolean;
    language?: string;
    units?: 'metric' | 'imperial';
  };
}

export interface Tree {
  id: string;
  species?: string;
  dbh?: number;
  height?: number;
  crownDiameter?: number;
  latitude: number;
  longitude: number;
  confidence?: number;
  carbonStock?: number;
}

export interface Stand {
  id: string;
  name?: string;
  areaHectares: number;
  treeCount: number;
  basalArea?: number;
  volumePerHectare?: number;
  dominantSpecies?: string;
  meanDbh?: number;
  meanHeight?: number;
  carbonStockPerHectare?: number;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  description?: string;
  secret?: string;
  isActive: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  description?: string;
  headers?: Record<string, string>;
}

export class LidarForestError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'LidarForestError';
  }
}

// ============================================================================
// Client
// ============================================================================

export class LidarForest {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  public projects: ProjectsClient;
  public files: FilesClient;
  public analyses: AnalysesClient;
  public reports: ReportsClient;
  public webhooks: WebhooksClient;

  constructor(config: LidarForestConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.lidarforest.com/api/v1';
    this.timeout = config.timeout || 30000;

    // Initialize sub-clients
    this.projects = new ProjectsClient(this);
    this.files = new FilesClient(this);
    this.analyses = new AnalysesClient(this);
    this.reports = new ReportsClient(this);
    this.webhooks = new WebhooksClient(this);
  }

  async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; params?: Record<string, string | number | undefined> } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'lidarforest-sdk-js/1.0.0',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new LidarForestError(
          data.error || 'Request failed',
          response.status,
          data
        );
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof LidarForestError) {
        throw error;
      }
      throw new LidarForestError(
        error instanceof Error ? error.message : 'Unknown error',
        0
      );
    }
  }
}

// ============================================================================
// Projects Client
// ============================================================================

class ProjectsClient {
  constructor(private client: LidarForest) {}

  async list(params: PaginationParams & { search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {}) {
    return this.client.request<PaginatedResponse<Project>>('GET', '/projects', { params });
  }

  async create(input: CreateProjectInput) {
    return this.client.request<{ success: boolean; data: Project }>('POST', '/projects', { body: input });
  }

  async get(projectId: string) {
    return this.client.request<{ success: boolean; data: Project & { files: File[]; analyses: Analysis[] } }>(
      'GET',
      `/projects/${projectId}`
    );
  }

  async update(projectId: string, input: Partial<CreateProjectInput>) {
    return this.client.request<{ success: boolean; data: Project }>('PATCH', `/projects/${projectId}`, {
      body: input,
    });
  }

  async delete(projectId: string) {
    return this.client.request<{ success: boolean; message: string }>('DELETE', `/projects/${projectId}`);
  }

  async getSummary(projectId: string) {
    return this.client.request<{
      success: boolean;
      data: {
        projectId: string;
        name: string;
        status: string;
        statistics: {
          fileCount: number;
          analysisCount: number;
          completedAnalyses: number;
          reportCount: number;
          totalFileSizeBytes: number;
        };
        timestamps: {
          created: string;
          updated: string;
        };
      };
    }>('GET', `/projects/${projectId}/summary`);
  }
}

// ============================================================================
// Files Client
// ============================================================================

class FilesClient {
  constructor(private client: LidarForest) {}

  async list(params: PaginationParams & { projectId?: string; status?: string } = {}) {
    return this.client.request<PaginatedResponse<File>>('GET', '/files', { params });
  }

  async getUploadUrl(input: UploadUrlInput) {
    return this.client.request<{ success: boolean; data: UploadUrlResponse }>('POST', '/files/upload-url', {
      body: input,
    });
  }

  async get(fileId: string) {
    return this.client.request<{ success: boolean; data: File }>('GET', `/files/${fileId}`);
  }

  async getDownloadUrl(fileId: string) {
    return this.client.request<{
      success: boolean;
      data: { fileId: string; filename: string; downloadUrl: string; expiresAt: string };
    }>('GET', `/files/${fileId}/download-url`);
  }

  async delete(fileId: string) {
    return this.client.request<{ success: boolean; message: string }>('DELETE', `/files/${fileId}`);
  }

  async confirmUpload(fileId: string) {
    return this.client.request<{ success: boolean; data: { id: string; filename: string; status: string } }>(
      'POST',
      `/files/${fileId}/confirm`
    );
  }

  /**
   * Upload a file using the two-step process
   */
  async upload(
    projectId: string,
    file: Blob | Buffer,
    filename: string,
    options: { mimeType?: string; metadata?: Record<string, unknown> } = {}
  ): Promise<File> {
    // Step 1: Get upload URL
    const { data: uploadData } = await this.getUploadUrl({
      projectId,
      filename,
      fileSize: file instanceof Blob ? file.size : file.length,
      mimeType: options.mimeType,
      metadata: options.metadata,
    });

    // Step 2: Upload file
    const uploadResponse = await fetch(uploadData.uploadUrl, {
      method: uploadData.instructions.method,
      headers: uploadData.instructions.headers,
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new LidarForestError('File upload failed', uploadResponse.status);
    }

    // Step 3: Confirm upload
    await this.confirmUpload(uploadData.fileId);

    // Return file details
    const { data } = await this.get(uploadData.fileId);
    return data;
  }
}

// ============================================================================
// Analyses Client
// ============================================================================

class AnalysesClient {
  constructor(private client: LidarForest) {}

  async list(params: PaginationParams & { projectId?: string; status?: string; type?: AnalysisType } = {}) {
    return this.client.request<PaginatedResponse<Analysis>>('GET', '/analyses', { params });
  }

  async create(input: CreateAnalysisInput) {
    return this.client.request<{ success: boolean; data: Analysis; message: string }>('POST', '/analyses', {
      body: input,
    });
  }

  async get(analysisId: string) {
    return this.client.request<{ success: boolean; data: Analysis & { files: { id: string; filename: string }[] } }>(
      'GET',
      `/analyses/${analysisId}`
    );
  }

  async getResults(analysisId: string) {
    return this.client.request<{
      success: boolean;
      data: { analysisId: string; type: AnalysisType; results: Record<string, unknown> };
    }>('GET', `/analyses/${analysisId}/results`);
  }

  async cancel(analysisId: string) {
    return this.client.request<{ success: boolean; message: string }>('DELETE', `/analyses/${analysisId}`);
  }

  async getTrees(analysisId: string, params: PaginationParams = {}) {
    return this.client.request<PaginatedResponse<Tree>>('GET', `/analyses/${analysisId}/trees`, { params });
  }

  async getStands(analysisId: string) {
    return this.client.request<{ success: boolean; data: Stand[] }>('GET', `/analyses/${analysisId}/stands`);
  }

  /**
   * Wait for analysis to complete
   */
  async waitForCompletion(analysisId: string, options: { pollInterval?: number; timeout?: number } = {}): Promise<Analysis> {
    const pollInterval = options.pollInterval || 5000;
    const timeout = options.timeout || 30 * 60 * 1000; // 30 minutes default
    const startTime = Date.now();

    while (true) {
      const { data: analysis } = await this.get(analysisId);

      if (analysis.status === 'COMPLETED' || analysis.status === 'FAILED' || analysis.status === 'CANCELLED') {
        return analysis;
      }

      if (Date.now() - startTime > timeout) {
        throw new LidarForestError('Analysis timed out', 408);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }
}

// ============================================================================
// Reports Client
// ============================================================================

class ReportsClient {
  constructor(private client: LidarForest) {}

  async list(
    params: PaginationParams & { projectId?: string; analysisId?: string; type?: ReportType; format?: ReportFormat } = {}
  ) {
    return this.client.request<PaginatedResponse<Report>>('GET', '/reports', { params });
  }

  async create(input: CreateReportInput) {
    return this.client.request<{ success: boolean; data: Report; message: string }>('POST', '/reports', {
      body: input,
    });
  }

  async get(reportId: string) {
    return this.client.request<{ success: boolean; data: Report }>('GET', `/reports/${reportId}`);
  }

  async getDownloadUrl(reportId: string) {
    return this.client.request<{
      success: boolean;
      data: {
        reportId: string;
        name: string;
        format: ReportFormat;
        fileSize: number;
        downloadUrl: string;
        expiresAt: string;
      };
    }>('GET', `/reports/${reportId}/download`);
  }

  async delete(reportId: string) {
    return this.client.request<{ success: boolean; message: string }>('DELETE', `/reports/${reportId}`);
  }

  async getTypes() {
    return this.client.request<{
      success: boolean;
      data: Record<
        ReportType,
        {
          name: string;
          description: string;
          formats: ReportFormat[];
        }
      >;
    }>('GET', '/reports/types/available');
  }

  /**
   * Generate report and wait for completion
   */
  async generate(
    input: CreateReportInput,
    options: { pollInterval?: number; timeout?: number } = {}
  ): Promise<{ report: Report; downloadUrl: string }> {
    const { data: report } = await this.create(input);

    const pollInterval = options.pollInterval || 5000;
    const timeout = options.timeout || 10 * 60 * 1000; // 10 minutes default
    const startTime = Date.now();

    while (true) {
      const { data: currentReport } = await this.get(report.id);

      if (currentReport.status === 'COMPLETED') {
        const { data: downloadData } = await this.getDownloadUrl(report.id);
        return { report: currentReport, downloadUrl: downloadData.downloadUrl };
      }

      if (currentReport.status === 'FAILED') {
        throw new LidarForestError('Report generation failed', 500);
      }

      if (Date.now() - startTime > timeout) {
        throw new LidarForestError('Report generation timed out', 408);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }
}

// ============================================================================
// Webhooks Client
// ============================================================================

class WebhooksClient {
  constructor(private client: LidarForest) {}

  async list(params: { organizationId?: string } = {}) {
    return this.client.request<{ success: boolean; data: Webhook[] }>('GET', '/webhooks', { params });
  }

  async create(input: CreateWebhookInput) {
    return this.client.request<{ success: boolean; data: Webhook; message: string }>('POST', '/webhooks', {
      body: input,
    });
  }

  async get(webhookId: string) {
    return this.client.request<{ success: boolean; data: Webhook }>('GET', `/webhooks/${webhookId}`);
  }

  async update(webhookId: string, input: Partial<CreateWebhookInput> & { isActive?: boolean }) {
    return this.client.request<{ success: boolean; data: Webhook }>('PATCH', `/webhooks/${webhookId}`, {
      body: input,
    });
  }

  async delete(webhookId: string) {
    return this.client.request<{ success: boolean; message: string }>('DELETE', `/webhooks/${webhookId}`);
  }

  async regenerateSecret(webhookId: string) {
    return this.client.request<{ success: boolean; data: { secret: string }; message: string }>(
      'POST',
      `/webhooks/${webhookId}/regenerate-secret`
    );
  }

  async test(webhookId: string) {
    return this.client.request<{
      success: boolean;
      data: { success: boolean; statusCode?: number; deliveryId: string; error?: string };
    }>('POST', `/webhooks/${webhookId}/test`);
  }

  async getDeliveries(webhookId: string, params: PaginationParams = {}) {
    return this.client.request<PaginatedResponse<{ id: string; event: string; status: string; createdAt: string }>>(
      'GET',
      `/webhooks/${webhookId}/deliveries`,
      { params }
    );
  }

  async retryDelivery(webhookId: string, deliveryId: string) {
    return this.client.request<{ success: boolean; data: { success: boolean; statusCode?: number } }>(
      'POST',
      `/webhooks/${webhookId}/deliveries/${deliveryId}/retry`
    );
  }

  async getEvents() {
    return this.client.request<{ success: boolean; data: Record<string, string> }>('GET', '/webhooks/events');
  }
}

// ============================================================================
// Webhook Signature Verification
// ============================================================================

/**
 * Verify webhook signature
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  tolerance: number = 300 // 5 minutes
): Promise<boolean> {
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parseInt(parts.t, 10);
  const sig = parts.sha256;

  if (!timestamp || !sig) {
    return false;
  }

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    return false;
  }

  // Verify signature
  const signedPayload = `${timestamp}.${payload}`;
  const crypto = await import('crypto');
  const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  return sig === expectedSig;
}

// Default export
export default LidarForest;
