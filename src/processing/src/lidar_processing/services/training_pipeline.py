"""
Training Pipeline for Species Classification Models.

This module provides the complete workflow for training, evaluating,
and managing species classification models.

Sprint 13-14: Species Classification ML System
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import (
    GridSearchCV,
    StratifiedKFold,
    cross_val_score,
    train_test_split,
)
from sklearn.preprocessing import LabelEncoder, StandardScaler

from lidar_processing.config import Settings, get_settings
from lidar_processing.models import (
    ClassificationMetrics,
    LabeledTree,
    TreeFeatures,
)
from lidar_processing.services.feature_extractor import TreeFeatureExtractor

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class TrainingPipeline:
    """
    Complete training pipeline for species classification models.

    This class handles the entire ML workflow from data loading to
    model evaluation and persistence.

    Attributes:
        settings: Application settings.
        feature_extractor: Feature extraction utility.
        region: Geographic region for the model.
    """

    def __init__(
        self,
        region: str = "pnw",
        settings: Settings | None = None,
    ) -> None:
        """
        Initialize the training pipeline.

        Args:
            region: Geographic region for species classification.
            settings: Optional settings instance.
        """
        self.settings = settings or get_settings()
        self.region = region.lower()
        self.feature_extractor = TreeFeatureExtractor(self.settings)

        # Training state
        self._model: RandomForestClassifier | None = None
        self._scaler: StandardScaler | None = None
        self._label_encoder: LabelEncoder | None = None
        self._feature_names: list[str] | None = None
        self._training_history: list[dict] = []

    def load_training_data(
        self,
        data_path: str,
        file_format: str = "json",
    ) -> list[LabeledTree]:
        """
        Load training data from a file.

        Args:
            data_path: Path to the training data file.
            file_format: Format of the data file ('json' or 'csv').

        Returns:
            List of LabeledTree objects.

        Raises:
            FileNotFoundError: If data file doesn't exist.
            ValueError: If file format is unsupported.
        """
        path = Path(data_path)

        if not path.exists():
            raise FileNotFoundError(f"Training data not found: {data_path}")

        logger.info("Loading training data from: %s", data_path)

        if file_format.lower() == "json":
            return self._load_json_data(path)
        elif file_format.lower() == "csv":
            return self._load_csv_data(path)
        else:
            raise ValueError(f"Unsupported file format: {file_format}")

    def _load_json_data(self, path: Path) -> list[LabeledTree]:
        """Load training data from JSON file."""
        with open(path) as f:
            data = json.load(f)

        labeled_trees = []

        for item in data:
            # Parse features
            features_data = item.get("features", {})
            features = TreeFeatures(
                height=features_data.get("height", 0.0),
                crown_diameter=features_data.get("crown_diameter", 0.0),
                crown_area=features_data.get("crown_area", 0.0),
                height_percentiles=features_data.get(
                    "height_percentiles", [0.0] * 5
                ),
                crown_density=features_data.get("crown_density", 0.0),
                vertical_complexity=features_data.get("vertical_complexity", 0.0),
                intensity_mean=features_data.get("intensity_mean"),
                intensity_std=features_data.get("intensity_std"),
                point_count=features_data.get("point_count", 0),
                height_mean=features_data.get("height_mean"),
                height_std=features_data.get("height_std"),
                height_skewness=features_data.get("height_skewness"),
                height_kurtosis=features_data.get("height_kurtosis"),
                crown_asymmetry=features_data.get("crown_asymmetry"),
                crown_perimeter=features_data.get("crown_perimeter"),
                crown_circularity=features_data.get("crown_circularity"),
                canopy_relief_ratio=features_data.get("canopy_relief_ratio"),
                gap_fraction=features_data.get("gap_fraction"),
                layer_count=features_data.get("layer_count"),
                crown_base_height=features_data.get("crown_base_height"),
                crown_length_ratio=features_data.get("crown_length_ratio"),
                point_density_upper=features_data.get("point_density_upper"),
                point_density_mid=features_data.get("point_density_mid"),
                point_density_lower=features_data.get("point_density_lower"),
                intensity_max=features_data.get("intensity_max"),
                intensity_percentile_90=features_data.get("intensity_percentile_90"),
                first_return_ratio=features_data.get("first_return_ratio"),
                last_return_ratio=features_data.get("last_return_ratio"),
                single_return_ratio=features_data.get("single_return_ratio"),
            )

            labeled_tree = LabeledTree(
                tree_id=item.get("tree_id", ""),
                species_code=item["species_code"],
                features=features,
                source=item.get("source", "manual"),
                confidence=item.get("confidence", 1.0),
            )

            labeled_trees.append(labeled_tree)

        logger.info("Loaded %d labeled trees", len(labeled_trees))
        return labeled_trees

    def _load_csv_data(self, path: Path) -> list[LabeledTree]:
        """Load training data from CSV file."""
        import pandas as pd

        df = pd.read_csv(path)

        labeled_trees = []

        for _, row in df.iterrows():
            # Create features from row
            features = TreeFeatures(
                height=row.get("height", 0.0),
                crown_diameter=row.get("crown_diameter", 0.0),
                crown_area=row.get("crown_area", 0.0),
                height_percentiles=[
                    row.get("height_p25", 0.0),
                    row.get("height_p50", 0.0),
                    row.get("height_p75", 0.0),
                    row.get("height_p90", 0.0),
                    row.get("height_p95", 0.0),
                ],
                crown_density=row.get("crown_density", 0.0),
                vertical_complexity=row.get("vertical_complexity", 0.0),
                intensity_mean=row.get("intensity_mean"),
                intensity_std=row.get("intensity_std"),
                point_count=int(row.get("point_count", 0)),
            )

            labeled_tree = LabeledTree(
                tree_id=str(row.get("tree_id", "")),
                species_code=row["species_code"],
                features=features,
                source=row.get("source", "csv_import"),
                confidence=row.get("confidence", 1.0),
            )

            labeled_trees.append(labeled_tree)

        logger.info("Loaded %d labeled trees from CSV", len(labeled_trees))
        return labeled_trees

    def prepare_training_set(
        self,
        data: list[LabeledTree],
        test_size: float = 0.2,
        stratify: bool = True,
        random_state: int = 42,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Prepare feature matrices and labels from training data.

        Args:
            data: List of LabeledTree objects.
            test_size: Fraction of data to use for testing.
            stratify: Whether to stratify the split by species.
            random_state: Random seed for reproducibility.

        Returns:
            Tuple of (X_train, X_test, y_train, y_test).
        """
        logger.info("Preparing training set from %d samples", len(data))

        # Extract features and labels
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

        # Initialize label encoder
        self._label_encoder = LabelEncoder()
        y_encoded = self._label_encoder.fit_transform(y)

        # Store feature names
        self._feature_names = self.feature_extractor.get_feature_names(
            include_intensity=True,
            include_returns=True,
        )

        # Split data
        stratify_labels = y_encoded if stratify else None

        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y_encoded,
            test_size=test_size,
            random_state=random_state,
            stratify=stratify_labels,
        )

        # Fit scaler on training data only
        self._scaler = StandardScaler()
        X_train = self._scaler.fit_transform(X_train)
        X_test = self._scaler.transform(X_test)

        logger.info(
            "Split data: %d train, %d test samples",
            len(X_train),
            len(X_test),
        )

        return X_train, X_test, y_train, y_test

    def cross_validate(
        self,
        X: np.ndarray,
        y: np.ndarray,
        n_folds: int = 5,
        model_params: dict | None = None,
    ) -> dict[str, Any]:
        """
        Perform cross-validation on the training data.

        Args:
            X: Feature matrix.
            y: Label vector.
            n_folds: Number of cross-validation folds.
            model_params: Optional Random Forest parameters.

        Returns:
            Dictionary with cross-validation results.
        """
        logger.info("Performing %d-fold cross-validation", n_folds)

        params = model_params or {
            "n_estimators": 100,
            "max_depth": 15,
            "min_samples_split": 5,
            "random_state": 42,
        }

        model = RandomForestClassifier(**params, n_jobs=-1)

        # Stratified k-fold
        cv = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)

        # Calculate scores
        accuracy_scores = cross_val_score(model, X, y, cv=cv, scoring="accuracy")
        f1_scores = cross_val_score(model, X, y, cv=cv, scoring="f1_weighted")
        precision_scores = cross_val_score(
            model, X, y, cv=cv, scoring="precision_weighted"
        )
        recall_scores = cross_val_score(model, X, y, cv=cv, scoring="recall_weighted")

        results = {
            "n_folds": n_folds,
            "accuracy": {
                "mean": round(float(np.mean(accuracy_scores)), 4),
                "std": round(float(np.std(accuracy_scores)), 4),
                "scores": [round(float(s), 4) for s in accuracy_scores],
            },
            "f1_weighted": {
                "mean": round(float(np.mean(f1_scores)), 4),
                "std": round(float(np.std(f1_scores)), 4),
                "scores": [round(float(s), 4) for s in f1_scores],
            },
            "precision_weighted": {
                "mean": round(float(np.mean(precision_scores)), 4),
                "std": round(float(np.std(precision_scores)), 4),
            },
            "recall_weighted": {
                "mean": round(float(np.mean(recall_scores)), 4),
                "std": round(float(np.std(recall_scores)), 4),
            },
        }

        logger.info(
            "Cross-validation complete. Mean accuracy: %.4f (+/- %.4f)",
            results["accuracy"]["mean"],
            results["accuracy"]["std"],
        )

        return results

    def hyperparameter_search(
        self,
        X: np.ndarray,
        y: np.ndarray,
        param_grid: dict | None = None,
        n_folds: int = 5,
    ) -> dict[str, Any]:
        """
        Perform hyperparameter search using grid search with cross-validation.

        Args:
            X: Feature matrix.
            y: Label vector.
            param_grid: Parameter grid to search. If None, uses default grid.
            n_folds: Number of cross-validation folds.

        Returns:
            Dictionary with best parameters and scores.
        """
        logger.info("Starting hyperparameter search...")

        if param_grid is None:
            param_grid = {
                "n_estimators": [50, 100, 200],
                "max_depth": [10, 15, 20, None],
                "min_samples_split": [2, 5, 10],
                "min_samples_leaf": [1, 2, 4],
            }

        base_model = RandomForestClassifier(random_state=42, n_jobs=-1)

        cv = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)

        grid_search = GridSearchCV(
            base_model,
            param_grid,
            cv=cv,
            scoring="f1_weighted",
            n_jobs=-1,
            verbose=1,
        )

        grid_search.fit(X, y)

        results = {
            "best_params": grid_search.best_params_,
            "best_score": round(float(grid_search.best_score_), 4),
            "cv_results": {
                "mean_test_score": [
                    round(float(s), 4)
                    for s in grid_search.cv_results_["mean_test_score"]
                ],
                "std_test_score": [
                    round(float(s), 4)
                    for s in grid_search.cv_results_["std_test_score"]
                ],
            },
        }

        logger.info(
            "Hyperparameter search complete. Best score: %.4f",
            results["best_score"],
        )
        logger.info("Best parameters: %s", results["best_params"])

        return results

    def train_model(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        model_params: dict | None = None,
    ) -> RandomForestClassifier:
        """
        Train a Random Forest model.

        Args:
            X_train: Training feature matrix.
            y_train: Training labels.
            model_params: Optional model parameters.

        Returns:
            Trained RandomForestClassifier.
        """
        logger.info("Training model on %d samples", len(X_train))

        params = model_params or {
            "n_estimators": 100,
            "max_depth": 15,
            "min_samples_split": 5,
            "min_samples_leaf": 2,
            "random_state": 42,
            "class_weight": "balanced",
        }

        self._model = RandomForestClassifier(**params, n_jobs=-1)
        self._model.fit(X_train, y_train)

        logger.info("Model training complete")

        return self._model

    def evaluate_model(
        self,
        X_test: np.ndarray,
        y_test: np.ndarray,
    ) -> ClassificationMetrics:
        """
        Evaluate the trained model on test data.

        Args:
            X_test: Test feature matrix.
            y_test: Test labels.

        Returns:
            ClassificationMetrics with evaluation results.

        Raises:
            ValueError: If model is not trained.
        """
        if self._model is None:
            raise ValueError("Model has not been trained")

        logger.info("Evaluating model on %d test samples", len(X_test))

        from sklearn.metrics import (
            accuracy_score,
            confusion_matrix,
            f1_score,
            precision_score,
            recall_score,
        )

        y_pred = self._model.predict(X_test)

        # Calculate metrics
        accuracy = accuracy_score(y_test, y_pred)

        classes = self._label_encoder.classes_

        precision = precision_score(y_test, y_pred, average=None, zero_division=0)
        recall = recall_score(y_test, y_pred, average=None, zero_division=0)
        f1 = f1_score(y_test, y_pred, average=None, zero_division=0)

        precision_dict = {
            cls: round(float(p), 4) for cls, p in zip(classes, precision)
        }
        recall_dict = {
            cls: round(float(r), 4) for cls, r in zip(classes, recall)
        }
        f1_dict = {
            cls: round(float(f), 4) for cls, f in zip(classes, f1)
        }

        cm = confusion_matrix(y_test, y_pred)

        metrics = ClassificationMetrics(
            accuracy=round(float(accuracy), 4),
            precision=precision_dict,
            recall=recall_dict,
            f1_score=f1_dict,
            confusion_matrix=cm.tolist(),
            class_labels=list(classes),
        )

        logger.info("Evaluation complete. Accuracy: %.4f", accuracy)

        return metrics

    def save_model(
        self,
        path: str,
        include_metadata: bool = True,
    ) -> None:
        """
        Save the trained model and associated components.

        Args:
            path: Path to save the model file.
            include_metadata: Whether to include training metadata.

        Raises:
            ValueError: If model is not trained.
        """
        if self._model is None:
            raise ValueError("No model to save")

        model_data = {
            "model": self._model,
            "scaler": self._scaler,
            "label_encoder": self._label_encoder,
            "feature_names": self._feature_names,
            "region": self.region,
            "version": "1.0.0",
        }

        if include_metadata:
            model_data["metadata"] = {
                "trained_at": datetime.utcnow().isoformat(),
                "n_classes": len(self._label_encoder.classes_),
                "n_features": len(self._feature_names),
                "classes": list(self._label_encoder.classes_),
                "training_history": self._training_history,
            }

        # Ensure directory exists
        Path(path).parent.mkdir(parents=True, exist_ok=True)

        joblib.dump(model_data, path)
        logger.info("Model saved to: %s", path)

    def load_model(self, path: str) -> RandomForestClassifier:
        """
        Load a trained model from disk.

        Args:
            path: Path to the model file.

        Returns:
            Loaded RandomForestClassifier.

        Raises:
            FileNotFoundError: If model file doesn't exist.
        """
        if not Path(path).exists():
            raise FileNotFoundError(f"Model file not found: {path}")

        model_data = joblib.load(path)

        self._model = model_data["model"]
        self._scaler = model_data["scaler"]
        self._label_encoder = model_data["label_encoder"]
        self._feature_names = model_data.get("feature_names")
        self.region = model_data.get("region", self.region)

        logger.info("Model loaded from: %s", path)

        return self._model

    def run_full_pipeline(
        self,
        training_data: list[LabeledTree],
        output_path: str,
        test_size: float = 0.2,
        perform_hyperparameter_search: bool = False,
        model_params: dict | None = None,
    ) -> dict[str, Any]:
        """
        Run the complete training pipeline.

        Args:
            training_data: List of LabeledTree objects.
            output_path: Path to save the trained model.
            test_size: Fraction of data for testing.
            perform_hyperparameter_search: Whether to perform hyperparameter tuning.
            model_params: Optional model parameters (ignored if searching).

        Returns:
            Dictionary with training results.
        """
        logger.info("Starting full training pipeline with %d samples", len(training_data))

        # Prepare data
        X_train, X_test, y_train, y_test = self.prepare_training_set(
            training_data,
            test_size=test_size,
        )

        # Cross-validation
        cv_results = self.cross_validate(X_train, y_train)

        # Hyperparameter search if requested
        if perform_hyperparameter_search:
            search_results = self.hyperparameter_search(X_train, y_train)
            model_params = search_results["best_params"]
        else:
            search_results = None

        # Train final model
        self.train_model(X_train, y_train, model_params)

        # Evaluate
        metrics = self.evaluate_model(X_test, y_test)

        # Save model
        self.save_model(output_path)

        # Record training history
        training_record = {
            "timestamp": datetime.utcnow().isoformat(),
            "n_samples": len(training_data),
            "n_train": len(X_train),
            "n_test": len(X_test),
            "cv_accuracy": cv_results["accuracy"]["mean"],
            "test_accuracy": metrics.accuracy,
            "model_params": model_params,
        }
        self._training_history.append(training_record)

        results = {
            "cross_validation": cv_results,
            "hyperparameter_search": search_results,
            "test_metrics": metrics.model_dump(),
            "model_path": output_path,
            "training_record": training_record,
        }

        logger.info("Training pipeline complete. Test accuracy: %.4f", metrics.accuracy)

        return results

    def get_feature_importance(self) -> dict[str, float]:
        """
        Get feature importance from the trained model.

        Returns:
            Dictionary mapping feature names to importance scores.

        Raises:
            ValueError: If model is not trained.
        """
        if self._model is None:
            raise ValueError("Model has not been trained")

        importances = self._model.feature_importances_

        return {
            name: round(float(imp), 4)
            for name, imp in sorted(
                zip(self._feature_names, importances),
                key=lambda x: x[1],
                reverse=True,
            )
        }


def create_synthetic_training_data(
    region: str,
    n_samples: int = 100,
    seed: int = 42,
) -> list[LabeledTree]:
    """
    Create synthetic training data for testing and demonstration.

    Args:
        region: Geographic region for species selection.
        n_samples: Number of samples to generate.
        seed: Random seed for reproducibility.

    Returns:
        List of LabeledTree objects.
    """
    from lidar_processing.services.species_config import get_species_for_region

    np.random.seed(seed)

    species_dict = get_species_for_region(region)
    species_list = list(species_dict.values())

    labeled_trees = []

    for i in range(n_samples):
        # Select a random species
        species = species_list[i % len(species_list)]

        # Generate realistic features based on species characteristics
        min_h, max_h = species.typical_height_range
        height = np.random.uniform(min_h, max_h)
        crown_diameter = height * species.typical_crown_ratio * np.random.uniform(0.8, 1.2)
        crown_area = np.pi * (crown_diameter / 2) ** 2

        # Add some noise
        vertical_complexity = 0.3 if species.category == "conifer" else 0.6
        vertical_complexity *= np.random.uniform(0.7, 1.3)

        features = TreeFeatures(
            height=round(height, 2),
            crown_diameter=round(crown_diameter, 2),
            crown_area=round(crown_area, 2),
            height_percentiles=[
                round(height * 0.25, 2),
                round(height * 0.50, 2),
                round(height * 0.75, 2),
                round(height * 0.90, 2),
                round(height * 0.95, 2),
            ],
            crown_density=round(np.random.uniform(0.3, 0.8), 3),
            vertical_complexity=round(vertical_complexity, 3),
            point_count=int(np.random.uniform(500, 5000)),
            height_mean=round(height * 0.6, 2),
            height_std=round(height * 0.2, 2),
            crown_asymmetry=round(np.random.uniform(0.05, 0.25), 3),
            crown_circularity=round(np.random.uniform(0.7, 0.95), 3),
            canopy_relief_ratio=round(np.random.uniform(0.4, 0.7), 3),
            gap_fraction=round(np.random.uniform(0.1, 0.4), 3),
            layer_count=int(np.random.uniform(2, 5)),
            crown_base_height=round(height * 0.3, 2),
            crown_length_ratio=round(np.random.uniform(0.5, 0.8), 3),
            point_density_upper=round(np.random.uniform(0.3, 0.5), 3),
            point_density_mid=round(np.random.uniform(0.3, 0.4), 3),
            point_density_lower=round(np.random.uniform(0.2, 0.3), 3),
        )

        labeled_tree = LabeledTree(
            tree_id=f"synthetic_{i:04d}",
            species_code=species.code,
            features=features,
            source="synthetic",
            confidence=0.9,
        )

        labeled_trees.append(labeled_tree)

    return labeled_trees
