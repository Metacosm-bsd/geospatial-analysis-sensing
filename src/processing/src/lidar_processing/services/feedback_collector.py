"""
User Feedback Collection Service.

This module provides functionality for collecting, storing, and analyzing
user corrections to species predictions for continuous model improvement.

Sprint 15-16: ML Validation, Calibration, and Feedback Systems
"""

from __future__ import annotations

import csv
import io
import json
import logging
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import redis

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    CorrectionRecord,
    CorrectionStats,
    LabeledTree,
    TreeFeatures,
)

logger = logging.getLogger(__name__)


class FeedbackCollector:
    """
    Collects and manages user feedback for model improvement.

    Stores user corrections to species predictions and provides methods
    for aggregating corrections for model retraining.

    Attributes:
        settings: Application settings.
        redis_client: Optional Redis client for persistent storage.
        corrections: In-memory correction storage (fallback).
    """

    def __init__(
        self,
        settings: Settings | None = None,
        redis_client: redis.Redis | None = None,
    ) -> None:
        """
        Initialize the feedback collector.

        Args:
            settings: Optional settings instance.
            redis_client: Optional Redis client for persistent storage.
        """
        self.settings = settings or get_settings()
        self.redis_client = redis_client

        # In-memory storage as fallback
        self._corrections: list[CorrectionRecord] = []
        self._corrections_by_tree: dict[str, list[CorrectionRecord]] = defaultdict(list)

        # Redis key prefixes
        self._corrections_key = "lidar:feedback:corrections"
        self._stats_key = "lidar:feedback:stats"
        self._tree_features_key = "lidar:feedback:tree_features"

    def record_correction(
        self,
        tree_id: str,
        predicted: str,
        corrected: str,
        user_id: str,
        analysis_id: str | None = None,
        confidence_was: float | None = None,
        tree_features: TreeFeatures | None = None,
        notes: str | None = None,
    ) -> CorrectionRecord:
        """
        Record a user correction to a species prediction.

        Args:
            tree_id: Unique identifier for the tree.
            predicted: The species that was predicted.
            corrected: The correct species provided by the user.
            user_id: Identifier of the user making the correction.
            analysis_id: Optional ID of the analysis containing this tree.
            confidence_was: The confidence of the original prediction.
            tree_features: Optional features of the tree for retraining.
            notes: Optional notes about the correction.

        Returns:
            CorrectionRecord with the recorded correction.
        """
        record = CorrectionRecord(
            tree_id=tree_id,
            analysis_id=analysis_id or "unknown",
            predicted_species=predicted,
            corrected_species=corrected,
            user_id=user_id,
            timestamp=datetime.utcnow(),
            confidence_was=confidence_was or 0.0,
            notes=notes,
        )

        # Store correction
        self._store_correction(record, tree_features)

        logger.info(
            "Recorded correction for tree %s: %s -> %s (by %s)",
            tree_id,
            predicted,
            corrected,
            user_id,
        )

        return record

    def get_corrections_for_retraining(
        self,
        min_samples: int = 100,
        species_filter: list[str] | None = None,
        since: datetime | None = None,
    ) -> list[LabeledTree]:
        """
        Get accumulated corrections formatted for model retraining.

        Args:
            min_samples: Minimum number of corrections required.
            species_filter: Optional list of species codes to include.
            since: Only include corrections after this date.

        Returns:
            List of LabeledTree objects suitable for training.

        Raises:
            ValueError: If insufficient corrections are available.
        """
        corrections = self._get_all_corrections()

        # Apply filters
        if since:
            corrections = [c for c in corrections if c.timestamp >= since]

        if species_filter:
            corrections = [
                c for c in corrections
                if c.corrected_species in species_filter
            ]

        if len(corrections) < min_samples:
            raise ValueError(
                f"Insufficient corrections for retraining. "
                f"Have {len(corrections)}, need at least {min_samples}"
            )

        # Convert to LabeledTree format
        labeled_trees = []
        for correction in corrections:
            features = self._get_tree_features(correction.tree_id)

            if features is not None:
                labeled_tree = LabeledTree(
                    tree_id=correction.tree_id,
                    species_code=correction.corrected_species,
                    features=features,
                    source="user_correction",
                    confidence=0.95,  # High confidence for user corrections
                    notes=f"Corrected from {correction.predicted_species} by {correction.user_id}",
                )
                labeled_trees.append(labeled_tree)

        logger.info(
            "Prepared %d labeled trees from corrections for retraining",
            len(labeled_trees),
        )

        return labeled_trees

    def calculate_correction_statistics(
        self,
        since: datetime | None = None,
    ) -> CorrectionStats:
        """
        Calculate statistics about accumulated corrections.

        Args:
            since: Only include corrections after this date.

        Returns:
            CorrectionStats with aggregated statistics.
        """
        corrections = self._get_all_corrections()

        if since:
            corrections = [c for c in corrections if c.timestamp >= since]

        if not corrections:
            return CorrectionStats(
                total_corrections=0,
                corrections_by_predicted={},
                corrections_by_corrected={},
                most_confused_pairs=[],
                correction_rate_by_species={},
                corrections_by_user={},
                recent_trend=[],
            )

        # Count corrections by predicted species
        corrections_by_predicted: dict[str, int] = defaultdict(int)
        for c in corrections:
            corrections_by_predicted[c.predicted_species] += 1

        # Count corrections by corrected species
        corrections_by_corrected: dict[str, int] = defaultdict(int)
        for c in corrections:
            corrections_by_corrected[c.corrected_species] += 1

        # Find most confused pairs
        confusion_pairs: dict[tuple[str, str], int] = defaultdict(int)
        for c in corrections:
            pair = (c.predicted_species, c.corrected_species)
            confusion_pairs[pair] += 1

        most_confused = sorted(
            confusion_pairs.items(),
            key=lambda x: x[1],
            reverse=True,
        )[:10]

        most_confused_pairs = [
            {
                "predicted": pair[0],
                "corrected": pair[1],
                "count": count,
            }
            for pair, count in most_confused
        ]

        # Count corrections by user
        corrections_by_user: dict[str, int] = defaultdict(int)
        for c in corrections:
            corrections_by_user[c.user_id] += 1

        # Calculate recent trend (corrections per day for last 30 days)
        recent_trend = self._calculate_recent_trend(corrections)

        # Calculate average confidence of corrected predictions
        avg_confidence = sum(c.confidence_was for c in corrections) / len(corrections)

        return CorrectionStats(
            total_corrections=len(corrections),
            corrections_by_predicted=dict(corrections_by_predicted),
            corrections_by_corrected=dict(corrections_by_corrected),
            most_confused_pairs=most_confused_pairs,
            correction_rate_by_species={},  # Would need total predictions to calculate
            corrections_by_user=dict(corrections_by_user),
            recent_trend=recent_trend,
            average_confidence_of_corrected=round(avg_confidence, 4),
            unique_trees_corrected=len(set(c.tree_id for c in corrections)),
            unique_users=len(corrections_by_user),
        )

    def export_corrections(
        self,
        format: str = "csv",
        since: datetime | None = None,
    ) -> bytes:
        """
        Export corrections for external training or analysis.

        Args:
            format: Export format ('csv' or 'json').
            since: Only include corrections after this date.

        Returns:
            Bytes containing the exported data.

        Raises:
            ValueError: If format is not supported.
        """
        corrections = self._get_all_corrections()

        if since:
            corrections = [c for c in corrections if c.timestamp >= since]

        if format.lower() == "csv":
            return self._export_csv(corrections)
        elif format.lower() == "json":
            return self._export_json(corrections)
        else:
            raise ValueError(f"Unsupported export format: {format}")

    def get_correction_history(
        self,
        tree_id: str,
    ) -> list[CorrectionRecord]:
        """
        Get all corrections for a specific tree.

        Args:
            tree_id: The tree to look up.

        Returns:
            List of CorrectionRecord objects for this tree.
        """
        if self.redis_client:
            try:
                key = f"{self._corrections_key}:tree:{tree_id}"
                data = self.redis_client.lrange(key, 0, -1)
                return [
                    CorrectionRecord.model_validate_json(item)
                    for item in data
                ]
            except Exception as e:
                logger.warning("Redis error, falling back to memory: %s", e)

        return self._corrections_by_tree.get(tree_id, [])

    def get_user_corrections(
        self,
        user_id: str,
        limit: int = 100,
    ) -> list[CorrectionRecord]:
        """
        Get recent corrections by a specific user.

        Args:
            user_id: The user to look up.
            limit: Maximum number of corrections to return.

        Returns:
            List of CorrectionRecord objects by this user.
        """
        all_corrections = self._get_all_corrections()
        user_corrections = [c for c in all_corrections if c.user_id == user_id]
        return sorted(user_corrections, key=lambda c: c.timestamp, reverse=True)[:limit]

    def delete_correction(
        self,
        tree_id: str,
        user_id: str,
    ) -> bool:
        """
        Delete a correction (e.g., if it was made in error).

        Args:
            tree_id: The tree ID of the correction.
            user_id: The user who made the correction.

        Returns:
            True if a correction was deleted, False otherwise.
        """
        # Find and remove correction
        for i, c in enumerate(self._corrections):
            if c.tree_id == tree_id and c.user_id == user_id:
                del self._corrections[i]
                logger.info("Deleted correction for tree %s by user %s", tree_id, user_id)
                return True

        if self.redis_client:
            try:
                key = f"{self._corrections_key}:all"
                corrections = self.redis_client.lrange(key, 0, -1)
                for item in corrections:
                    record = CorrectionRecord.model_validate_json(item)
                    if record.tree_id == tree_id and record.user_id == user_id:
                        self.redis_client.lrem(key, 1, item)
                        return True
            except Exception as e:
                logger.warning("Redis error during delete: %s", e)

        return False

    def _store_correction(
        self,
        record: CorrectionRecord,
        features: TreeFeatures | None = None,
    ) -> None:
        """Store a correction in both memory and Redis."""
        # Store in memory
        self._corrections.append(record)
        self._corrections_by_tree[record.tree_id].append(record)

        # Store features if provided
        if features:
            self._store_tree_features(record.tree_id, features)

        # Store in Redis if available
        if self.redis_client:
            try:
                # Store in all corrections list
                key = f"{self._corrections_key}:all"
                self.redis_client.rpush(key, record.model_dump_json())

                # Store in per-tree list
                tree_key = f"{self._corrections_key}:tree:{record.tree_id}"
                self.redis_client.rpush(tree_key, record.model_dump_json())

                # Update stats
                self.redis_client.hincrby(
                    self._stats_key,
                    f"predicted:{record.predicted_species}",
                    1,
                )
                self.redis_client.hincrby(
                    self._stats_key,
                    f"corrected:{record.corrected_species}",
                    1,
                )
                self.redis_client.hincrby(self._stats_key, "total", 1)

            except Exception as e:
                logger.warning("Failed to store correction in Redis: %s", e)

    def _get_all_corrections(self) -> list[CorrectionRecord]:
        """Get all corrections from Redis or memory."""
        if self.redis_client:
            try:
                key = f"{self._corrections_key}:all"
                data = self.redis_client.lrange(key, 0, -1)
                if data:
                    return [
                        CorrectionRecord.model_validate_json(item)
                        for item in data
                    ]
            except Exception as e:
                logger.warning("Redis error, falling back to memory: %s", e)

        return self._corrections

    def _store_tree_features(
        self,
        tree_id: str,
        features: TreeFeatures,
    ) -> None:
        """Store tree features for later use in retraining."""
        if self.redis_client:
            try:
                key = f"{self._tree_features_key}:{tree_id}"
                self.redis_client.set(key, features.model_dump_json())
            except Exception as e:
                logger.warning("Failed to store tree features: %s", e)

    def _get_tree_features(
        self,
        tree_id: str,
    ) -> TreeFeatures | None:
        """Retrieve stored tree features."""
        if self.redis_client:
            try:
                key = f"{self._tree_features_key}:{tree_id}"
                data = self.redis_client.get(key)
                if data:
                    return TreeFeatures.model_validate_json(data)
            except Exception as e:
                logger.warning("Failed to get tree features: %s", e)

        return None

    def _export_csv(self, corrections: list[CorrectionRecord]) -> bytes:
        """Export corrections to CSV format."""
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            "tree_id",
            "analysis_id",
            "predicted_species",
            "corrected_species",
            "user_id",
            "timestamp",
            "confidence_was",
            "notes",
        ])

        # Data rows
        for c in corrections:
            writer.writerow([
                c.tree_id,
                c.analysis_id,
                c.predicted_species,
                c.corrected_species,
                c.user_id,
                c.timestamp.isoformat(),
                c.confidence_was,
                c.notes or "",
            ])

        return output.getvalue().encode("utf-8")

    def _export_json(self, corrections: list[CorrectionRecord]) -> bytes:
        """Export corrections to JSON format."""
        data = [c.model_dump(mode="json") for c in corrections]
        return json.dumps(data, indent=2).encode("utf-8")

    def _calculate_recent_trend(
        self,
        corrections: list[CorrectionRecord],
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """Calculate corrections per day for the recent period."""
        from collections import Counter

        now = datetime.utcnow()

        # Count corrections by date
        date_counts = Counter()
        for c in corrections:
            days_ago = (now - c.timestamp).days
            if days_ago < days:
                date_str = c.timestamp.date().isoformat()
                date_counts[date_str] += 1

        # Sort by date
        trend = [
            {"date": date, "count": count}
            for date, count in sorted(date_counts.items())
        ]

        return trend
