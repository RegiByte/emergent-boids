"""
ML Models Module - Pure functional ML training and prediction

Philosophy: Simple functions compose. Models are just functions.
No classes, just pure transformations.
"""

from typing import Dict, List, Tuple, Optional, Any
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.tree import DecisionTreeRegressor, DecisionTreeClassifier
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.metrics import (
    mean_squared_error, r2_score, mean_absolute_error,
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report
)


# ============================================
# Feature Preparation
# ============================================

def prepare_features(df: pd.DataFrame, feature_cols: List[str], 
                    target_col: str) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Prepare features and target for ML
    
    Returns (X, y) where X is features and y is target.
    Drops rows with NaN values.
    """
    # Select features and target
    data = df[feature_cols + [target_col]].copy()
    
    # Drop NaN values
    data = data.dropna()
    
    X = data[feature_cols]
    y = data[target_col]
    
    return X, y


def split_train_test(X: pd.DataFrame, y: pd.Series, 
                    test_size: float = 0.2, 
                    random_state: int = 42) -> Tuple[pd.DataFrame, pd.DataFrame, 
                                                     pd.Series, pd.Series]:
    """
    Split data into train and test sets
    
    Returns (X_train, X_test, y_train, y_test)
    """
    return train_test_split(X, y, test_size=test_size, random_state=random_state)


# ============================================
# Regression Models
# ============================================

def train_linear_regression(X_train: pd.DataFrame, y_train: pd.Series) -> Any:
    """Train linear regression model"""
    model = LinearRegression()
    model.fit(X_train, y_train)
    return model


def train_decision_tree_regressor(X_train: pd.DataFrame, y_train: pd.Series, 
                                  max_depth: Optional[int] = None) -> Any:
    """Train decision tree regressor"""
    model = DecisionTreeRegressor(max_depth=max_depth, random_state=42)
    model.fit(X_train, y_train)
    return model


def train_random_forest_regressor(X_train: pd.DataFrame, y_train: pd.Series, 
                                  n_estimators: int = 100, 
                                  max_depth: Optional[int] = None) -> Any:
    """Train random forest regressor"""
    model = RandomForestRegressor(
        n_estimators=n_estimators, 
        max_depth=max_depth, 
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)
    return model


# ============================================
# Classification Models
# ============================================

def train_logistic_regression(X_train: pd.DataFrame, y_train: pd.Series, 
                              max_iter: int = 1000) -> Any:
    """Train logistic regression classifier"""
    model = LogisticRegression(max_iter=max_iter, random_state=42)
    model.fit(X_train, y_train)
    return model


def train_decision_tree_classifier(X_train: pd.DataFrame, y_train: pd.Series, 
                                   max_depth: Optional[int] = None) -> Any:
    """Train decision tree classifier"""
    model = DecisionTreeClassifier(max_depth=max_depth, random_state=42)
    model.fit(X_train, y_train)
    return model


def train_random_forest_classifier(X_train: pd.DataFrame, y_train: pd.Series, 
                                   n_estimators: int = 100, 
                                   max_depth: Optional[int] = None) -> Any:
    """Train random forest classifier"""
    model = RandomForestClassifier(
        n_estimators=n_estimators, 
        max_depth=max_depth, 
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)
    return model


# ============================================
# Prediction
# ============================================

def predict(model: Any, X: pd.DataFrame) -> np.ndarray:
    """Make predictions with trained model"""
    return model.predict(X)


def predict_proba(model: Any, X: pd.DataFrame) -> np.ndarray:
    """Get prediction probabilities (for classifiers)"""
    if hasattr(model, 'predict_proba'):
        return model.predict_proba(X)
    else:
        raise ValueError("Model does not support probability predictions")


# ============================================
# Regression Evaluation
# ============================================

def evaluate_regression(y_true: pd.Series, y_pred: np.ndarray) -> Dict[str, float]:
    """
    Evaluate regression model performance
    
    Returns dict with MSE, RMSE, MAE, R²
    """
    mse = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    mae = mean_absolute_error(y_true, y_pred)
    r2 = r2_score(y_true, y_pred)
    
    return {
        'mse': mse,
        'rmse': rmse,
        'mae': mae,
        'r2': r2,
    }


def evaluate_regression_model(model: Any, X_train: pd.DataFrame, y_train: pd.Series, 
                             X_test: pd.DataFrame, y_test: pd.Series) -> Dict[str, Dict[str, float]]:
    """
    Evaluate regression model on train and test sets
    
    Returns dict with 'train' and 'test' metrics
    """
    y_train_pred = predict(model, X_train)
    y_test_pred = predict(model, X_test)
    
    return {
        'train': evaluate_regression(y_train, y_train_pred),
        'test': evaluate_regression(y_test, y_test_pred),
    }


# ============================================
# Classification Evaluation
# ============================================

def evaluate_classification(y_true: pd.Series, y_pred: np.ndarray, 
                           average: str = 'weighted') -> Dict[str, float]:
    """
    Evaluate classification model performance
    
    Returns dict with accuracy, precision, recall, F1
    """
    return {
        'accuracy': accuracy_score(y_true, y_pred),
        'precision': precision_score(y_true, y_pred, average=average, zero_division=0),
        'recall': recall_score(y_true, y_pred, average=average, zero_division=0),
        'f1': f1_score(y_true, y_pred, average=average, zero_division=0),
    }


def evaluate_classification_model(model: Any, X_train: pd.DataFrame, y_train: pd.Series, 
                                 X_test: pd.DataFrame, y_test: pd.Series, 
                                 average: str = 'weighted') -> Dict[str, Dict[str, float]]:
    """
    Evaluate classification model on train and test sets
    
    Returns dict with 'train' and 'test' metrics
    """
    y_train_pred = predict(model, X_train)
    y_test_pred = predict(model, X_test)
    
    return {
        'train': evaluate_classification(y_train, y_train_pred, average),
        'test': evaluate_classification(y_test, y_test_pred, average),
    }


# ============================================
# Feature Importance
# ============================================

def get_feature_importance(model: Any, feature_names: List[str]) -> pd.DataFrame:
    """
    Extract feature importance from model
    
    Works for tree-based models and linear models.
    Returns DataFrame sorted by importance.
    """
    if hasattr(model, 'feature_importances_'):
        # Tree-based models
        importance = model.feature_importances_
    elif hasattr(model, 'coef_'):
        # Linear models
        importance = np.abs(model.coef_)
        if len(importance.shape) > 1:
            importance = importance[0]
    else:
        raise ValueError("Model does not support feature importance extraction")
    
    df = pd.DataFrame({
        'feature': feature_names,
        'importance': importance
    })
    
    return df.sort_values('importance', ascending=False)


# ============================================
# Model Comparison
# ============================================

def compare_regression_models(models: Dict[str, Any], 
                             X_train: pd.DataFrame, y_train: pd.Series, 
                             X_test: pd.DataFrame, y_test: pd.Series) -> pd.DataFrame:
    """
    Compare multiple regression models
    
    Returns DataFrame with metrics for each model.
    """
    results = []
    
    for name, model in models.items():
        metrics = evaluate_regression_model(model, X_train, y_train, X_test, y_test)
        results.append({
            'model': name,
            'train_r2': metrics['train']['r2'],
            'test_r2': metrics['test']['r2'],
            'train_rmse': metrics['train']['rmse'],
            'test_rmse': metrics['test']['rmse'],
            'train_mae': metrics['train']['mae'],
            'test_mae': metrics['test']['mae'],
        })
    
    return pd.DataFrame(results).sort_values('test_r2', ascending=False)


def compare_classification_models(models: Dict[str, Any], 
                                 X_train: pd.DataFrame, y_train: pd.Series, 
                                 X_test: pd.DataFrame, y_test: pd.Series) -> pd.DataFrame:
    """
    Compare multiple classification models
    
    Returns DataFrame with metrics for each model.
    """
    results = []
    
    for name, model in models.items():
        metrics = evaluate_classification_model(model, X_train, y_train, X_test, y_test)
        results.append({
            'model': name,
            'train_accuracy': metrics['train']['accuracy'],
            'test_accuracy': metrics['test']['accuracy'],
            'train_f1': metrics['train']['f1'],
            'test_f1': metrics['test']['f1'],
            'train_precision': metrics['train']['precision'],
            'test_precision': metrics['test']['precision'],
            'train_recall': metrics['train']['recall'],
            'test_recall': metrics['test']['recall'],
        })
    
    return pd.DataFrame(results).sort_values('test_f1', ascending=False)


# ============================================
# Pipeline Composition
# ============================================

def create_regression_pipeline(X: pd.DataFrame, y: pd.Series, 
                               test_size: float = 0.2) -> Dict[str, Any]:
    """
    Create complete regression pipeline
    
    Returns dict with trained models and evaluation results.
    """
    # Split data
    X_train, X_test, y_train, y_test = split_train_test(X, y, test_size)
    
    # Train models
    models = {
        'Linear Regression': train_linear_regression(X_train, y_train),
        'Decision Tree': train_decision_tree_regressor(X_train, y_train, max_depth=5),
        'Random Forest': train_random_forest_regressor(X_train, y_train, n_estimators=50, max_depth=10),
    }
    
    # Compare models
    comparison = compare_regression_models(models, X_train, y_train, X_test, y_test)
    
    # Get best model
    best_model_name = comparison.iloc[0]['model']
    best_model = models[best_model_name]
    
    return {
        'models': models,
        'comparison': comparison,
        'best_model': best_model,
        'best_model_name': best_model_name,
        'X_train': X_train,
        'X_test': X_test,
        'y_train': y_train,
        'y_test': y_test,
    }


def create_classification_pipeline(X: pd.DataFrame, y: pd.Series, 
                                  test_size: float = 0.2) -> Dict[str, Any]:
    """
    Create complete classification pipeline
    
    Returns dict with trained models and evaluation results.
    """
    # Split data
    X_train, X_test, y_train, y_test = split_train_test(X, y, test_size)
    
    # Train models
    models = {
        'Logistic Regression': train_logistic_regression(X_train, y_train),
        'Decision Tree': train_decision_tree_classifier(X_train, y_train, max_depth=5),
        'Random Forest': train_random_forest_classifier(X_train, y_train, n_estimators=50, max_depth=10),
    }
    
    # Compare models
    comparison = compare_classification_models(models, X_train, y_train, X_test, y_test)
    
    # Get best model
    best_model_name = comparison.iloc[0]['model']
    best_model = models[best_model_name]
    
    return {
        'models': models,
        'comparison': comparison,
        'best_model': best_model,
        'best_model_name': best_model_name,
        'X_train': X_train,
        'X_test': X_test,
        'y_train': y_train,
        'y_test': y_test,
    }


# ============================================
# Main Entry Point for Testing
# ============================================

if __name__ == '__main__':
    from data_loader import load_evolution_csv, detect_species_from_columns
    from feature_engineering import (
        calculate_birth_rate, calculate_death_rate, 
        calculate_growth_rate, normalize_z_score
    )
    
    print("🧪 Testing ML models...")
    
    # Load data
    df = load_evolution_csv('../../evolution.csv')
    species = detect_species_from_columns(df)
    
    # Create features for predicting cautious population
    print("\n📊 Creating features for population prediction...")
    
    # Use first species for testing
    test_species = species[0]
    pop_col = f'{test_species}_population'
    births_col = f'{test_species}_births'
    deaths_col = f'{test_species}_deaths'
    
    # Calculate features
    df['birth_rate'] = calculate_birth_rate(
        df[births_col], df[pop_col], df['deltaSeconds']
    )
    df['death_rate'] = calculate_death_rate(
        df[deaths_col], df[pop_col], df['deltaSeconds']
    )
    df['growth_rate'] = calculate_growth_rate(
        df[births_col], df[deaths_col], df[pop_col], df['deltaSeconds']
    )
    
    # Create target: next tick population
    df['next_population'] = df[pop_col].shift(-1)
    
    # Select features
    feature_cols = ['birth_rate', 'death_rate', 'growth_rate', pop_col]
    target_col = 'next_population'
    
    # Prepare data
    X, y = prepare_features(df, feature_cols, target_col)
    print(f"  Features shape: {X.shape}")
    print(f"  Target shape: {y.shape}")
    
    # Test regression pipeline
    print("\n📊 Testing regression pipeline...")
    pipeline = create_regression_pipeline(X, y, test_size=0.2)
    
    print("\n📊 Model Comparison:")
    print(pipeline['comparison'].to_string(index=False))
    
    print(f"\n📊 Best Model: {pipeline['best_model_name']}")
    best_metrics = evaluate_regression_model(
        pipeline['best_model'], 
        pipeline['X_train'], pipeline['y_train'],
        pipeline['X_test'], pipeline['y_test']
    )
    print(f"  Test R²: {best_metrics['test']['r2']:.4f}")
    print(f"  Test RMSE: {best_metrics['test']['rmse']:.4f}")
    
    # Test feature importance
    print("\n📊 Feature Importance:")
    importance = get_feature_importance(pipeline['best_model'], feature_cols)
    print(importance.to_string(index=False))
    
    # Test classification (predict stability class)
    print("\n📊 Testing classification pipeline...")
    
    # Create stability classes
    df['stability_class'] = pd.cut(
        df['growth_rate'], 
        bins=[-np.inf, -0.01, 0.01, np.inf],
        labels=['declining', 'stable', 'growing']
    )
    
    X_class, y_class = prepare_features(df, feature_cols, 'stability_class')
    print(f"  Class distribution: {y_class.value_counts().to_dict()}")
    
    class_pipeline = create_classification_pipeline(X_class, y_class, test_size=0.2)
    
    print("\n📊 Classification Model Comparison:")
    print(class_pipeline['comparison'].to_string(index=False))
    
    print(f"\n📊 Best Classifier: {class_pipeline['best_model_name']}")
    best_class_metrics = evaluate_classification_model(
        class_pipeline['best_model'],
        class_pipeline['X_train'], class_pipeline['y_train'],
        class_pipeline['X_test'], class_pipeline['y_test']
    )
    print(f"  Test Accuracy: {best_class_metrics['test']['accuracy']:.4f}")
    print(f"  Test F1: {best_class_metrics['test']['f1']:.4f}")
    
    print("\n✅ All ML model tests passed!")

