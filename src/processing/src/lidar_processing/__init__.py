"""
LiDAR Processing Microservice.

This package provides a FastAPI-based microservice for validating
and extracting metadata from LiDAR files (LAS/LAZ format).

Sprint 5-6 Implementation.
"""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("lidar-processing")
except PackageNotFoundError:
    __version__ = "0.1.0"

__all__ = ["__version__"]
