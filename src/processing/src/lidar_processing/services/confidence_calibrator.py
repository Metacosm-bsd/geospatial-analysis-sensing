"""
Confidence Calibration Service.

This module provides confidence calibration capabilities for species
classification models, including Platt scaling, isotonic regression,
and uncertainty estimation.

Sprint 15-16: ML Validation, Calibration, and Feedback Systems
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import numpy as np
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.isotonic import IsotonicRegression

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    CalibrationCurve,
    LabeledTree,
    UncertaintyEstimate,
)
from lidar_processing.services.feature_extractor import TreeFeatureExtractor

if TYPE_CHECKING:
    from lidar_processing.services.species_classifier import SpeciesClassifier

logger = logging.getLogger(__name__)


@dataclass
class CalibratedModel:
    """
    Wrapper for a calibrated model with calibration metadata.

    Attributes:
        calibrated_classifier: The calibrated sklearn classifier.
        calibration_method: Method used for calibration ('platt' or 'isotonic').
        ece_before: Expected calibration error before calibration.
        ece_after: Expected calibration error after calibration.
        n_calibration_samples: Number of samples used for calibration.
    """

    calibrated_classifier: CalibratedClassifierCV
    calibration_method: str
    ece_before: float
    ece_after: float
    n_calibration_samples: int


class ConfidenceCalibrator:
    """
    Calibrates model confidence scores for better probability estimates.

    Provides methods for calibrating classifier probabilities using
    Platt scaling or isotonic regression, and for estimating prediction
    uncertainty.

    Attributes:
        settings: Application settings.
        feature_extractor: Feature extraction utility.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        """
        Initialize the confidence calibrator.

        Args:
            settings: Optional settings instance.
        """
        self.settings = settings or get_settings()
        self.feature_extractor = TreeFeatureExtractor(self.settings)

    def calibrate(
        self,
        model: SpeciesClassifier,
        calibration_data: list[LabeledTree],
        method: str = "isotonic",
        cv: int = 5,
    ) -> CalibratedModel:
        """
        Calibrate model probabilities using the specified method.

        Platt scaling fits a logistic regression on the classifier outputs,
        while isotonic regression fits a non-parametric isotonic model.

        Args:
            model: Trained SpeciesClassifier to calibrate.
            calibration_data: Data to use for calibration.
            method: Calibration method ('platt' or 'isotonic').
            cv: Number of cross-validation folds for calibration.

        Returns:
            CalibratedModel with calibrated classifier and metadata.

        Raises:
            ValueError: If model is not trained or method is invalid.
        """
        if not model.is_trained:
            raise ValueError("Model must be trained before calibration")

        if method not in ("platt", "isotonic", "sigmoid"):
            raise ValueError(f"Invalid calibration method: {method}. Use 'platt' or 'isotonic'")

        if len(calibration_data) < cv * 2:
            raise ValueError(
                f"Insufficient calibration data. Need at least {cv * 2} samples, "
                f"got {len(calibration_data)}"
            )

        logger.info(
            "Calibrating model with %s method on %d samples",
            method,
            len(calibration_data),
        )

        # Prepare data
        X, y = self._prepare_data(calibration_data, model)

        # Calculate ECE before calibration
        y_prob_before = model.model.predict_proba(X)
        ece_before = self.calculate_expected_calibration_error(
            y, y_prob_before[:, 1] if y_prob_before.shape[1] == 2 else y_prob_before.max(axis=1)
        )

        # Map method name for sklearn
        sklearn_method = "sigmoid" if method == "platt" else method

        # Create calibrated classifier
        calibrated = CalibratedClassifierCV(
            model.model,
            method=sklearn_method,
            cv=cv,
        )
        calibrated.fit(X, y)

        # Calculate ECE after calibration
        y_prob_after = calibrated.predict_proba(X)
        ece_after = self.calculate_expected_calibration_error(
            y, y_prob_after[:, 1] if y_prob_after.shape[1] == 2 else y_prob_after.max(axis=1)
        )

        logger.info(
            "Calibration complete. ECE: %.4f -> %.4f (%.1f%% reduction)",
            ece_before,
            ece_after,
            (ece_before - ece_after) / max(ece_before, 0.001) * 100,
        )

        return CalibratedModel(
            calibrated_classifier=calibrated,
            calibration_method=method,
            ece_before=round(ece_before, 4),
            ece_after=round(ece_after, 4),
            n_calibration_samples=len(calibration_data),
        )

    def get_calibration_curve(
        self,
        y_true: np.ndarray,
        y_prob: np.ndarray,
        n_bins: int = 10,
        strategy: str = "uniform",
    ) -> CalibrationCurve:
        """
        Compute reliability diagram data for calibration assessment.

        The calibration curve shows the relationship between predicted
        probabilities and actual frequencies (fraction of positives).

        Args:
            y_true: Ground truth binary labels (0 or 1).
            y_prob: Predicted probabilities for the positive class.
            n_bins: Number of bins for grouping predictions.
            strategy: Binning strategy ('uniform' or 'quantile').

        Returns:
            CalibrationCurve with mean predicted probabilities and
            fraction of positives for each bin.
        """
        # Ensure binary format
        if len(np.unique(y_true)) > 2:
            # For multiclass, use max probability approach
            y_prob_max = y_prob if y_prob.ndim == 1 else y_prob.max(axis=1)
            # Create binary labels based on whether max prob class was correct
            if y_prob.ndim > 1:
                y_pred = y_prob.argmax(axis=1)
                y_binary = (y_pred == y_true).astype(int)
            else:
                y_binary = y_true
                y_prob_max = y_prob
        else:
            y_binary = y_true
            y_prob_max = y_prob

        # Calculate calibration curve
        prob_true, prob_pred = calibration_curve(
            y_binary,
            y_prob_max,
            n_bins=n_bins,
            strategy=strategy,
        )

        # Calculate ECE
        ece = self.calculate_expected_calibration_error(y_binary, y_prob_max, n_bins)

        # Calculate bin counts for additional analysis
        bin_edges = np.linspace(0, 1, n_bins + 1)
        bin_indices = np.digitize(y_prob_max, bin_edges) - 1
        bin_indices = np.clip(bin_indices, 0, n_bins - 1)
        bin_counts = np.bincount(bin_indices, minlength=n_bins)

        return CalibrationCurve(
            mean_predicted_probability=[round(float(p), 4) for p in prob_pred],
            fraction_of_positives=[round(float(p), 4) for p in prob_true],
            expected_calibration_error=round(ece, 4),
            n_bins=n_bins,
            bin_counts=bin_counts.tolist(),
            strategy=strategy,
        )

    def calculate_expected_calibration_error(
        self,
        y_true: np.ndarray,
        y_prob: np.ndarray,
        n_bins: int = 10,
    ) -> float:
        """
        Calculate the Expected Calibration Error (ECE).

        ECE measures the average difference between predicted confidence
        and actual accuracy, weighted by the number of samples in each bin.

        Args:
            y_true: Ground truth labels.
            y_prob: Predicted probabilities (for positive class or max prob).
            n_bins: Number of bins for grouping predictions.

        Returns:
            ECE value (lower is better, 0 is perfectly calibrated).
        """
        # Handle multiclass
        if y_prob.ndim > 1:
            y_prob = y_prob.max(axis=1)
            y_pred = y_prob.argmax(axis=1) if y_prob.ndim > 1 else (y_prob > 0.5).astype(int)
            y_correct = (y_pred == y_true).astype(float)
        else:
            y_correct = y_true.astype(float)

        # Bin the predictions
        bin_boundaries = np.linspace(0, 1, n_bins + 1)
        bin_indices = np.digitize(y_prob, bin_boundaries[1:-1])

        ece = 0.0
        for bin_idx in range(n_bins):
            mask = bin_indices == bin_idx
            if np.sum(mask) > 0:
                bin_accuracy = np.mean(y_correct[mask])
                bin_confidence = np.mean(y_prob[mask])
                bin_size = np.sum(mask) / len(y_prob)
                ece += bin_size * abs(bin_accuracy - bin_confidence)

        return float(ece)

    def get_uncertainty_estimate(
        self,
        predictions: np.ndarray,
        method: str = "entropy",
    ) -> UncertaintyEstimate:
        """
        Estimate prediction uncertainty using entropy or other methods.

        Args:
            predictions: Probability predictions (n_samples x n_classes).
            method: Uncertainty estimation method ('entropy', 'margin', or 'confidence').

        Returns:
            UncertaintyEstimate with uncertainty scores and statistics.

        Raises:
            ValueError: If predictions are invalid or method is unknown.
        """
        if predictions.ndim != 2:
            raise ValueError("Predictions must be 2D array (n_samples x n_classes)")

        n_samples, n_classes = predictions.shape

        if method == "entropy":
            # Shannon entropy normalized by log(n_classes)
            # Clip to avoid log(0)
            probs_clipped = np.clip(predictions, 1e-10, 1.0)
            entropy = -np.sum(probs_clipped * np.log(probs_clipped), axis=1)
            max_entropy = np.log(n_classes)
            uncertainty = entropy / max_entropy

        elif method == "margin":
            # Difference between top two probabilities
            sorted_probs = np.sort(predictions, axis=1)[:, ::-1]
            margin = sorted_probs[:, 0] - sorted_probs[:, 1]
            # Invert so higher = more uncertain
            uncertainty = 1.0 - margin

        elif method == "confidence":
            # 1 - max probability
            uncertainty = 1.0 - np.max(predictions, axis=1)

        else:
            raise ValueError(f"Unknown uncertainty method: {method}")

        # Calculate statistics
        mean_uncertainty = float(np.mean(uncertainty))
        std_uncertainty = float(np.std(uncertainty))
        high_uncertainty_count = int(np.sum(uncertainty > 0.5))
        high_uncertainty_ratio = high_uncertainty_count / n_samples

        # Bin uncertainties
        uncertainty_bins = np.histogram(uncertainty, bins=10, range=(0, 1))[0].tolist()

        return UncertaintyEstimate(
            uncertainty_scores=[round(float(u), 4) for u in uncertainty],
            mean_uncertainty=round(mean_uncertainty, 4),
            std_uncertainty=round(std_uncertainty, 4),
            high_uncertainty_count=high_uncertainty_count,
            high_uncertainty_ratio=round(high_uncertainty_ratio, 4),
            uncertainty_distribution=uncertainty_bins,
            method=method,
            threshold=0.5,
        )

    def evaluate_calibration(
        self,
        model: SpeciesClassifier,
        test_data: list[LabeledTree],
    ) -> dict[str, Any]:
        """
        Comprehensive calibration evaluation for a model.

        Args:
            model: Trained SpeciesClassifier to evaluate.
            test_data: Test data with ground truth labels.

        Returns:
            Dictionary with calibration metrics and recommendations.
        """
        # Prepare data
        X, y = self._prepare_data(test_data, model)

        # Get predictions
        y_prob = model.model.predict_proba(X)

        # Calculate ECE
        ece = self.calculate_expected_calibration_error(y, y_prob.max(axis=1))

        # Get calibration curve
        calib_curve = self.get_calibration_curve(y, y_prob.max(axis=1))

        # Get uncertainty estimates
        uncertainty = self.get_uncertainty_estimate(y_prob)

        # Calculate Brier score (for multiclass)
        brier_score = self._calculate_brier_score(y, y_prob, model.label_encoder)

        # Generate recommendations
        recommendations = []
        if ece > 0.1:
            recommendations.append(
                "ECE is high (>0.1). Consider calibrating the model using Platt scaling or isotonic regression."
            )
        if uncertainty.high_uncertainty_ratio > 0.3:
            recommendations.append(
                f"{uncertainty.high_uncertainty_ratio:.0%} of predictions have high uncertainty. "
                "Consider collecting more training data for ambiguous cases."
            )

        return {
            "expected_calibration_error": round(ece, 4),
            "brier_score": round(brier_score, 4),
            "calibration_curve": calib_curve.model_dump(),
            "uncertainty": uncertainty.model_dump(),
            "n_samples": len(test_data),
            "recommendations": recommendations,
            "calibration_quality": (
                "good" if ece < 0.05 else
                "moderate" if ece < 0.1 else
                "poor"
            ),
        }

    def _prepare_data(
        self,
        data: list[LabeledTree],
        model: SpeciesClassifier,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Prepare feature matrix and labels from labeled trees."""
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

    def _calculate_brier_score(
        self,
        y_true: np.ndarray,
        y_prob: np.ndarray,
        label_encoder,
    ) -> float:
        """
        Calculate multiclass Brier score.

        Args:
            y_true: Ground truth labels (encoded).
            y_prob: Predicted probabilities (n_samples x n_classes).
            label_encoder: Label encoder for class mapping.

        Returns:
            Brier score (lower is better).
        """
        n_classes = len(label_encoder.classes_)

        # One-hot encode true labels
        y_true_onehot = np.zeros((len(y_true), n_classes))
        y_true_onehot[np.arange(len(y_true)), y_true] = 1

        # Calculate Brier score
        brier = np.mean(np.sum((y_prob - y_true_onehot) ** 2, axis=1))

        return float(brier)
