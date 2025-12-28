"""
Configuration management for LiDAR Processing Service.

This module provides configuration settings using Pydantic Settings
for environment-based configuration with validation.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    All settings can be overridden via environment variables with
    the LIDAR_ prefix (e.g., LIDAR_API_HOST, LIDAR_REDIS_HOST).
    """

    model_config = SettingsConfigDict(
        env_prefix="LIDAR_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # API Settings
    api_host: str = Field(default="0.0.0.0", description="API server host")
    api_port: int = Field(default=8000, description="API server port")
    api_workers: int = Field(default=1, description="Number of uvicorn workers")
    debug: bool = Field(default=False, description="Enable debug mode")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO", description="Logging level"
    )

    # Redis Settings
    redis_host: str = Field(default="localhost", description="Redis server host")
    redis_port: int = Field(default=6379, description="Redis server port")
    redis_db: int = Field(default=0, description="Redis database number")
    redis_password: str | None = Field(default=None, description="Redis password")
    redis_ssl: bool = Field(default=False, description="Use SSL for Redis connection")

    # Queue Settings
    queue_name: str = Field(
        default="lidar:processing:jobs", description="Redis queue name for jobs"
    )
    result_queue_prefix: str = Field(
        default="lidar:processing:results:",
        description="Prefix for result storage keys",
    )
    job_timeout: int = Field(
        default=600, description="Maximum job processing time in seconds"
    )
    result_ttl: int = Field(
        default=3600, description="Time to keep results in Redis (seconds)"
    )

    # File Processing Settings
    max_file_size_mb: int = Field(
        default=500, description="Maximum file size in megabytes"
    )
    temp_dir: str = Field(
        default="/tmp/lidar_processing", description="Temporary directory for files"
    )
    allowed_extensions: list[str] = Field(
        default=[".las", ".laz"], description="Allowed file extensions"
    )

    # Validation Settings
    require_crs: bool = Field(
        default=True, description="Require CRS in uploaded files"
    )
    min_point_count: int = Field(
        default=100, description="Minimum required point count"
    )
    supported_point_formats: list[int] = Field(
        default=[0, 1, 2, 3, 6, 7, 8],
        description="Supported LAS point format IDs",
    )
    supported_versions: list[str] = Field(
        default=["1.2", "1.3", "1.4"],
        description="Supported LAS version strings",
    )

    # Callback Settings
    callback_timeout: int = Field(
        default=30, description="HTTP callback timeout in seconds"
    )
    callback_retries: int = Field(
        default=3, description="Number of callback retry attempts"
    )

    @property
    def redis_url(self) -> str:
        """Generate Redis connection URL."""
        protocol = "rediss" if self.redis_ssl else "redis"
        auth = f":{self.redis_password}@" if self.redis_password else ""
        return f"{protocol}://{auth}{self.redis_host}:{self.redis_port}/{self.redis_db}"


@lru_cache
def get_settings() -> Settings:
    """
    Get cached application settings.

    Returns:
        Settings instance loaded from environment.
    """
    settings = Settings()
    logger.info(
        "Loaded settings: host=%s, port=%d, redis=%s:%d",
        settings.api_host,
        settings.api_port,
        settings.redis_host,
        settings.redis_port,
    )
    return settings


def configure_logging(settings: Settings | None = None) -> None:
    """
    Configure application logging based on settings.

    Args:
        settings: Optional settings instance. Uses cached settings if not provided.
    """
    if settings is None:
        settings = get_settings()

    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    logging.basicConfig(
        level=getattr(logging, settings.log_level),
        format=log_format,
    )

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
