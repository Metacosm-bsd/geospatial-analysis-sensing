"""
LiDAR Forest SDK Exceptions
"""

from typing import Any, Optional


class LidarForestError(Exception):
    """Base exception for LiDAR Forest SDK errors."""

    def __init__(
        self,
        message: str,
        status_code: int = 0,
        response: Optional[Any] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.response = response

    def __str__(self) -> str:
        if self.status_code:
            return f"[{self.status_code}] {self.message}"
        return self.message


class AuthenticationError(LidarForestError):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication failed", response: Optional[Any] = None):
        super().__init__(message, 401, response)


class RateLimitError(LidarForestError):
    """Raised when rate limit is exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
        response: Optional[Any] = None,
    ):
        super().__init__(message, 429, response)
        self.retry_after = retry_after


class NotFoundError(LidarForestError):
    """Raised when a resource is not found."""

    def __init__(self, message: str = "Resource not found", response: Optional[Any] = None):
        super().__init__(message, 404, response)


class ValidationError(LidarForestError):
    """Raised when request validation fails."""

    def __init__(self, message: str = "Validation error", response: Optional[Any] = None):
        super().__init__(message, 400, response)


class TimeoutError(LidarForestError):
    """Raised when a request or operation times out."""

    def __init__(self, message: str = "Operation timed out"):
        super().__init__(message, 408)
