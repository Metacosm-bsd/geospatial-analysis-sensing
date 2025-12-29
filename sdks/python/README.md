# lidarforest

Official Python SDK for the LiDAR Forest Analysis API.

## Installation

```bash
pip install lidarforest
```

## Quick Start

```python
from lidarforest import LidarForest

# Initialize client
client = LidarForest(api_key="lf_live_your_api_key")

# List projects
projects, pagination = client.projects.list()

# Create a project
from lidarforest.models import CreateProjectInput

project = client.projects.create(CreateProjectInput(
    name="My Forest Analysis",
    description="LiDAR analysis of northern woodland",
    location="Pacific Northwest",
))

# Upload a file
with open("forest_scan.laz", "rb") as f:
    file = client.files.upload(
        project_id=project.id,
        file=f,
        filename="forest_scan.laz",
        mime_type="application/octet-stream",
    )

# Start an analysis
from lidarforest.models import CreateAnalysisInput, AnalysisType

analysis = client.analyses.create(CreateAnalysisInput(
    project_id=project.id,
    name="Full inventory analysis",
    type=AnalysisType.FULL_INVENTORY,
    file_ids=[file.id],
))

# Wait for completion
completed = client.analyses.wait_for_completion(analysis.id)

# Get results
results = client.analyses.get_results(analysis.id)
trees, _ = client.analyses.get_trees(analysis.id)
stands = client.analyses.get_stands(analysis.id)

# Generate a report
from lidarforest.models import CreateReportInput, ReportType

report, download_url = client.reports.generate(CreateReportInput(
    analysis_id=analysis.id,
    name="Inventory Report",
    type=ReportType.INVENTORY,
))
```

## Configuration

```python
client = LidarForest(
    api_key="lf_live_your_api_key",      # Required
    base_url="https://api.lidarforest.com/api/v1",  # Optional
    timeout=30.0,                         # Request timeout in seconds (default: 30)
)
```

### Context Manager

```python
with LidarForest(api_key="lf_live_xxx") as client:
    projects, _ = client.projects.list()
    # Client is automatically closed when exiting the context
```

## API Reference

### Projects

```python
from lidarforest.models import CreateProjectInput, UpdateProjectInput

# List projects with pagination and search
projects, pagination = client.projects.list(
    limit=20,
    offset=0,
    search="forest",
    sort_by="createdAt",
    sort_order="desc",
)

# Create project
project = client.projects.create(CreateProjectInput(
    name="Project Name",
    description="Description",
    location="Location",
    metadata={"custom": "data"},
))

# Get project details
project = client.projects.get("project-id")

# Update project
project = client.projects.update("project-id", UpdateProjectInput(
    name="Updated Name",
))

# Delete project
client.projects.delete("project-id")

# Get project summary
summary = client.projects.get_summary("project-id")
```

### Files

```python
from lidarforest.models import UploadUrlInput

# List files
files, pagination = client.files.list(
    project_id="project-id",
    status="COMPLETED",
)

# Upload file (helper method)
with open("scan.laz", "rb") as f:
    file = client.files.upload(
        project_id="project-id",
        file=f,
        filename="scan.laz",
        mime_type="application/octet-stream",
    )

# Manual upload (3 steps)
# 1. Get upload URL
upload_data = client.files.get_upload_url(UploadUrlInput(
    project_id="project-id",
    filename="scan.laz",
    file_size=1000000,
))

# 2. Upload to URL using requests or httpx
import httpx
httpx.put(
    upload_data["uploadUrl"],
    content=file_content,
    headers=upload_data["instructions"]["headers"],
)

# 3. Confirm upload
client.files.confirm_upload(upload_data["fileId"])

# Get download URL
download_data = client.files.get_download_url("file-id")

# Delete file
client.files.delete("file-id")
```

### Analyses

```python
from lidarforest.models import CreateAnalysisInput, AnalysisType

# List analyses
analyses, pagination = client.analyses.list(
    project_id="project-id",
    status="COMPLETED",
    type=AnalysisType.FULL_INVENTORY,
)

# Create analysis
analysis = client.analyses.create(CreateAnalysisInput(
    project_id="project-id",
    name="Analysis Name",
    type=AnalysisType.FULL_INVENTORY,
    file_ids=["file-id-1", "file-id-2"],
    parameters={
        "minTreeHeight": 5,
        "speciesModel": "pacific_northwest",
    },
))

# Get analysis
analysis = client.analyses.get("analysis-id")

# Wait for completion (polls until done)
completed = client.analyses.wait_for_completion(
    "analysis-id",
    poll_interval=5.0,   # seconds
    timeout=1800.0,      # 30 minutes
)

# Get results
results = client.analyses.get_results("analysis-id")

# Get detected trees
trees, pagination = client.analyses.get_trees("analysis-id", limit=100)

# Get stand summaries
stands = client.analyses.get_stands("analysis-id")

# Cancel analysis
client.analyses.cancel("analysis-id")
```

### Reports

```python
from lidarforest.models import CreateReportInput, ReportType, ReportFormat, ReportOptions

# List reports
reports, pagination = client.reports.list(
    project_id="project-id",
    type=ReportType.INVENTORY,
    format=ReportFormat.PDF,
)

# Create report
report = client.reports.create(CreateReportInput(
    analysis_id="analysis-id",
    name="Report Name",
    type=ReportType.INVENTORY,
    format=ReportFormat.PDF,
    options=ReportOptions(
        include_charts=True,
        include_maps=True,
        units="metric",
    ),
))

# Generate and wait for completion
report, download_url = client.reports.generate(
    CreateReportInput(
        analysis_id="analysis-id",
        name="Report Name",
        type=ReportType.INVENTORY,
    ),
    poll_interval=5.0,
    timeout=600.0,
)

# Get download URL
download_data = client.reports.get_download_url("report-id")

# Get available report types
types = client.reports.get_types()
```

### Webhooks

```python
from lidarforest.models import CreateWebhookInput, UpdateWebhookInput

# List webhooks
webhooks = client.webhooks.list()

# Create webhook
webhook = client.webhooks.create(CreateWebhookInput(
    url="https://your-server.com/webhook",
    events=["analysis.completed", "report.generated"],
    description="Production webhook",
))

# Update webhook
webhook = client.webhooks.update("webhook-id", UpdateWebhookInput(
    events=["analysis.completed"],
    is_active=False,
))

# Test webhook
result = client.webhooks.test("webhook-id")

# Regenerate secret
new_secret = client.webhooks.regenerate_secret("webhook-id")

# Get delivery history
deliveries, pagination = client.webhooks.get_deliveries("webhook-id")

# Retry failed delivery
client.webhooks.retry_delivery("webhook-id", "delivery-id")

# Get available events
events = client.webhooks.get_events()
```

## Webhook Signature Verification

Verify incoming webhook signatures to ensure authenticity:

```python
from flask import Flask, request
from lidarforest import verify_webhook_signature, construct_webhook_event
import os

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    # Option 1: Manual verification
    signature = request.headers.get('X-Webhook-Signature', '')
    is_valid = verify_webhook_signature(
        payload=request.data.decode('utf-8'),
        signature=signature,
        secret=os.environ['WEBHOOK_SECRET'],
    )

    if not is_valid:
        return 'Invalid signature', 401

    event = request.json

    # Option 2: Construct and verify in one step
    try:
        event = construct_webhook_event(
            payload=request.data.decode('utf-8'),
            signature=request.headers.get('X-Webhook-Signature', ''),
            secret=os.environ['WEBHOOK_SECRET'],
        )
    except ValueError:
        return 'Invalid signature', 401

    # Handle event
    if event['event'] == 'analysis.completed':
        analysis_id = event['data']['analysisId']
        print(f"Analysis {analysis_id} completed!")

    return 'OK', 200
```

## Error Handling

```python
from lidarforest import (
    LidarForest,
    LidarForestError,
    AuthenticationError,
    RateLimitError,
    NotFoundError,
)

client = LidarForest(api_key="lf_live_xxx")

try:
    project = client.projects.get("invalid-id")
except NotFoundError as e:
    print(f"Project not found: {e.message}")
except RateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after} seconds")
except AuthenticationError as e:
    print(f"Authentication failed: {e.message}")
except LidarForestError as e:
    print(f"Error [{e.status_code}]: {e.message}")
```

## Type Hints

Full type hints are provided for all models and methods:

```python
from lidarforest import LidarForest
from lidarforest.models import (
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
    WebhookEvent,
    Pagination,
)

def process_analysis(client: LidarForest, project_id: str) -> list[Tree]:
    analyses, _ = client.analyses.list(project_id=project_id)

    trees: list[Tree] = []
    for analysis in analyses:
        if analysis.status == "COMPLETED":
            analysis_trees, _ = client.analyses.get_trees(analysis.id)
            trees.extend(analysis_trees)

    return trees
```

## License

MIT
