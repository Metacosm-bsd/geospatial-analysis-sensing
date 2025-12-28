"""
Pytest configuration and fixtures for LiDAR Processing tests.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Generator

import pytest


@pytest.fixture(scope="session")
def temp_directory() -> Generator[Path, None, None]:
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory(prefix="lidar_test_") as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def sample_las_content() -> bytes:
    """
    Create minimal valid LAS file content for testing.

    Note: This is a simplified placeholder. Real LAS files have
    specific binary structure that requires proper library creation.
    """
    # This is just placeholder bytes - real tests should use
    # actual LAS files or properly constructed binary content
    return b"LASF" + b"\x00" * 100
