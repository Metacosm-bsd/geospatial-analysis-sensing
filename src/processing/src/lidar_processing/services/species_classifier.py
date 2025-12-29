"""
Species Classification Service.

This module provides the main species classification functionality
using Random Forest models trained on LiDAR-derived tree features.

Sprint 13-14: Species Classification ML System
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    ClassificationMetrics,
    SpeciesPrediction,
    TreeFeatures,
)
from lidar_processing.services.feature_extractor import TreeFeatureExtractor
from lidar_processing.services.species_config import (
    SPECIES_BY_REGION,
    get_species_codes_for_region,
    get_species_for_region,
    get_species_info,
)

if TYPE_CHECKING:
    from lidar_processing.models import LabeledTree

logger = logging.getLogger(__name__)


class SpeciesClassifier:
    """
    Random Forest classifier for tree species identification.

    This class provides methods for training, saving, loading, and
    using species classification models based on LiDAR-derived features.

    Attributes:
        model: The trained Random Forest classifier.
        scaler: Feature scaler for normalization.
        label_encoder: Encoder for species labels.
        region: Geographic region for species lookup.
        feature_extractor: Feature extraction utility.
    """

    def __init__(
        self,
        model_path: str | None = None,
        region: str = "pnw",
        settings: Settings | None = None,
    ) -> None:
        """
        Initialize the species classifier.

        Args:
            model_path: Path to a pre-trained model file. If None, creates new model.
            region: Geographic region for species lookup (default: 'pnw').
            settings: Optional settings instance.
        """
        self.settings = settings or get_settings()
        self.region = region.lower()
        self.feature_extractor = TreeFeatureExtractor(self.settings)

        # Initialize model components
        self.model: RandomForestClassifier | None = None
        self.scaler: StandardScaler | None = None
        self.label_encoder: LabelEncoder | None = None
        self._feature_names: list[str] | None = None
        self._is_trained: bool = False

        # Validate region
        if self.region not in SPECIES_BY_REGION:
            available = list(SPECIES_BY_REGION.keys())
            raise ValueError(
                f"Unknown region '{region}'. Available regions: {available}"
            )

        # Load model if path provided
        if model_path is not None:
            self.load_model(model_path)
        else:
            # Initialize with mock pre-trained model for demo
            self._initialize_mock_model()

    def _initialize_mock_model(self) -> None:
        """
        Initialize a mock pre-trained model for demonstration.

        This creates a synthetic model that provides reasonable predictions
        based on tree structural characteristics. In production, this would
        be replaced with a properly trained model.
        """
        logger.info("Initializing mock pre-trained model for region: %s", self.region)

        species_codes = get_species_codes_for_region(self.region)

        # Initialize components
        self.label_encoder = LabelEncoder()
        self.label_encoder.fit(species_codes)

        self.scaler = StandardScaler()
        self._feature_names = self.feature_extractor.get_feature_names(
            include_intensity=True,
            include_returns=True,
        )

        # Create and fit a Random Forest with synthetic data
        n_samples = 500
        n_features = len(self._feature_names)
        n_classes = len(species_codes)

        # Generate synthetic training data
        np.random.seed(42)
        X_synthetic = np.random.randn(n_samples, n_features)
        y_synthetic = np.random.randint(0, n_classes, n_samples)

        # Make the synthetic data somewhat realistic
        # Higher height -> more likely to be certain species
        for i in range(n_samples):
            height_idx = 0  # height feature
            crown_idx = 5  # crown_diameter feature

            # Adjust labels based on height/crown patterns
            height_val = X_synthetic[i, height_idx]
            crown_val = X_synthetic[i, crown_idx]

            # Simple heuristic mapping (in reality, this would come from training)
            if height_val > 1.0 and crown_val < 0:
                y_synthetic[i] = 0  # Tall, narrow crown
            elif height_val < -0.5 and crown_val > 0.5:
                y_synthetic[i] = min(n_classes - 1, 4)  # Short, wide crown

        # Fit scaler
        self.scaler.fit(X_synthetic)
        X_scaled = self.scaler.transform(X_synthetic)

        # Create and train the model
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        )
        self.model.fit(X_scaled, y_synthetic)

        self._is_trained = True
        logger.info(
            "Mock model initialized with %d species classes",
            n_classes,
        )

    def predict(
        self,
        tree_features: list[TreeFeatures],
    ) -> list[SpeciesPrediction]:
        """
        Predict species for multiple trees.

        Args:
            tree_features: List of TreeFeatures for each tree.

        Returns:
            List of SpeciesPrediction results.

        Raises:
            ValueError: If model is not trained.
        """
        if not self._is_trained or self.model is None:
            raise ValueError("Model is not trained. Call train() or load a model first.")

        if not tree_features:
            return []

        return [self.predict_single(features) for features in tree_features]

    def predict_single(
        self,
        features: TreeFeatures,
    ) -> SpeciesPrediction:
        """
        Predict species for a single tree.

        Args:
            features: TreeFeatures for the tree.

        Returns:
            SpeciesPrediction with species and confidence.

        Raises:
            ValueError: If model is not trained.
        """
        if not self._is_trained or self.model is None:
            raise ValueError("Model is not trained. Call train() or load a model first.")

        # Convert features to vector
        feature_vector = self.feature_extractor.get_feature_vector(features)

        # Scale features
        feature_vector_scaled = self.scaler.transform(feature_vector.reshape(1, -1))

        # Get prediction and probabilities
        predicted_class = self.model.predict(feature_vector_scaled)[0]
        probabilities = self.model.predict_proba(feature_vector_scaled)[0]

        # Decode species code
        species_code = self.label_encoder.inverse_transform([predicted_class])[0]

        # Get species info
        try:
            species_info = get_species_info(self.region, species_code)
            species_name = species_info.name
        except ValueError:
            species_name = f"Unknown ({species_code})"

        # Create probability dictionary
        all_species_codes = self.label_encoder.classes_
        prob_dict = {
            code: round(float(prob), 4)
            for code, prob in zip(all_species_codes, probabilities)
        }

        # Confidence is the probability of the predicted class
        confidence = float(probabilities[predicted_class])

        return SpeciesPrediction(
            species_code=species_code,
            species_name=species_name,
            confidence=round(confidence, 4),
            probabilities=prob_dict,
        )

    def predict_with_heuristics(
        self,
        features: TreeFeatures,
    ) -> SpeciesPrediction:
        """
        Predict species using both ML model and rule-based heuristics.

        This method combines ML predictions with domain knowledge heuristics
        for more robust classification, especially useful when the ML model
        has low confidence.

        Args:
            features: TreeFeatures for the tree.

        Returns:
            SpeciesPrediction with potentially adjusted prediction.
        """
        # Get base ML prediction
        ml_prediction = self.predict_single(features)

        # If confidence is high enough, trust the ML model
        if ml_prediction.confidence >= 0.6:
            return ml_prediction

        # Apply heuristics for low-confidence predictions
        adjusted_code = self._apply_heuristics(features, ml_prediction)

        if adjusted_code != ml_prediction.species_code:
            logger.debug(
                "Heuristics adjusted prediction from %s to %s",
                ml_prediction.species_code,
                adjusted_code,
            )

            try:
                species_info = get_species_info(self.region, adjusted_code)
                species_name = species_info.name
            except ValueError:
                species_name = f"Unknown ({adjusted_code})"

            # Adjust probabilities slightly
            adjusted_probs = ml_prediction.probabilities.copy()
            if adjusted_code in adjusted_probs:
                adjusted_probs[adjusted_code] = min(
                    1.0,
                    adjusted_probs[adjusted_code] + 0.15,
                )

            return SpeciesPrediction(
                species_code=adjusted_code,
                species_name=species_name,
                confidence=min(0.7, ml_prediction.confidence + 0.1),
                probabilities=adjusted_probs,
            )

        return ml_prediction

    def _apply_heuristics(
        self,
        features: TreeFeatures,
        ml_prediction: SpeciesPrediction,
    ) -> str:
        """
        Apply domain knowledge heuristics to adjust predictions.

        Args:
            features: Tree features.
            ml_prediction: Initial ML prediction.

        Returns:
            Adjusted species code.
        """
        species_codes = get_species_codes_for_region(self.region)
        species_dict = get_species_for_region(self.region)

        # Get tree characteristics
        height = features.height
        crown_ratio = (
            features.crown_diameter / height if height > 0 else 0.5
        )
        vertical_complexity = features.vertical_complexity

        # Find best matching species based on characteristics
        best_match = ml_prediction.species_code
        best_score = 0.0

        for code in species_codes:
            info = species_dict[code]
            score = 0.0

            # Check height range
            min_h, max_h = info.typical_height_range
            if min_h <= height <= max_h:
                score += 0.3
            elif height < min_h:
                score += 0.1 * (1 - (min_h - height) / min_h)
            else:
                score += 0.1 * (1 - (height - max_h) / max_h)

            # Check crown ratio
            typical_ratio = info.typical_crown_ratio
            ratio_diff = abs(crown_ratio - typical_ratio)
            score += 0.3 * max(0, 1 - ratio_diff / 0.3)

            # Category-based adjustments
            if info.category == "conifer" and vertical_complexity < 0.5:
                score += 0.1
            elif info.category == "deciduous" and vertical_complexity > 0.5:
                score += 0.1

            if score > best_score:
                best_score = score
                best_match = code

        return best_match

    def train(
        self,
        training_data: list[LabeledTree],
        save_path: str | None = None,
        n_estimators: int = 100,
        max_depth: int | None = 15,
        min_samples_split: int = 5,
        cross_validate: bool = True,
    ) -> ClassificationMetrics | None:
        """
        Train a new species classification model.

        Args:
            training_data: List of LabeledTree objects with features and species.
            save_path: Optional path to save the trained model.
            n_estimators: Number of trees in the random forest.
            max_depth: Maximum tree depth (None for unlimited).
            min_samples_split: Minimum samples required to split a node.
            cross_validate: Whether to perform cross-validation.

        Returns:
            ClassificationMetrics if cross_validate is True, else None.
        """
        if not training_data:
            raise ValueError("Training data cannot be empty")

        logger.info("Training species classifier with %d samples", len(training_data))

        # Extract features and labels
        X = []
        y = []

        for labeled_tree in training_data:
            feature_vector = self.feature_extractor.get_feature_vector(
                labeled_tree.features
            )
            X.append(feature_vector)
            y.append(labeled_tree.species_code)

        X = np.array(X)
        y = np.array(y)

        # Initialize and fit label encoder
        self.label_encoder = LabelEncoder()
        y_encoded = self.label_encoder.fit_transform(y)

        # Initialize and fit scaler
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Store feature names
        self._feature_names = self.feature_extractor.get_feature_names(
            include_intensity=True,
            include_returns=True,
        )

        # Create and train the model
        self.model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_split=min_samples_split,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
            class_weight="balanced",
        )

        # Cross-validation if requested
        metrics = None
        if cross_validate:
            from sklearn.model_selection import cross_val_predict, cross_val_score

            logger.info("Performing 5-fold cross-validation...")

            # Get cross-validated predictions
            y_pred_cv = cross_val_predict(
                self.model, X_scaled, y_encoded, cv=5
            )

            # Calculate metrics
            metrics = self._calculate_metrics(y_encoded, y_pred_cv)

            logger.info(
                "Cross-validation complete. Accuracy: %.3f",
                metrics.accuracy,
            )

        # Train on full dataset
        self.model.fit(X_scaled, y_encoded)
        self._is_trained = True

        logger.info("Model training complete")

        # Save if path provided
        if save_path:
            self.save_model(save_path)

        return metrics

    def evaluate(
        self,
        test_data: list[LabeledTree],
    ) -> ClassificationMetrics:
        """
        Evaluate the model on test data.

        Args:
            test_data: List of LabeledTree objects for evaluation.

        Returns:
            ClassificationMetrics with evaluation results.

        Raises:
            ValueError: If model is not trained.
        """
        if not self._is_trained or self.model is None:
            raise ValueError("Model is not trained")

        if not test_data:
            raise ValueError("Test data cannot be empty")

        # Extract features and labels
        X = []
        y_true = []

        for labeled_tree in test_data:
            feature_vector = self.feature_extractor.get_feature_vector(
                labeled_tree.features
            )
            X.append(feature_vector)
            y_true.append(labeled_tree.species_code)

        X = np.array(X)
        y_true = np.array(y_true)

        # Encode labels
        y_true_encoded = self.label_encoder.transform(y_true)

        # Scale features
        X_scaled = self.scaler.transform(X)

        # Get predictions
        y_pred = self.model.predict(X_scaled)

        return self._calculate_metrics(y_true_encoded, y_pred)

    def _calculate_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
    ) -> ClassificationMetrics:
        """Calculate classification metrics."""
        from sklearn.metrics import (
            accuracy_score,
            confusion_matrix,
            f1_score,
            precision_score,
            recall_score,
        )

        # Overall accuracy
        accuracy = accuracy_score(y_true, y_pred)

        # Per-class metrics
        classes = self.label_encoder.classes_

        precision = precision_score(
            y_true, y_pred, average=None, zero_division=0
        )
        recall = recall_score(
            y_true, y_pred, average=None, zero_division=0
        )
        f1 = f1_score(
            y_true, y_pred, average=None, zero_division=0
        )

        precision_dict = {
            cls: round(float(p), 4)
            for cls, p in zip(classes, precision)
        }
        recall_dict = {
            cls: round(float(r), 4)
            for cls, r in zip(classes, recall)
        }
        f1_dict = {
            cls: round(float(f), 4)
            for cls, f in zip(classes, f1)
        }

        # Confusion matrix
        cm = confusion_matrix(y_true, y_pred)
        cm_list = cm.tolist()

        return ClassificationMetrics(
            accuracy=round(float(accuracy), 4),
            precision=precision_dict,
            recall=recall_dict,
            f1_score=f1_dict,
            confusion_matrix=cm_list,
            class_labels=list(classes),
        )

    def save_model(self, path: str) -> None:
        """
        Save the trained model to disk.

        Args:
            path: Path to save the model file.

        Raises:
            ValueError: If model is not trained.
        """
        if not self._is_trained or self.model is None:
            raise ValueError("Model is not trained")

        model_data = {
            "model": self.model,
            "scaler": self.scaler,
            "label_encoder": self.label_encoder,
            "feature_names": self._feature_names,
            "region": self.region,
            "version": "1.0.0",
        }

        # Ensure directory exists
        Path(path).parent.mkdir(parents=True, exist_ok=True)

        joblib.dump(model_data, path)
        logger.info("Model saved to: %s", path)

    def load_model(self, path: str) -> None:
        """
        Load a trained model from disk.

        Args:
            path: Path to the model file.

        Raises:
            FileNotFoundError: If model file doesn't exist.
            ValueError: If model file is invalid.
        """
        if not Path(path).exists():
            raise FileNotFoundError(f"Model file not found: {path}")

        model_data = joblib.load(path)

        # Validate model data
        required_keys = ["model", "scaler", "label_encoder", "region"]
        for key in required_keys:
            if key not in model_data:
                raise ValueError(f"Invalid model file: missing '{key}'")

        self.model = model_data["model"]
        self.scaler = model_data["scaler"]
        self.label_encoder = model_data["label_encoder"]
        self._feature_names = model_data.get("feature_names")
        self.region = model_data["region"]
        self._is_trained = True

        logger.info(
            "Model loaded from: %s (region: %s)",
            path,
            self.region,
        )

    def get_feature_importances(self) -> dict[str, float]:
        """
        Get feature importance rankings from the trained model.

        Returns:
            Dictionary mapping feature names to importance scores.

        Raises:
            ValueError: If model is not trained.
        """
        if not self._is_trained or self.model is None:
            raise ValueError("Model is not trained")

        importances = self.model.feature_importances_
        feature_names = (
            self._feature_names
            or self.feature_extractor.get_feature_names()
        )

        return {
            name: round(float(imp), 4)
            for name, imp in sorted(
                zip(feature_names, importances),
                key=lambda x: x[1],
                reverse=True,
            )
        }

    def get_supported_species(self) -> list[dict]:
        """
        Get list of species supported for the current region.

        Returns:
            List of species information dictionaries.
        """
        species_dict = get_species_for_region(self.region)

        return [
            {
                "code": info.code,
                "name": info.name,
                "scientific_name": info.scientific_name,
                "category": info.category,
            }
            for info in species_dict.values()
        ]

    @property
    def is_trained(self) -> bool:
        """Check if model is trained."""
        return self._is_trained

    @property
    def n_classes(self) -> int:
        """Get number of species classes."""
        if self.label_encoder is None:
            return len(get_species_codes_for_region(self.region))
        return len(self.label_encoder.classes_)
