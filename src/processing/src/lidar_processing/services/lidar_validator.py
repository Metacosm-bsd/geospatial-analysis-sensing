"""
LiDAR File Validator Service.

This module provides validation services for LAS/LAZ files,
checking file structure, format versions, CRS, and data integrity.
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

import laspy
import numpy as np

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    Bounds,
    FileInfo,
    ValidationIssue,
    ValidationResult,
    ValidationSeverity,
    ValidationStatus,
)

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)


class LidarValidator:
    """
    Validator service for LiDAR files.

    Performs comprehensive validation of LAS/LAZ files including:
    - File structure and readability
    - LAS format version compatibility
    - Point data format validation
    - Coordinate reference system checks
    - Point count and bounds validation
    - Data integrity checks
    """

    def __init__(self, settings: Settings | None = None) -> None:
        """
        Initialize the validator with settings.

        Args:
            settings: Optional settings instance. Uses cached settings if not provided.
        """
        self.settings = settings or get_settings()

    def validate(
        self,
        file_path: str | Path,
        *,
        require_crs: bool | None = None,
        check_point_density: bool = False,
    ) -> ValidationResult:
        """
        Validate a LAS/LAZ file.

        Args:
            file_path: Path to the LAS/LAZ file.
            require_crs: Whether to require a valid CRS. Defaults to settings value.
            check_point_density: Whether to calculate and check point density.

        Returns:
            ValidationResult with status and any issues found.
        """
        file_path = Path(file_path)
        issues: list[ValidationIssue] = []
        file_info: FileInfo | None = None

        if require_crs is None:
            require_crs = self.settings.require_crs

        logger.info("Validating LiDAR file: %s", file_path)

        # Check file exists
        if not file_path.exists():
            issues.append(
                ValidationIssue(
                    code="FILE_NOT_FOUND",
                    message=f"File does not exist: {file_path}",
                    severity=ValidationSeverity.ERROR,
                    field="file_path",
                )
            )
            return self._create_result(file_path, issues, None)

        # Check file extension
        if file_path.suffix.lower() not in self.settings.allowed_extensions:
            issues.append(
                ValidationIssue(
                    code="INVALID_EXTENSION",
                    message=f"Invalid file extension: {file_path.suffix}. "
                    f"Allowed: {self.settings.allowed_extensions}",
                    severity=ValidationSeverity.ERROR,
                    field="file_extension",
                )
            )
            return self._create_result(file_path, issues, None)

        # Check file size
        file_size = file_path.stat().st_size
        file_size_mb = file_size / (1024 * 1024)

        file_info = FileInfo(
            file_path=str(file_path),
            file_size_bytes=file_size,
            file_size_mb=round(file_size_mb, 2),
            file_extension=file_path.suffix.lower(),
        )

        if file_size_mb > self.settings.max_file_size_mb:
            issues.append(
                ValidationIssue(
                    code="FILE_TOO_LARGE",
                    message=f"File size ({file_size_mb:.1f} MB) exceeds maximum "
                    f"({self.settings.max_file_size_mb} MB)",
                    severity=ValidationSeverity.ERROR,
                    field="file_size",
                    details={"size_mb": file_size_mb, "max_mb": self.settings.max_file_size_mb},
                )
            )
            return self._create_result(file_path, issues, file_info)

        # Try to open and validate the file
        try:
            issues.extend(
                self._validate_las_file(
                    file_path,
                    require_crs=require_crs,
                    check_point_density=check_point_density,
                )
            )
        except Exception as e:
            logger.exception("Failed to open LAS file: %s", file_path)
            issues.append(
                ValidationIssue(
                    code="FILE_READ_ERROR",
                    message=f"Failed to read LAS file: {str(e)}",
                    severity=ValidationSeverity.ERROR,
                    field="file_content",
                )
            )

        return self._create_result(file_path, issues, file_info)

    def _validate_las_file(
        self,
        file_path: Path,
        *,
        require_crs: bool,
        check_point_density: bool,
    ) -> list[ValidationIssue]:
        """
        Validate the internal structure of a LAS file.

        Args:
            file_path: Path to the LAS/LAZ file.
            require_crs: Whether CRS is required.
            check_point_density: Whether to check point density.

        Returns:
            List of validation issues found.
        """
        issues: list[ValidationIssue] = []

        with laspy.open(str(file_path)) as las_file:
            header = las_file.header

            # Validate LAS version
            version_str = f"{header.version.major}.{header.version.minor}"
            if version_str not in self.settings.supported_versions:
                issues.append(
                    ValidationIssue(
                        code="UNSUPPORTED_VERSION",
                        message=f"LAS version {version_str} is not supported. "
                        f"Supported versions: {self.settings.supported_versions}",
                        severity=ValidationSeverity.ERROR,
                        field="las_version",
                        details={"version": version_str},
                    )
                )

            # Validate point format
            point_format_id = header.point_format.id
            if point_format_id not in self.settings.supported_point_formats:
                issues.append(
                    ValidationIssue(
                        code="UNSUPPORTED_POINT_FORMAT",
                        message=f"Point format {point_format_id} is not supported. "
                        f"Supported formats: {self.settings.supported_point_formats}",
                        severity=ValidationSeverity.ERROR,
                        field="point_format",
                        details={"point_format": point_format_id},
                    )
                )

            # Validate point count
            point_count = header.point_count
            if point_count < self.settings.min_point_count:
                issues.append(
                    ValidationIssue(
                        code="INSUFFICIENT_POINTS",
                        message=f"Point count ({point_count:,}) is below minimum "
                        f"({self.settings.min_point_count:,})",
                        severity=ValidationSeverity.ERROR,
                        field="point_count",
                        details={"count": point_count, "minimum": self.settings.min_point_count},
                    )
                )

            # Validate bounds
            bounds_issues = self._validate_bounds(header)
            issues.extend(bounds_issues)

            # Validate CRS
            crs_issues = self._validate_crs(las_file, require_crs)
            issues.extend(crs_issues)

            # Validate scale factors
            scale_issues = self._validate_scale(header)
            issues.extend(scale_issues)

            # Check for common data issues
            if check_point_density:
                density_issues = self._validate_point_density(header)
                issues.extend(density_issues)

        return issues

    def _validate_bounds(self, header: laspy.LasHeader) -> list[ValidationIssue]:
        """
        Validate spatial bounds from header.

        Args:
            header: LAS file header.

        Returns:
            List of validation issues.
        """
        issues: list[ValidationIssue] = []

        mins = header.mins
        maxs = header.maxs

        # Check for invalid bounds
        if any(np.isnan(mins)) or any(np.isnan(maxs)):
            issues.append(
                ValidationIssue(
                    code="INVALID_BOUNDS",
                    message="Bounds contain NaN values",
                    severity=ValidationSeverity.ERROR,
                    field="bounds",
                )
            )
            return issues

        if any(np.isinf(mins)) or any(np.isinf(maxs)):
            issues.append(
                ValidationIssue(
                    code="INVALID_BOUNDS",
                    message="Bounds contain infinite values",
                    severity=ValidationSeverity.ERROR,
                    field="bounds",
                )
            )
            return issues

        # Check for inverted bounds
        for i, (min_val, max_val) in enumerate(zip(mins, maxs)):
            if min_val > max_val:
                axis = ["X", "Y", "Z"][i]
                issues.append(
                    ValidationIssue(
                        code="INVERTED_BOUNDS",
                        message=f"{axis} bounds are inverted: min ({min_val}) > max ({max_val})",
                        severity=ValidationSeverity.ERROR,
                        field=f"bounds_{axis.lower()}",
                    )
                )

        # Check for suspicious bounds (possible coordinate system issues)
        # Geographic coordinates should typically be in reasonable ranges
        x_range = maxs[0] - mins[0]
        y_range = maxs[1] - mins[1]

        if x_range == 0 or y_range == 0:
            issues.append(
                ValidationIssue(
                    code="ZERO_EXTENT",
                    message="Point cloud has zero extent in X or Y dimension",
                    severity=ValidationSeverity.WARNING,
                    field="bounds",
                    details={"x_range": x_range, "y_range": y_range},
                )
            )

        return issues

    def _validate_crs(
        self,
        las_file: laspy.LasReader,
        require_crs: bool,
    ) -> list[ValidationIssue]:
        """
        Validate coordinate reference system.

        Args:
            las_file: Open LAS file reader.
            require_crs: Whether CRS is required.

        Returns:
            List of validation issues.
        """
        issues: list[ValidationIssue] = []

        crs_found = False
        crs_wkt: str | None = None

        # Check VLRs for CRS information
        for vlr in las_file.header.vlrs:
            # WKT CRS (record ID 2112)
            if vlr.record_id == 2112:
                crs_found = True
                try:
                    crs_wkt = vlr.string if hasattr(vlr, "string") else vlr.record_data.decode("utf-8")
                except (AttributeError, UnicodeDecodeError):
                    pass

            # GeoTIFF keys (record ID 34735)
            if vlr.record_id == 34735:
                crs_found = True

        if not crs_found:
            severity = ValidationSeverity.ERROR if require_crs else ValidationSeverity.WARNING
            issues.append(
                ValidationIssue(
                    code="MISSING_CRS",
                    message="No coordinate reference system (CRS) found in file",
                    severity=severity,
                    field="crs",
                )
            )
        elif crs_wkt:
            # Validate WKT is not empty or malformed
            if len(crs_wkt.strip()) < 10:
                issues.append(
                    ValidationIssue(
                        code="INVALID_CRS",
                        message="CRS WKT appears to be empty or truncated",
                        severity=ValidationSeverity.WARNING,
                        field="crs",
                    )
                )

        return issues

    def _validate_scale(self, header: laspy.LasHeader) -> list[ValidationIssue]:
        """
        Validate scale factors.

        Args:
            header: LAS file header.

        Returns:
            List of validation issues.
        """
        issues: list[ValidationIssue] = []

        scales = header.scales

        # Check for zero scales
        for i, scale in enumerate(scales):
            axis = ["X", "Y", "Z"][i]
            if scale == 0:
                issues.append(
                    ValidationIssue(
                        code="ZERO_SCALE",
                        message=f"{axis} scale factor is zero",
                        severity=ValidationSeverity.ERROR,
                        field=f"scale_{axis.lower()}",
                    )
                )
            elif scale < 0:
                issues.append(
                    ValidationIssue(
                        code="NEGATIVE_SCALE",
                        message=f"{axis} scale factor is negative: {scale}",
                        severity=ValidationSeverity.WARNING,
                        field=f"scale_{axis.lower()}",
                    )
                )

        # Check for unusual precision
        # Very small scale factors can cause precision issues
        min_scale = min(abs(s) for s in scales if s != 0)
        if min_scale < 1e-10:
            issues.append(
                ValidationIssue(
                    code="EXTREME_PRECISION",
                    message=f"Scale factor {min_scale} may cause precision issues",
                    severity=ValidationSeverity.WARNING,
                    field="scale",
                )
            )

        return issues

    def _validate_point_density(self, header: laspy.LasHeader) -> list[ValidationIssue]:
        """
        Validate point density.

        Args:
            header: LAS file header.

        Returns:
            List of validation issues.
        """
        issues: list[ValidationIssue] = []

        point_count = header.point_count
        mins = header.mins
        maxs = header.maxs

        x_range = maxs[0] - mins[0]
        y_range = maxs[1] - mins[1]
        area = x_range * y_range

        if area > 0:
            density = point_count / area

            # Check for unusually low density
            if density < 0.1:
                issues.append(
                    ValidationIssue(
                        code="LOW_POINT_DENSITY",
                        message=f"Point density ({density:.2f} pts/m2) is very low",
                        severity=ValidationSeverity.WARNING,
                        field="point_density",
                        details={"density": density, "area_sq_m": area},
                    )
                )

            # Check for unusually high density (possible duplicate points)
            if density > 10000:
                issues.append(
                    ValidationIssue(
                        code="HIGH_POINT_DENSITY",
                        message=f"Point density ({density:.0f} pts/m2) is unusually high",
                        severity=ValidationSeverity.WARNING,
                        field="point_density",
                        details={"density": density, "area_sq_m": area},
                    )
                )

        return issues

    def _create_result(
        self,
        file_path: Path,
        issues: list[ValidationIssue],
        file_info: FileInfo | None,
    ) -> ValidationResult:
        """
        Create a ValidationResult from collected issues.

        Args:
            file_path: Path to the validated file.
            issues: List of validation issues found.
            file_info: Basic file information if available.

        Returns:
            ValidationResult instance.
        """
        has_errors = any(i.severity == ValidationSeverity.ERROR for i in issues)
        has_warnings = any(i.severity == ValidationSeverity.WARNING for i in issues)

        if has_errors:
            status = ValidationStatus.INVALID
        elif has_warnings:
            status = ValidationStatus.WARNING
        else:
            status = ValidationStatus.VALID

        return ValidationResult(
            status=status,
            file_path=str(file_path),
            is_valid=not has_errors,
            issues=issues,
            file_info=file_info,
            validated_at=datetime.utcnow(),
        )

    def quick_check(self, file_path: str | Path) -> bool:
        """
        Perform a quick validity check on a file.

        This is a faster check that only verifies the file can be opened
        and has a valid header, without performing full validation.

        Args:
            file_path: Path to the LAS/LAZ file.

        Returns:
            True if the file appears valid, False otherwise.
        """
        file_path = Path(file_path)

        if not file_path.exists():
            return False

        if file_path.suffix.lower() not in self.settings.allowed_extensions:
            return False

        try:
            with laspy.open(str(file_path)) as las_file:
                # Just check we can read the header
                _ = las_file.header.point_count
                return True
        except Exception:
            return False
