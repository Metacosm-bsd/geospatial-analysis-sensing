"""
LiDAR processing pipelines.

This module provides high-level processing pipelines for common LiDAR
analysis workflows including tree detection, ground classification,
and canopy height model generation.
"""

from processing.pipelines.tree_detection import detect_trees
from processing.pipelines.ground_classification import classify_ground
from processing.pipelines.chm_generation import generate_chm

__all__ = [
    "detect_trees",
    "classify_ground",
    "generate_chm",
]
