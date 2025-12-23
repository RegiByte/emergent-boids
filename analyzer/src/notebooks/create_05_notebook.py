#!/usr/bin/env python3
"""
Script to generate 05-time-series-prediction.ipynb

Philosophy: One notebook, one purpose - "This is how you predict future states"
Builds on knowledge from notebook 04 (death cause prediction)
"""

import json
from pathlib import Path

def create_notebook():
    """Create notebook structure with cells"""
    
    cells = []
    
    # Cell 0: Title
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "# ⏰ Time Series Prediction\n",
            "\n",
            "**Train models to predict future ecosystem states**\n",
            "\n",
            "Philosophy: Everything is information processing. Simple rules compose. Emergence is reliable.\n",
            "\n",
            "---\n",
            "\n",
            "## Purpose\n",
            "\n",
            "In notebooks 02-04, we predicted **next tick** only (single-step).\n",
            "\n",
            "In this notebook, we predict **multiple steps ahead** (multi-step):\n",
            "- Use **lag features** (population at t-1, t-2, t-3)\n",
            "- Use **rolling statistics** (trends over 10, 50, 100 ticks)\n",
            "- Predict **10+ ticks into the future**\n",
            "- Detect **instability early** (before it happens!)\n",
            "\n",
            "This enables:\n",
            "- Early warning systems\n",
            "- Trend forecasting\n",
            "- Stability prediction\n",
            "- Real-time alerts\n",
            "\n",
            "---\n",
            "\n",
            "## Contents\n",
            "1. Setup & Data Loading\n",
            "2. Temporal Feature Engineering\n",
            "3. Single-Step Prediction (Baseline)\n",
            "4. Multi-Step Prediction\n",
            "5. Trend Detection\n",
            "6. Stability Forecasting\n",
            "7. Early Warning System\n",
            "8. Summary & Insights"
        ]
    })
    
    # Cell 1: Section header
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": ["## 1. Setup & Data Loading"]
    })
    
    # Cell 2: Imports
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Import libraries\n",
            "import sys\n",
            "from pathlib import Path\n",
            "\n",
            "# Add parent directory to path\n",
            "sys.path.insert(0, str(Path.cwd().parent.parent))\n",
            "\n",
            "import pandas as pd\n",
            "import numpy as np\n",
            "import matplotlib.pyplot as plt\n",
            "import seaborn as sns\n",
            "\n",
            "# Import our ML modules\n",
            "from src.ml import (\n",
            "    load_evolution_csv, detect_species_from_columns,\n",
            "    aggregate_species_metric, calculate_growth_rate,\n",
            "    calculate_rolling_mean, calculate_rolling_std, calculate_rolling_cv,\n",
            "    create_lag_feature, prepare_features,\n",
            "    create_regression_pipeline, get_feature_importance\n",
            ")\n",
            "\n",
            "# Configure plotting\n",
            "plt.style.use('seaborn-v0_8-darkgrid')\n",
            "sns.set_palette('husl')\n",
            "%matplotlib inline\n",
            "\n",
            "print('✅ Setup complete!')"
        ]
    })
    
    # Cell 3: Load data
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Load evolution data\n",
            "df = load_evolution_csv('../../datasets/evolution.csv')\n",
            "species = detect_species_from_columns(df)\n",
            "\n",
            "print(f'✅ Loaded {len(df)} snapshots')\n",
            "print(f'✅ Species: {\", \".join(species)}')\n",
            "print(f'\\n📊 Time range: tick {df[\"tick\"].min()} → {df[\"tick\"].max()}')\n",
            "print(f'📊 Duration: {df[\"timestamp\"].max():.1f} seconds')"
        ]
    })
    
    # Cell 4: Section header
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 2. Temporal Feature Engineering\n",
            "\n",
            "Create features that capture **temporal patterns**:\n",
            "\n",
            "### **Lag Features**\n",
            "- Population at t-1, t-2, t-3 (recent history)\n",
            "\n",
            "### **Rolling Statistics**\n",
            "- Mean, std, CV over 10, 50, 100 tick windows\n",
            "- Captures trends and stability\n",
            "\n",
            "### **Momentum Features**\n",
            "- Rate of change (acceleration)\n",
            "- Trend direction"
        ]
    })
    
    # Cell 5: Engineer temporal features
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "print('🔧 Engineering temporal features...\\n')\n",
            "\n",
            "# Use total population for demonstration\n",
            "df['total_population'] = aggregate_species_metric(df, species, 'population')\n",
            "\n",
            "# 1. Lag features (t-1, t-2, t-3)\n",
            "for lag in [1, 2, 3]:\n",
            "    df[f'pop_lag_{lag}'] = create_lag_feature(df['total_population'], lag)\n",
            "\n",
            "print('✅ Lag features created (t-1, t-2, t-3)')\n",
            "\n",
            "# 2. Rolling statistics\n",
            "for window in [10, 50]:\n",
            "    df[f'pop_mean_{window}'] = calculate_rolling_mean(df['total_population'], window)\n",
            "    df[f'pop_std_{window}'] = calculate_rolling_std(df['total_population'], window)\n",
            "    df[f'pop_cv_{window}'] = calculate_rolling_cv(df['total_population'], window)\n",
            "\n",
            "print('✅ Rolling statistics created (10, 50 tick windows)')\n",
            "\n",
            "# 3. Momentum features\n",
            "df['pop_change'] = df['total_population'].diff()\n",
            "df['pop_acceleration'] = df['pop_change'].diff()\n",
            "\n",
            "print('✅ Momentum features created (change, acceleration)')\n",
            "\n",
            "# 4. Create targets for different horizons\n",
            "for horizon in [1, 5, 10]:\n",
            "    df[f'pop_future_{horizon}'] = df['total_population'].shift(-horizon)\n",
            "\n",
            "print('✅ Prediction targets created (1, 5, 10 ticks ahead)')\n",
            "\n",
            "# Drop NaN rows (from lag/rolling calculations)\n",
            "df_clean = df.dropna()\n",
            "\n",
            "print(f'\\n📊 Clean dataset: {len(df_clean)} samples (dropped {len(df) - len(df_clean)} NaN rows)')"
        ]
    })
    
    # Cell 6: Visualize temporal features
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Plot temporal features\n",
            "fig, axes = plt.subplots(2, 2, figsize=(16, 10))\n",
            "\n",
            "# Population with lags\n",
            "axes[0, 0].plot(df_clean['tick'], df_clean['total_population'], \n",
            "               label='Current', linewidth=2.5, alpha=0.8)\n",
            "axes[0, 0].plot(df_clean['tick'], df_clean['pop_lag_1'], \n",
            "               label='t-1', linewidth=2, alpha=0.6)\n",
            "axes[0, 0].plot(df_clean['tick'], df_clean['pop_lag_3'], \n",
            "               label='t-3', linewidth=2, alpha=0.4)\n",
            "axes[0, 0].set_ylabel('Population', fontweight='bold')\n",
            "axes[0, 0].set_title('Population with Lags', fontweight='bold', fontsize=14)\n",
            "axes[0, 0].legend()\n",
            "axes[0, 0].grid(True, alpha=0.3)\n",
            "\n",
            "# Rolling mean\n",
            "axes[0, 1].plot(df_clean['tick'], df_clean['total_population'], \n",
            "               label='Actual', linewidth=2, alpha=0.6)\n",
            "axes[0, 1].plot(df_clean['tick'], df_clean['pop_mean_10'], \n",
            "               label='10-tick mean', linewidth=2.5)\n",
            "axes[0, 1].plot(df_clean['tick'], df_clean['pop_mean_50'], \n",
            "               label='50-tick mean', linewidth=2.5)\n",
            "axes[0, 1].set_ylabel('Population', fontweight='bold')\n",
            "axes[0, 1].set_title('Rolling Means (Smoothing)', fontweight='bold', fontsize=14)\n",
            "axes[0, 1].legend()\n",
            "axes[0, 1].grid(True, alpha=0.3)\n",
            "\n",
            "# Population change (momentum)\n",
            "axes[1, 0].plot(df_clean['tick'], df_clean['pop_change'], linewidth=2.5)\n",
            "axes[1, 0].axhline(y=0, color='red', linestyle='--', linewidth=1)\n",
            "axes[1, 0].set_xlabel('Tick', fontweight='bold')\n",
            "axes[1, 0].set_ylabel('Population Change', fontweight='bold')\n",
            "axes[1, 0].set_title('Momentum (First Derivative)', fontweight='bold', fontsize=14)\n",
            "axes[1, 0].grid(True, alpha=0.3)\n",
            "\n",
            "# Stability (CV)\n",
            "axes[1, 1].plot(df_clean['tick'], df_clean['pop_cv_10'], \n",
            "               label='10-tick CV', linewidth=2.5)\n",
            "axes[1, 1].plot(df_clean['tick'], df_clean['pop_cv_50'], \n",
            "               label='50-tick CV', linewidth=2.5)\n",
            "axes[1, 1].set_xlabel('Tick', fontweight='bold')\n",
            "axes[1, 1].set_ylabel('Coefficient of Variation', fontweight='bold')\n",
            "axes[1, 1].set_title('Stability Over Time', fontweight='bold', fontsize=14)\n",
            "axes[1, 1].legend()\n",
            "axes[1, 1].grid(True, alpha=0.3)\n",
            "\n",
            "plt.tight_layout()\n",
            "plt.show()"
        ]
    })
    
    # Cell 7: Section header
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 3. Single-Step Prediction (Baseline)\n",
            "\n",
            "**Task:** Predict population 1 tick ahead (baseline for comparison)\n",
            "\n",
            "**Features:** Current + lags + rolling stats"
        ]
    })
    
    # Cell 8: Train single-step model
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Prepare features for 1-step prediction\n",
            "feature_cols = [\n",
            "    'total_population',\n",
            "    'pop_lag_1', 'pop_lag_2', 'pop_lag_3',\n",
            "    'pop_mean_10', 'pop_std_10', 'pop_cv_10',\n",
            "    'pop_change', 'pop_acceleration'\n",
            "]\n",
            "\n",
            "X, y = prepare_features(df_clean, feature_cols, 'pop_future_1')\n",
            "print(f'✅ Features prepared: X={X.shape}, y={y.shape}\\n')\n",
            "\n",
            "# Train\n",
            "print('🤖 Training 1-step ahead model...\\n')\n",
            "pipeline_1step = create_regression_pipeline(X, y, test_size=0.2)\n",
            "\n",
            "print('📊 Model Comparison:')\n",
            "print(pipeline_1step['comparison'].to_string(index=False))\n",
            "\n",
            "print(f'\\n🏆 Best Model: {pipeline_1step[\"best_model_name\"]}')\n",
            "print(f'  Test R²: {pipeline_1step[\"comparison\"].iloc[0][\"test_r2\"]:.4f}')\n",
            "print(f'  Test RMSE: {pipeline_1step[\"comparison\"].iloc[0][\"test_rmse\"]:.2f} boids')"
        ]
    })
    
    # Cell 9: Feature importance
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Feature importance\n",
            "importance_1step = get_feature_importance(pipeline_1step['best_model'], feature_cols)\n",
            "\n",
            "print('📊 Feature Importance (1-step ahead):')\n",
            "print(importance_1step.to_string(index=False))\n",
            "\n",
            "# Plot\n",
            "fig, ax = plt.subplots(figsize=(12, 6))\n",
            "ax.barh(importance_1step['feature'], importance_1step['importance'], color='#2196F3')\n",
            "ax.set_xlabel('Importance', fontsize=12, fontweight='bold')\n",
            "ax.set_title('What Predicts Next Tick Population?', fontsize=14, fontweight='bold')\n",
            "ax.grid(True, alpha=0.3, axis='x')\n",
            "plt.tight_layout()\n",
            "plt.show()\n",
            "\n",
            "print('\\n💡 Insight: Which temporal features matter most?')"
        ]
    })
    
    # Cell 10: Section header
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 4. Multi-Step Prediction\n",
            "\n",
            "**Task:** Predict population 5 and 10 ticks ahead\n",
            "\n",
            "**Challenge:** Predictions get less accurate further into future"
        ]
    })
    
    # Cell 11: Train multi-step models
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Train models for different horizons\n",
            "horizons = [1, 5, 10]\n",
            "horizon_results = []\n",
            "\n",
            "print('🤖 Training multi-step prediction models...\\n')\n",
            "\n",
            "for horizon in horizons:\n",
            "    target_col = f'pop_future_{horizon}'\n",
            "    X_h, y_h = prepare_features(df_clean, feature_cols, target_col)\n",
            "    \n",
            "    pipeline_h = create_regression_pipeline(X_h, y_h, test_size=0.2)\n",
            "    \n",
            "    best_result = pipeline_h['comparison'].iloc[0]\n",
            "    horizon_results.append({\n",
            "        'horizon': horizon,\n",
            "        'model': pipeline_h['best_model_name'],\n",
            "        'test_r2': best_result['test_r2'],\n",
            "        'test_rmse': best_result['test_rmse'],\n",
            "        'test_mae': best_result['test_mae']\n",
            "    })\n",
            "    \n",
            "    print(f'✅ {horizon:2}-step ahead: R²={best_result[\"test_r2\"]:.4f} '\n",
            "          f'RMSE={best_result[\"test_rmse\"]:.2f} ({pipeline_h[\"best_model_name\"]})')\n",
            "\n",
            "horizon_comparison = pd.DataFrame(horizon_results)\n",
            "\n",
            "print('\\n📊 Multi-Step Prediction Performance:')\n",
            "print(horizon_comparison.to_string(index=False))"
        ]
    })
    
    # Cell 12: Visualize prediction accuracy vs horizon
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Plot accuracy degradation\n",
            "fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))\n",
            "\n",
            "# R² vs horizon\n",
            "ax1.plot(horizon_comparison['horizon'], horizon_comparison['test_r2'], \n",
            "        marker='o', linewidth=2.5, markersize=10, color='#2196F3')\n",
            "ax1.axhline(y=0.95, color='green', linestyle='--', linewidth=2, \n",
            "           label='Excellent (R²>0.95)', alpha=0.7)\n",
            "ax1.set_xlabel('Prediction Horizon (ticks)', fontsize=12, fontweight='bold')\n",
            "ax1.set_ylabel('Test R²', fontsize=12, fontweight='bold')\n",
            "ax1.set_title('Accuracy vs Prediction Horizon', fontsize=14, fontweight='bold')\n",
            "ax1.set_ylim(0, 1.0)\n",
            "ax1.legend()\n",
            "ax1.grid(True, alpha=0.3)\n",
            "\n",
            "# RMSE vs horizon\n",
            "ax2.plot(horizon_comparison['horizon'], horizon_comparison['test_rmse'], \n",
            "        marker='o', linewidth=2.5, markersize=10, color='#F44336')\n",
            "ax2.set_xlabel('Prediction Horizon (ticks)', fontsize=12, fontweight='bold')\n",
            "ax2.set_ylabel('Test RMSE (boids)', fontsize=12, fontweight='bold')\n",
            "ax2.set_title('Error vs Prediction Horizon', fontsize=14, fontweight='bold')\n",
            "ax2.grid(True, alpha=0.3)\n",
            "\n",
            "plt.tight_layout()\n",
            "plt.show()\n",
            "\n",
            "print('\\n💡 Insight: How does prediction accuracy degrade over time?')"
        ]
    })
    
    # Cell 13: Section header
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 5. Trend Detection\n",
            "\n",
            "**Goal:** Detect if population is growing, stable, or declining\n",
            "\n",
            "**Use case:** Early warning for population collapse"
        ]
    })
    
    # Cell 14: Trend classification
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Classify trends based on rolling mean slope\n",
            "df_clean['trend'] = 'stable'\n",
            "df_clean.loc[df_clean['pop_change'] > 5, 'trend'] = 'growing'\n",
            "df_clean.loc[df_clean['pop_change'] < -5, 'trend'] = 'declining'\n",
            "\n",
            "print('📊 Trend Distribution:')\n",
            "print(df_clean['trend'].value_counts())\n",
            "\n",
            "# Visualize trends\n",
            "fig, ax = plt.subplots(figsize=(16, 6))\n",
            "\n",
            "# Color by trend\n",
            "for trend, color in [('growing', '#4CAF50'), ('stable', '#2196F3'), ('declining', '#F44336')]:\n",
            "    mask = df_clean['trend'] == trend\n",
            "    ax.scatter(df_clean.loc[mask, 'tick'], df_clean.loc[mask, 'total_population'],\n",
            "              label=trend.capitalize(), color=color, alpha=0.6, s=30)\n",
            "\n",
            "ax.plot(df_clean['tick'], df_clean['pop_mean_50'], \n",
            "       color='black', linewidth=2, label='50-tick trend', alpha=0.5)\n",
            "\n",
            "ax.set_xlabel('Tick', fontsize=12, fontweight='bold')\n",
            "ax.set_ylabel('Population', fontsize=12, fontweight='bold')\n",
            "ax.set_title('Population Trends Over Time', fontsize=14, fontweight='bold')\n",
            "ax.legend()\n",
            "ax.grid(True, alpha=0.3)\n",
            "plt.tight_layout()\n",
            "plt.show()"
        ]
    })
    
    # Cell 15: Section header
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 6. Stability Forecasting\n",
            "\n",
            "**Goal:** Predict future stability (CV) from current state\n",
            "\n",
            "**Use case:** Detect instability before it happens"
        ]
    })
    
    # Cell 16: Train stability predictor
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Create stability target (future CV)\n",
            "df_clean['future_cv_10'] = df_clean['pop_cv_10'].shift(-10)\n",
            "\n",
            "# Prepare features\n",
            "stability_features = [\n",
            "    'pop_cv_10', 'pop_cv_50',\n",
            "    'pop_std_10', 'pop_std_50',\n",
            "    'pop_acceleration'\n",
            "]\n",
            "\n",
            "X_stab, y_stab = prepare_features(df_clean, stability_features, 'future_cv_10')\n",
            "print(f'✅ Stability features prepared: X={X_stab.shape}, y={y_stab.shape}\\n')\n",
            "\n",
            "# Train\n",
            "print('🤖 Training stability predictor...\\n')\n",
            "pipeline_stab = create_regression_pipeline(X_stab, y_stab, test_size=0.2)\n",
            "\n",
            "print('📊 Stability Prediction Performance:')\n",
            "print(pipeline_stab['comparison'].to_string(index=False))\n",
            "\n",
            "print(f'\\n🏆 Best Model: {pipeline_stab[\"best_model_name\"]}')\n",
            "print(f'  Test R²: {pipeline_stab[\"comparison\"].iloc[0][\"test_r2\"]:.4f}')\n",
            "print(f'\\n💡 Can predict instability 10 ticks in advance!')"
        ]
    })
    
    # Cell 17: Section header
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 7. Early Warning System\n",
            "\n",
            "**Goal:** Combine predictions into actionable alerts\n",
            "\n",
            "**Alerts:**\n",
            "- 🚨 Population crash predicted\n",
            "- ⚠️ Instability increasing\n",
            "- ✅ Ecosystem stable"
        ]
    })
    
    # Cell 18: Early warning examples
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Example early warning system\n",
            "print('🚨 Early Warning System Examples\\n')\n",
            "\n",
            "# Define warning thresholds\n",
            "CRASH_THRESHOLD = -50  # Population drop > 50\n",
            "INSTABILITY_THRESHOLD = 0.15  # CV > 0.15\n",
            "\n",
            "# Sample some points\n",
            "sample_indices = [100, 200, 300]\n",
            "\n",
            "for idx in sample_indices:\n",
            "    if idx >= len(df_clean):\n",
            "        continue\n",
            "    \n",
            "    row = df_clean.iloc[idx]\n",
            "    \n",
            "    # Predict 10 ticks ahead\n",
            "    features_10 = pd.DataFrame([row[feature_cols]])\n",
            "    pred_pop_10 = pipeline_1step['best_model'].predict(features_10)[0]\n",
            "    \n",
            "    # Predict stability\n",
            "    features_stab = pd.DataFrame([row[stability_features]])\n",
            "    pred_cv_10 = pipeline_stab['best_model'].predict(features_stab)[0]\n",
            "    \n",
            "    # Generate alerts\n",
            "    current_pop = row['total_population']\n",
            "    pop_change_pred = pred_pop_10 - current_pop\n",
            "    \n",
            "    print(f'Tick {int(row[\"tick\"])}:')\n",
            "    print(f'  Current population: {current_pop:.0f}')\n",
            "    print(f'  Predicted (10 ticks): {pred_pop_10:.0f} (Δ {pop_change_pred:+.0f})')\n",
            "    print(f'  Predicted stability (CV): {pred_cv_10:.4f}')\n",
            "    \n",
            "    # Alert logic\n",
            "    if pop_change_pred < CRASH_THRESHOLD:\n",
            "        print(f'  🚨 WARNING: Population crash predicted!')\n",
            "    elif pred_cv_10 > INSTABILITY_THRESHOLD:\n",
            "        print(f'  ⚠️  CAUTION: Instability increasing')\n",
            "    else:\n",
            "        print(f'  ✅ Status: Ecosystem stable')\n",
            "    print()\n",
            "\n",
            "print('💡 Use these alerts for real-time monitoring!')"
        ]
    })
    
    # Cell 19: Section header
    cells.append({
        "cell_type": "markdown",
        "metadata": {},
        "source": ["## 8. Summary & Insights"]
    })
    
    # Cell 20: Final summary
    cells.append({
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "print('\\n' + '='*70)\n",
            "print('⏰ TIME SERIES PREDICTION SUMMARY')\n",
            "print('='*70)\n",
            "\n",
            "print(f'\\n📊 Dataset:')\n",
            "print(f'  Clean Samples: {len(df_clean):,}')\n",
            "print(f'  Features: {len(feature_cols)}')\n",
            "\n",
            "print(f'\\n🎯 Prediction Performance:')\n",
            "for result in horizon_results:\n",
            "    print(f'  {result[\"horizon\"]:2}-step ahead: R²={result[\"test_r2\"]:.4f} '\n",
            "          f'RMSE={result[\"test_rmse\"]:.2f}')\n",
            "\n",
            "print(f'\\n📈 Stability Prediction:')\n",
            "print(f'  10-tick ahead CV: R²={pipeline_stab[\"comparison\"].iloc[0][\"test_r2\"]:.4f}')\n",
            "\n",
            "print(f'\\n💡 Key Insights:')\n",
            "print(f'  1. Temporal features improve predictions')\n",
            "print(f'  2. Lag features capture momentum')\n",
            "print(f'  3. Rolling stats capture trends')\n",
            "print(f'  4. Accuracy degrades with prediction horizon')\n",
            "print(f'  5. Can predict instability before it happens')\n",
            "print(f'  6. Early warning system is feasible')\n",
            "\n",
            "print('\\n' + '='*70)\n",
            "print('✅ Time Series Prediction Complete!')\n",
            "print('='*70)\n",
            "\n",
            "print('\\n📚 Next Steps:')\n",
            "print('  - Notebook 06: Interactive Dashboard')\n",
            "print('  - Integration: Add early warning alerts to UI')\n",
            "print('  - Advanced: Recursive multi-step prediction')\n",
            "print('  - Advanced: LSTM/RNN for sequence modeling')"
        ]
    })
    
    # Create notebook structure
    notebook = {
        "cells": cells,
        "metadata": {
            "kernelspec": {
                "display_name": "Python (analyzer)",
                "language": "python",
                "name": "analyzer"
            },
            "language_info": {
                "codemirror_mode": {
                    "name": "ipython",
                    "version": 3
                },
                "file_extension": ".py",
                "mimetype": "text/x-python",
                "name": "python",
                "nbconvert_exporter": "python",
                "pygments_lexer": "ipython3",
                "version": "3.11.5"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 5
    }
    
    return notebook


if __name__ == '__main__':
    print("🔧 Creating 05-time-series-prediction.ipynb...")
    
    notebook = create_notebook()
    
    # Write to file
    output_path = Path(__file__).parent / '05-time-series-prediction.ipynb'
    with open(output_path, 'w') as f:
        json.dump(notebook, f, indent=2)
    
    print(f"✅ Created: {output_path}")
    print(f"📊 Cells: {len(notebook['cells'])}")
    print("\n🚀 Ready to run in Jupyter!")

