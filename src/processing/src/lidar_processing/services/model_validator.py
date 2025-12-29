"""
Model Validation and Testing Service.

This module provides comprehensive validation and testing capabilities
for species classification models, including confusion matrix generation,
per-class metrics, and validation report generation.

Sprint 15-16: ML Validation, Calibration, and Feedback Systems
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING, Any

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    ClassificationMetrics,
    ClassMetrics,
    ConfusionMatrixData,
    LabeledTree,
    ValidationReport,
)
from lidar_processing.services.feature_extractor import TreeFeatureExtractor

if TYPE_CHECKING:
    from lidar_processing.services.species_classifier import SpeciesClassifier

logger = logging.getLogger(__name__)


class ModelValidator:
    """
    Comprehensive model validation and testing service.

    Provides methods for validating species classification models
    using various metrics and generating detailed validation reports.

    Attributes:
        settings: Application settings.
        feature_extractor: Feature extraction utility.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        """
        Initialize the model validator.

        Args:
            settings: Optional settings instance.
        """
        self.settings = settings or get_settings()
        self.feature_extractor = TreeFeatureExtractor(self.settings)

    def validate_model(
        self,
        model: SpeciesClassifier,
        test_data: list[LabeledTree],
        n_folds: int = 5,
    ) -> ValidationReport:
        """
        Perform comprehensive validation on a trained model.

        This method evaluates the model on test data and generates
        a complete validation report with metrics, confusion matrix,
        and recommendations.

        Args:
            model: Trained SpeciesClassifier instance.
            test_data: List of LabeledTree objects for testing.
            n_folds: Number of folds for cross-validation (if data is large enough).

        Returns:
            ValidationReport with comprehensive metrics and recommendations.

        Raises:
            ValueError: If model is not trained or test data is empty.
        """
        if not model.is_trained:
            raise ValueError("Model must be trained before validation")

        if not test_data:
            raise ValueError("Test data cannot be empty")

        logger.info("Validating model on %d samples", len(test_data))

        # Extract features and labels
        X, y_true = self._prepare_data(test_data, model)

        # Get predictions
        y_pred = model.model.predict(X)

        # Calculate confusion matrix
        confusion_matrix_data = self.calculate_confusion_matrix(
            y_true,
            y_pred,
            labels=model.label_encoder.classes_,
        )

        # Calculate per-class metrics
        per_class_metrics = self.calculate_per_class_metrics(
            y_true,
            y_pred,
            labels=model.label_encoder.classes_,
        )

        # Calculate overall accuracy
        overall_accuracy = float(accuracy_score(y_true, y_pred))

        # Generate recommendations based on metrics
        recommendations = self._generate_recommendations(
            per_class_metrics,
            confusion_matrix_data,
            overall_accuracy,
            len(test_data),
        )

        # Additional validation info
        validation_metadata = {
            "n_samples": len(test_data),
            "n_classes": len(model.label_encoder.classes_),
            "region": model.region,
            "model_version": "1.0.0",
        }

        return ValidationReport(
            overall_accuracy=round(overall_accuracy, 4),
            per_class_metrics=per_class_metrics,
            confusion_matrix=confusion_matrix_data.matrix,
            class_labels=list(model.label_encoder.classes_),
            recommendations=recommendations,
            validation_date=datetime.utcnow(),
            n_samples=len(test_data),
            metadata=validation_metadata,
        )

    def calculate_confusion_matrix(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        labels: list[str] | None = None,
    ) -> ConfusionMatrixData:
        """
        Generate a detailed confusion matrix from predictions.

        Args:
            y_true: Ground truth labels (encoded or string).
            y_pred: Predicted labels (encoded or string).
            labels: Optional list of label names for ordering.

        Returns:
            ConfusionMatrixData with matrix and metadata.
        """
        cm = confusion_matrix(y_true, y_pred)

        # Calculate normalized confusion matrix (row-wise)
        cm_normalized = cm.astype(float)
        row_sums = cm_normalized.sum(axis=1, keepdims=True)
        cm_normalized = np.divide(
            cm_normalized,
            row_sums,
            out=np.zeros_like(cm_normalized),
            where=row_sums != 0,
        )

        # Find most confused pairs
        n_classes = len(cm)
        confused_pairs = []
        for i in range(n_classes):
            for j in range(n_classes):
                if i != j and cm[i, j] > 0:
                    confused_pairs.append({
                        "true_class": labels[i] if labels else str(i),
                        "predicted_class": labels[j] if labels else str(j),
                        "count": int(cm[i, j]),
                        "rate": round(float(cm_normalized[i, j]), 4),
                    })

        # Sort by confusion count descending
        confused_pairs.sort(key=lambda x: x["count"], reverse=True)

        return ConfusionMatrixData(
            matrix=cm.tolist(),
            normalized_matrix=[[round(v, 4) for v in row] for row in cm_normalized.tolist()],
            class_labels=list(labels) if labels is not None else [],
            most_confused_pairs=confused_pairs[:10],  # Top 10 confused pairs
        )

    def calculate_per_class_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        labels: list[str] | None = None,
    ) -> dict[str, ClassMetrics]:
        """
        Calculate precision, recall, and F1 score for each class.

        Args:
            y_true: Ground truth labels.
            y_pred: Predicted labels.
            labels: Optional list of label names.

        Returns:
            Dictionary mapping class labels to ClassMetrics.
        """
        # Get unique classes
        unique_classes = np.unique(np.concatenate([y_true, y_pred]))

        # Calculate per-class metrics
        precision = precision_score(y_true, y_pred, average=None, zero_division=0)
        recall = recall_score(y_true, y_pred, average=None, zero_division=0)
        f1 = f1_score(y_true, y_pred, average=None, zero_division=0)

        # Calculate support (sample count per class)
        support = {}
        for cls in unique_classes:
            support[cls] = int(np.sum(y_true == cls))

        # Build metrics dictionary
        metrics = {}
        for idx, cls in enumerate(unique_classes):
            class_label = labels[cls] if labels is not None and isinstance(cls, (int, np.integer)) else str(cls)

            metrics[class_label] = ClassMetrics(
                precision=round(float(precision[idx]), 4),
                recall=round(float(recall[idx]), 4),
                f1_score=round(float(f1[idx]), 4),
                support=support[cls],
            )

        return metrics

    def cross_validate(
        self,
        model: SpeciesClassifier,
        training_data: list[LabeledTree],
        n_folds: int = 5,
    ) -> dict[str, Any]:
        """
        Perform k-fold cross-validation on the model.

        Args:
            model: SpeciesClassifier instance (will be retrained for each fold).
            training_data: List of LabeledTree objects.
            n_folds: Number of cross-validation folds.

        Returns:
            Dictionary with cross-validation results.
        """
        if len(training_data) < n_folds * 2:
            raise ValueError(
                f"Insufficient data for {n_folds}-fold CV. "
                f"Need at least {n_folds * 2} samples, got {len(training_data)}"
            )

        logger.info("Performing %d-fold cross-validation", n_folds)

        # Prepare data
        X, y = self._prepare_data(training_data, model)

        # Stratified k-fold
        cv = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)

        # Get cross-validated predictions
        y_pred_cv = cross_val_predict(model.model, X, y, cv=cv)

        # Calculate metrics for each fold
        fold_metrics = []
        for fold_idx, (train_idx, test_idx) in enumerate(cv.split(X, y)):
            y_test = y[test_idx]
            y_pred_fold = y_pred_cv[test_idx]

            fold_metrics.append({
                "fold": fold_idx + 1,
                "accuracy": round(float(accuracy_score(y_test, y_pred_fold)), 4),
                "f1_weighted": round(
                    float(f1_score(y_test, y_pred_fold, average="weighted", zero_division=0)),
                    4,
                ),
                "n_samples": len(test_idx),
            })

        # Overall cross-validation metrics
        overall_accuracy = float(accuracy_score(y, y_pred_cv))
        overall_f1 = float(f1_score(y, y_pred_cv, average="weighted", zero_division=0))

        return {
            "n_folds": n_folds,
            "overall_accuracy": round(overall_accuracy, 4),
            "overall_f1_weighted": round(overall_f1, 4),
            "fold_metrics": fold_metrics,
            "accuracy_std": round(float(np.std([f["accuracy"] for f in fold_metrics])), 4),
        }

    def generate_validation_report(
        self,
        model: SpeciesClassifier,
        test_data: list[LabeledTree],
        include_feature_importance: bool = True,
        include_confusion_analysis: bool = True,
    ) -> ValidationReport:
        """
        Generate a comprehensive validation report with detailed analysis.

        This is an alias for validate_model with additional options.

        Args:
            model: Trained SpeciesClassifier instance.
            test_data: List of LabeledTree objects.
            include_feature_importance: Whether to include feature importance analysis.
            include_confusion_analysis: Whether to include confusion analysis.

        Returns:
            Detailed ValidationReport.
        """
        report = self.validate_model(model, test_data)

        # Add feature importance if requested
        if include_feature_importance and model.is_trained:
            try:
                report.metadata["feature_importance"] = model.get_feature_importances()
            except Exception as e:
                logger.warning("Could not get feature importance: %s", e)

        return report

    def compare_models(
        self,
        models: dict[str, SpeciesClassifier],
        test_data: list[LabeledTree],
    ) -> dict[str, Any]:
        """
        Compare multiple models on the same test data.

        Args:
            models: Dictionary mapping model names to SpeciesClassifier instances.
            test_data: List of LabeledTree objects.

        Returns:
            Comparison results with rankings.
        """
        results = {}

        for name, model in models.items():
            try:
                report = self.validate_model(model, test_data)
                results[name] = {
                    "accuracy": report.overall_accuracy,
                    "per_class_metrics": report.per_class_metrics,
                    "validation_date": report.validation_date.isoformat(),
                }
            except Exception as e:
                logger.error("Failed to validate model %s: %s", name, e)
                results[name] = {"error": str(e)}

        # Rank models by accuracy
        valid_results = {k: v for k, v in results.items() if "accuracy" in v}
        rankings = sorted(
            valid_results.items(),
            key=lambda x: x[1]["accuracy"],
            reverse=True,
        )

        return {
            "results": results,
            "rankings": [{"rank": i + 1, "model": name, "accuracy": data["accuracy"]}
                        for i, (name, data) in enumerate(rankings)],
            "best_model": rankings[0][0] if rankings else None,
        }

    def _prepare_data(
        self,
        data: list[LabeledTree],
        model: SpeciesClassifier,
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Prepare feature matrix and labels from labeled trees.

        Args:
            data: List of LabeledTree objects.
            model: SpeciesClassifier for feature extraction and encoding.

        Returns:
            Tuple of (X, y) arrays.
        """
        X = []
        y = []

        for labeled_tree in data:
            feature_vector = self.feature_extractor.get_feature_vector(
                labeled_tree.features
            )
            X.append(feature_vector)
            y.append(labeled_tree.species_code)

        X = np.array(X)
        y = np.array(y)

        # Encode labels
        y_encoded = model.label_encoder.transform(y)

        # Scale features
        X_scaled = model.scaler.transform(X)

        return X_scaled, y_encoded

    def _generate_recommendations(
        self,
        per_class_metrics: dict[str, ClassMetrics],
        confusion_data: ConfusionMatrixData,
        overall_accuracy: float,
        n_samples: int,
    ) -> list[str]:
        """
        Generate actionable recommendations based on validation results.

        Args:
            per_class_metrics: Per-class performance metrics.
            confusion_data: Confusion matrix data.
            overall_accuracy: Overall model accuracy.
            n_samples: Number of test samples.

        Returns:
            List of recommendation strings.
        """
        recommendations = []

        # Check overall accuracy
        if overall_accuracy < 0.7:
            recommendations.append(
                "Overall accuracy is below 70%. Consider collecting more training data "
                "or adjusting model hyperparameters."
            )
        elif overall_accuracy < 0.8:
            recommendations.append(
                "Overall accuracy is moderate (70-80%). The model may benefit from "
                "additional feature engineering or more training samples."
            )

        # Check for classes with low precision
        low_precision_classes = [
            name for name, metrics in per_class_metrics.items()
            if metrics.precision < 0.6 and metrics.support >= 5
        ]
        if low_precision_classes:
            recommendations.append(
                f"The following species have low precision (<60%): {', '.join(low_precision_classes)}. "
                "These species may be over-predicted. Consider adding distinguishing features."
            )

        # Check for classes with low recall
        low_recall_classes = [
            name for name, metrics in per_class_metrics.items()
            if metrics.recall < 0.6 and metrics.support >= 5
        ]
        if low_recall_classes:
            recommendations.append(
                f"The following species have low recall (<60%): {', '.join(low_recall_classes)}. "
                "These species are often missed. Consider collecting more training samples."
            )

        # Check for class imbalance
        supports = [m.support for m in per_class_metrics.values()]
        if supports and max(supports) / max(1, min(supports)) > 5:
            recommendations.append(
                "Significant class imbalance detected. Consider using class weighting, "
                "SMOTE, or collecting more samples for minority classes."
            )

        # Check most confused pairs
        if confusion_data.most_confused_pairs:
            top_confused = confusion_data.most_confused_pairs[0]
            if top_confused["rate"] > 0.2:
                recommendations.append(
                    f"High confusion rate between {top_confused['true_class']} and "
                    f"{top_confused['predicted_class']} ({top_confused['rate']:.0%}). "
                    "These species may need additional distinguishing features."
                )

        # Sample size warning
        if n_samples < 100:
            recommendations.append(
                f"Test set is small ({n_samples} samples). Validation metrics may have "
                "high variance. Consider using cross-validation for more reliable estimates."
            )

        # If no issues found
        if not recommendations:
            recommendations.append(
                "Model performance looks good! Continue monitoring with real-world data "
                "and collect feedback for ongoing improvement."
            )

        return recommendations
