# @lidarforest/sdk

Official JavaScript/TypeScript SDK for the LiDAR Forest Analysis API.

## Installation

```bash
npm install @lidarforest/sdk
# or
yarn add @lidarforest/sdk
# or
pnpm add @lidarforest/sdk
```

## Quick Start

```typescript
import { LidarForest } from '@lidarforest/sdk';

const client = new LidarForest({
  apiKey: 'lf_live_your_api_key',
});

// List projects
const { data: projects } = await client.projects.list();

// Create a project
const { data: project } = await client.projects.create({
  name: 'My Forest Analysis',
  description: 'LiDAR analysis of northern woodland',
  location: 'Pacific Northwest',
});

// Upload a file
const file = await client.files.upload(
  project.id,
  fileBlob,
  'forest_scan.laz',
  { mimeType: 'application/octet-stream' }
);

// Start an analysis
const { data: analysis } = await client.analyses.create({
  projectId: project.id,
  name: 'Full inventory analysis',
  type: 'FULL_INVENTORY',
  fileIds: [file.id],
});

// Wait for completion
const completedAnalysis = await client.analyses.waitForCompletion(analysis.id);

// Get results
const { data: results } = await client.analyses.getResults(analysis.id);
const { data: trees } = await client.analyses.getTrees(analysis.id);
const { data: stands } = await client.analyses.getStands(analysis.id);

// Generate a report
const { report, downloadUrl } = await client.reports.generate({
  analysisId: analysis.id,
  name: 'Inventory Report',
  type: 'INVENTORY',
  format: 'PDF',
});
```

## Configuration

```typescript
const client = new LidarForest({
  apiKey: 'lf_live_your_api_key',      // Required
  baseUrl: 'https://api.lidarforest.com/api/v1',  // Optional
  timeout: 30000,                       // Request timeout in ms (default: 30000)
});
```

## API Reference

### Projects

```typescript
// List projects with pagination and search
const { data, pagination } = await client.projects.list({
  limit: 20,
  offset: 0,
  search: 'forest',
  sortBy: 'createdAt',
  sortOrder: 'desc',
});

// Create project
const { data: project } = await client.projects.create({
  name: 'Project Name',
  description: 'Description',
  location: 'Location',
  metadata: { custom: 'data' },
});

// Get project details
const { data: project } = await client.projects.get('project-id');

// Update project
const { data: project } = await client.projects.update('project-id', {
  name: 'Updated Name',
});

// Delete project
await client.projects.delete('project-id');

// Get project summary
const { data: summary } = await client.projects.getSummary('project-id');
```

### Files

```typescript
// List files
const { data, pagination } = await client.files.list({
  projectId: 'project-id',
  status: 'COMPLETED',
});

// Upload file (helper method)
const file = await client.files.upload(
  projectId,
  fileBlob,
  'filename.laz',
  { mimeType: 'application/octet-stream' }
);

// Manual upload (3 steps)
// 1. Get upload URL
const { data: uploadData } = await client.files.getUploadUrl({
  projectId: 'project-id',
  filename: 'scan.laz',
  fileSize: 1000000,
});

// 2. Upload to URL
await fetch(uploadData.uploadUrl, {
  method: uploadData.instructions.method,
  headers: uploadData.instructions.headers,
  body: fileBlob,
});

// 3. Confirm upload
await client.files.confirmUpload(uploadData.fileId);

// Get download URL
const { data } = await client.files.getDownloadUrl('file-id');

// Delete file
await client.files.delete('file-id');
```

### Analyses

```typescript
// List analyses
const { data, pagination } = await client.analyses.list({
  projectId: 'project-id',
  status: 'COMPLETED',
  type: 'FULL_INVENTORY',
});

// Create analysis
const { data: analysis } = await client.analyses.create({
  projectId: 'project-id',
  name: 'Analysis Name',
  type: 'FULL_INVENTORY', // TREE_DETECTION | SPECIES_CLASSIFICATION | CARBON_ESTIMATE | FULL_INVENTORY
  fileIds: ['file-id-1', 'file-id-2'],
  parameters: {
    minTreeHeight: 5,
    speciesModel: 'pacific_northwest',
  },
});

// Get analysis
const { data: analysis } = await client.analyses.get('analysis-id');

// Wait for completion (polls until done)
const completedAnalysis = await client.analyses.waitForCompletion('analysis-id', {
  pollInterval: 5000,  // 5 seconds
  timeout: 1800000,    // 30 minutes
});

// Get results
const { data: results } = await client.analyses.getResults('analysis-id');

// Get detected trees
const { data: trees } = await client.analyses.getTrees('analysis-id', {
  limit: 100,
  offset: 0,
});

// Get stand summaries
const { data: stands } = await client.analyses.getStands('analysis-id');

// Cancel analysis
await client.analyses.cancel('analysis-id');
```

### Reports

```typescript
// List reports
const { data, pagination } = await client.reports.list({
  projectId: 'project-id',
  type: 'INVENTORY',
  format: 'PDF',
});

// Create report
const { data: report } = await client.reports.create({
  analysisId: 'analysis-id',
  name: 'Report Name',
  type: 'INVENTORY', // INVENTORY | CARBON | TIMBER_VALUE | GROWTH_PROJECTION | FULL
  format: 'PDF',     // PDF | EXCEL | CSV | JSON
  options: {
    includeCharts: true,
    includeMaps: true,
    units: 'metric',
  },
});

// Generate and wait for completion
const { report, downloadUrl } = await client.reports.generate({
  analysisId: 'analysis-id',
  name: 'Report Name',
  type: 'INVENTORY',
});

// Get download URL
const { data } = await client.reports.getDownloadUrl('report-id');

// Get available report types
const { data: types } = await client.reports.getTypes();
```

### Webhooks

```typescript
// List webhooks
const { data: webhooks } = await client.webhooks.list();

// Create webhook
const { data: webhook } = await client.webhooks.create({
  url: 'https://your-server.com/webhook',
  events: ['analysis.completed', 'report.generated'],
  description: 'Production webhook',
});

// Update webhook
await client.webhooks.update('webhook-id', {
  events: ['analysis.completed'],
  isActive: false,
});

// Test webhook
const { data: result } = await client.webhooks.test('webhook-id');

// Regenerate secret
const { data } = await client.webhooks.regenerateSecret('webhook-id');

// Get delivery history
const { data: deliveries } = await client.webhooks.getDeliveries('webhook-id');

// Retry failed delivery
await client.webhooks.retryDelivery('webhook-id', 'delivery-id');

// Get available events
const { data: events } = await client.webhooks.getEvents();
```

## Webhook Signature Verification

Verify incoming webhook signatures to ensure authenticity:

```typescript
import { verifyWebhookSignature } from '@lidarforest/sdk';

// Express middleware example
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const isValid = await verifyWebhookSignature(
    req.body.toString(),
    signature,
    process.env.WEBHOOK_SECRET
  );

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body);
  // Handle event...

  res.status(200).send('OK');
});
```

## Error Handling

```typescript
import { LidarForest, LidarForestError } from '@lidarforest/sdk';

try {
  const { data } = await client.projects.get('invalid-id');
} catch (error) {
  if (error instanceof LidarForestError) {
    console.log('Status:', error.statusCode);
    console.log('Message:', error.message);
    console.log('Response:', error.response);
  }
}
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import {
  LidarForest,
  LidarForestConfig,
  Project,
  File,
  Analysis,
  AnalysisType,
  Report,
  ReportType,
  ReportFormat,
  Tree,
  Stand,
  Webhook,
  LidarForestError,
} from '@lidarforest/sdk';
```

## License

MIT
