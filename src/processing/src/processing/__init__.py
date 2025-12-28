"""
LiDAR Forest Analysis Platform - Processing Pipeline.

This package provides processing pipelines for LiDAR point cloud data,
including tree detection, ground classification, and canopy height model
generation.
"""

from importlib.metadata import version, PackageNotFoundError

try:
    __version__ = version("lidar-forest-analysis")
except PackageNotFoundError:
    __version__ = "0.1.0"

__all__ = ["__version__"]
