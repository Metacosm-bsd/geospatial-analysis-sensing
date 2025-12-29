"""
LiDAR Forest SDK Client
"""

import time
from typing import Any, BinaryIO, Dict, List, Optional, Tuple, Union

import httpx

from lidarforest.exceptions import (
    AuthenticationError,
    LidarForestError,
    NotFoundError,
    RateLimitError,
    TimeoutError,
    ValidationError,
)
from lidarforest.models import (
    Analysis,
    AnalysisType,
    CreateAnalysisInput,
    CreateProjectInput,
    CreateReportInput,
    CreateWebhookInput,
    File,
    Pagination,
    Project,
    Report,
    ReportFormat,
    ReportType,
    Stand,
    Tree,
    UpdateProjectInput,
    UpdateWebhookInput,
    UploadUrlInput,
    Webhook,
    WebhookDelivery,
)


class LidarForest:
    """LiDAR Forest Analysis API client."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.lidarforest.com/api/v1",
        timeout: float = 30.0,
    ):
        """
        Initialize the LiDAR Forest client.

        Args:
            api_key: Your API key (starts with lf_live_)
            base_url: API base URL (optional)
            timeout: Request timeout in seconds (default: 30)
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

        self._client = httpx.Client(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "lidarforest-sdk-python/1.0.0",
            },
            timeout=timeout,
        )

        # Initialize sub-clients
        self.projects = ProjectsClient(self)
        self.files = FilesClient(self)
        self.analyses = AnalysesClient(self)
        self.reports = ReportsClient(self)
        self.webhooks = WebhooksClient(self)

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Make an API request."""
        # Filter out None values from params
        if params:
            params = {k: v for k, v in params.items() if v is not None}

        try:
            response = self._client.request(
                method,
                path,
                params=params,
                json=json,
                **kwargs,
            )
        except httpx.TimeoutException:
            raise TimeoutError("Request timed out")
        except httpx.RequestError as e:
            raise LidarForestError(f"Request failed: {e}")

        # Parse response
        try:
            data = response.json()
        except Exception:
            data = {"error": response.text}

        # Handle errors
        if response.status_code == 401:
            raise AuthenticationError(
                data.get("error", "Authentication failed"),
                data,
            )
        elif response.status_code == 404:
            raise NotFoundError(
                data.get("error", "Resource not found"),
                data,
            )
        elif response.status_code == 429:
            raise RateLimitError(
                data.get("error", "Rate limit exceeded"),
                data.get("retryAfter"),
                data,
            )
        elif response.status_code == 400:
            raise ValidationError(
                data.get("error", "Validation error"),
                data,
            )
        elif response.status_code >= 400:
            raise LidarForestError(
                data.get("error", f"Request failed with status {response.status_code}"),
                response.status_code,
                data,
            )

        return data

    def close(self) -> None:
        """Close the client."""
        self._client.close()

    def __enter__(self) -> "LidarForest":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


# ============================================================================
# Projects Client
# ============================================================================


class ProjectsClient:
    """Projects API client."""

    def __init__(self, client: LidarForest):
        self._client = client

    def list(
        self,
        limit: int = 20,
        offset: int = 0,
        search: Optional[str] = None,
        sort_by: str = "createdAt",
        sort_order: str = "desc",
    ) -> Tuple[List[Project], Pagination]:
        """
        List projects.

        Returns:
            Tuple of (projects list, pagination info)
        """
        data = self._client._request(
            "GET",
            "/projects",
            params={
                "limit": limit,
                "offset": offset,
                "search": search,
                "sortBy": sort_by,
                "sortOrder": sort_order,
            },
        )
        projects = [Project(**p) for p in data["data"]]
        pagination = Pagination(**data["pagination"])
        return projects, pagination

    def create(self, input: CreateProjectInput) -> Project:
        """Create a new project."""
        data = self._client._request(
            "POST",
            "/projects",
            json=input.model_dump(by_alias=True, exclude_none=True),
        )
        return Project(**data["data"])

    def get(self, project_id: str) -> Project:
        """Get a project by ID."""
        data = self._client._request("GET", f"/projects/{project_id}")
        return Project(**data["data"])

    def update(self, project_id: str, input: UpdateProjectInput) -> Project:
        """Update a project."""
        data = self._client._request(
            "PATCH",
            f"/projects/{project_id}",
            json=input.model_dump(by_alias=True, exclude_none=True),
        )
        return Project(**data["data"])

    def delete(self, project_id: str) -> None:
        """Delete a project."""
        self._client._request("DELETE", f"/projects/{project_id}")

    def get_summary(self, project_id: str) -> Dict[str, Any]:
        """Get project summary statistics."""
        data = self._client._request("GET", f"/projects/{project_id}/summary")
        return data["data"]


# ============================================================================
# Files Client
# ============================================================================


class FilesClient:
    """Files API client."""

    def __init__(self, client: LidarForest):
        self._client = client

    def list(
        self,
        project_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[File], Pagination]:
        """List files."""
        data = self._client._request(
            "GET",
            "/files",
            params={
                "projectId": project_id,
                "status": status,
                "limit": limit,
                "offset": offset,
            },
        )
        files = [File(**f) for f in data["data"]]
        pagination = Pagination(**data["pagination"])
        return files, pagination

    def get_upload_url(self, input: UploadUrlInput) -> Dict[str, Any]:
        """Get a presigned upload URL."""
        data = self._client._request(
            "POST",
            "/files/upload-url",
            json=input.model_dump(by_alias=True, exclude_none=True),
        )
        return data["data"]

    def get(self, file_id: str) -> File:
        """Get a file by ID."""
        data = self._client._request("GET", f"/files/{file_id}")
        return File(**data["data"])

    def get_download_url(self, file_id: str) -> Dict[str, Any]:
        """Get a presigned download URL."""
        data = self._client._request("GET", f"/files/{file_id}/download-url")
        return data["data"]

    def delete(self, file_id: str) -> None:
        """Delete a file."""
        self._client._request("DELETE", f"/files/{file_id}")

    def confirm_upload(self, file_id: str) -> File:
        """Confirm file upload completion."""
        data = self._client._request("POST", f"/files/{file_id}/confirm")
        return File(**data["data"])

    def upload(
        self,
        project_id: str,
        file: Union[BinaryIO, bytes],
        filename: str,
        mime_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> File:
        """
        Upload a file using the two-step process.

        Args:
            project_id: Target project ID
            file: File content (bytes or file-like object)
            filename: Original filename
            mime_type: MIME type (optional)
            metadata: Additional metadata (optional)

        Returns:
            The uploaded File
        """
        # Get file size
        if isinstance(file, bytes):
            file_size = len(file)
            content = file
        else:
            file.seek(0, 2)  # Seek to end
            file_size = file.tell()
            file.seek(0)  # Seek back to start
            content = file.read()

        # Step 1: Get upload URL
        upload_data = self.get_upload_url(
            UploadUrlInput(
                project_id=project_id,
                filename=filename,
                file_size=file_size,
                mime_type=mime_type,
                metadata=metadata,
            )
        )

        # Step 2: Upload file
        response = httpx.put(
            upload_data["uploadUrl"],
            content=content,
            headers=upload_data["instructions"]["headers"],
        )

        if not response.is_success:
            raise LidarForestError(
                f"File upload failed: {response.text}",
                response.status_code,
            )

        # Step 3: Confirm upload
        self.confirm_upload(upload_data["fileId"])

        # Return file details
        return self.get(upload_data["fileId"])


# ============================================================================
# Analyses Client
# ============================================================================


class AnalysesClient:
    """Analyses API client."""

    def __init__(self, client: LidarForest):
        self._client = client

    def list(
        self,
        project_id: Optional[str] = None,
        status: Optional[str] = None,
        type: Optional[AnalysisType] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[Analysis], Pagination]:
        """List analyses."""
        data = self._client._request(
            "GET",
            "/analyses",
            params={
                "projectId": project_id,
                "status": status,
                "type": type.value if type else None,
                "limit": limit,
                "offset": offset,
            },
        )
        analyses = [Analysis(**a) for a in data["data"]]
        pagination = Pagination(**data["pagination"])
        return analyses, pagination

    def create(self, input: CreateAnalysisInput) -> Analysis:
        """Create and start a new analysis."""
        data = self._client._request(
            "POST",
            "/analyses",
            json=input.model_dump(by_alias=True, exclude_none=True),
        )
        return Analysis(**data["data"])

    def get(self, analysis_id: str) -> Analysis:
        """Get an analysis by ID."""
        data = self._client._request("GET", f"/analyses/{analysis_id}")
        return Analysis(**data["data"])

    def get_results(self, analysis_id: str) -> Dict[str, Any]:
        """Get analysis results."""
        data = self._client._request("GET", f"/analyses/{analysis_id}/results")
        return data["data"]

    def cancel(self, analysis_id: str) -> None:
        """Cancel or delete an analysis."""
        self._client._request("DELETE", f"/analyses/{analysis_id}")

    def get_trees(
        self,
        analysis_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[Tree], Pagination]:
        """Get detected trees from analysis."""
        data = self._client._request(
            "GET",
            f"/analyses/{analysis_id}/trees",
            params={"limit": limit, "offset": offset},
        )
        trees = [Tree(**t) for t in data["data"]]
        pagination = Pagination(**data["pagination"])
        return trees, pagination

    def get_stands(self, analysis_id: str) -> List[Stand]:
        """Get stand summaries from analysis."""
        data = self._client._request("GET", f"/analyses/{analysis_id}/stands")
        return [Stand(**s) for s in data["data"]]

    def wait_for_completion(
        self,
        analysis_id: str,
        poll_interval: float = 5.0,
        timeout: float = 1800.0,
    ) -> Analysis:
        """
        Wait for analysis to complete.

        Args:
            analysis_id: Analysis ID
            poll_interval: Seconds between status checks (default: 5)
            timeout: Maximum wait time in seconds (default: 1800 = 30 minutes)

        Returns:
            The completed Analysis

        Raises:
            TimeoutError: If analysis doesn't complete within timeout
        """
        start_time = time.time()

        while True:
            analysis = self.get(analysis_id)

            if analysis.status in ("COMPLETED", "FAILED", "CANCELLED"):
                return analysis

            if time.time() - start_time > timeout:
                raise TimeoutError(
                    f"Analysis {analysis_id} did not complete within {timeout} seconds"
                )

            time.sleep(poll_interval)


# ============================================================================
# Reports Client
# ============================================================================


class ReportsClient:
    """Reports API client."""

    def __init__(self, client: LidarForest):
        self._client = client

    def list(
        self,
        project_id: Optional[str] = None,
        analysis_id: Optional[str] = None,
        type: Optional[ReportType] = None,
        format: Optional[ReportFormat] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[Report], Pagination]:
        """List reports."""
        data = self._client._request(
            "GET",
            "/reports",
            params={
                "projectId": project_id,
                "analysisId": analysis_id,
                "type": type.value if type else None,
                "format": format.value if format else None,
                "limit": limit,
                "offset": offset,
            },
        )
        reports = [Report(**r) for r in data["data"]]
        pagination = Pagination(**data["pagination"])
        return reports, pagination

    def create(self, input: CreateReportInput) -> Report:
        """Create a new report."""
        data = self._client._request(
            "POST",
            "/reports",
            json=input.model_dump(by_alias=True, exclude_none=True),
        )
        return Report(**data["data"])

    def get(self, report_id: str) -> Report:
        """Get a report by ID."""
        data = self._client._request("GET", f"/reports/{report_id}")
        return Report(**data["data"])

    def get_download_url(self, report_id: str) -> Dict[str, Any]:
        """Get report download URL."""
        data = self._client._request("GET", f"/reports/{report_id}/download")
        return data["data"]

    def delete(self, report_id: str) -> None:
        """Delete a report."""
        self._client._request("DELETE", f"/reports/{report_id}")

    def get_types(self) -> Dict[str, Any]:
        """Get available report types."""
        data = self._client._request("GET", "/reports/types/available")
        return data["data"]

    def generate(
        self,
        input: CreateReportInput,
        poll_interval: float = 5.0,
        timeout: float = 600.0,
    ) -> Tuple[Report, str]:
        """
        Generate report and wait for completion.

        Args:
            input: Report creation input
            poll_interval: Seconds between status checks (default: 5)
            timeout: Maximum wait time in seconds (default: 600 = 10 minutes)

        Returns:
            Tuple of (Report, download_url)

        Raises:
            TimeoutError: If report doesn't complete within timeout
            LidarForestError: If report generation fails
        """
        report = self.create(input)
        start_time = time.time()

        while True:
            current_report = self.get(report.id)

            if current_report.status == "COMPLETED":
                download_data = self.get_download_url(report.id)
                return current_report, download_data["downloadUrl"]

            if current_report.status == "FAILED":
                raise LidarForestError("Report generation failed", 500)

            if time.time() - start_time > timeout:
                raise TimeoutError(
                    f"Report {report.id} did not complete within {timeout} seconds"
                )

            time.sleep(poll_interval)


# ============================================================================
# Webhooks Client
# ============================================================================


class WebhooksClient:
    """Webhooks API client."""

    def __init__(self, client: LidarForest):
        self._client = client

    def list(self, organization_id: Optional[str] = None) -> List[Webhook]:
        """List webhooks."""
        data = self._client._request(
            "GET",
            "/webhooks",
            params={"organizationId": organization_id},
        )
        return [Webhook(**w) for w in data["data"]]

    def create(self, input: CreateWebhookInput) -> Webhook:
        """Create a new webhook."""
        data = self._client._request(
            "POST",
            "/webhooks",
            json=input.model_dump(by_alias=True, exclude_none=True),
        )
        return Webhook(**data["data"])

    def get(self, webhook_id: str) -> Webhook:
        """Get a webhook by ID."""
        data = self._client._request("GET", f"/webhooks/{webhook_id}")
        return Webhook(**data["data"])

    def update(self, webhook_id: str, input: UpdateWebhookInput) -> Webhook:
        """Update a webhook."""
        data = self._client._request(
            "PATCH",
            f"/webhooks/{webhook_id}",
            json=input.model_dump(by_alias=True, exclude_none=True),
        )
        return Webhook(**data["data"])

    def delete(self, webhook_id: str) -> None:
        """Delete a webhook."""
        self._client._request("DELETE", f"/webhooks/{webhook_id}")

    def regenerate_secret(self, webhook_id: str) -> str:
        """Regenerate webhook secret."""
        data = self._client._request(
            "POST",
            f"/webhooks/{webhook_id}/regenerate-secret",
        )
        return data["data"]["secret"]

    def test(self, webhook_id: str) -> Dict[str, Any]:
        """Send a test webhook."""
        data = self._client._request("POST", f"/webhooks/{webhook_id}/test")
        return data["data"]

    def get_deliveries(
        self,
        webhook_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[WebhookDelivery], Pagination]:
        """Get webhook delivery history."""
        data = self._client._request(
            "GET",
            f"/webhooks/{webhook_id}/deliveries",
            params={"limit": limit, "offset": offset},
        )
        deliveries = [WebhookDelivery(**d) for d in data["data"]]
        pagination = Pagination(**data["pagination"])
        return deliveries, pagination

    def retry_delivery(self, webhook_id: str, delivery_id: str) -> Dict[str, Any]:
        """Retry a failed delivery."""
        data = self._client._request(
            "POST",
            f"/webhooks/{webhook_id}/deliveries/{delivery_id}/retry",
        )
        return data["data"]

    def get_events(self) -> Dict[str, str]:
        """Get available webhook events."""
        data = self._client._request("GET", "/webhooks/events")
        return data["data"]
