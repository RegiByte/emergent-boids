# Analyzer Source Code

This directory contains the source code for the Emergent Boids ecosystem analyzer.

## Structure

```
src/
├── analyzer/          # Evolution analysis tools
│   └── evolution_analyzer.py
├── ml/                # Machine learning modules
│   ├── data_loader.py          # Data loading utilities
│   ├── feature_engineering.py  # Feature calculation
│   ├── stability_metrics.py    # Ecosystem stability metrics
│   └── models.py               # ML model training & evaluation
└── notebooks/         # Jupyter notebooks for analysis
    ├── 00-env-check.ipynb
    ├── 01-data-analysis.ipynb
    ├── 02-model-training.ipynb
    ├── 03-multi-species-training.ipynb
    ├── 04-death-cause-prediction.ipynb
    └── 05-time-series-prediction.ipynb
```

## Usage in Notebooks

All notebooks are configured to import from the `src` package:

```python
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path.cwd().parent.parent))

# Import ML modules
from src.ml import (
    load_evolution_csv,
    detect_species_from_columns,
    calculate_birth_rate,
    # ... other functions
)
```

## Available Modules

### `src.ml` - Machine Learning & Analysis

**Data Loading:**
- `load_evolution_csv()` - Load evolution CSV data
- `detect_species_from_columns()` - Detect species from column names
- `partition_species_by_role()` - Separate prey/predators
- `extract_death_causes()` - Extract death cause data

**Feature Engineering:**
- `calculate_birth_rate()` - Calculate birth rates
- `calculate_death_rate()` - Calculate death rates
- `calculate_growth_rate()` - Calculate population growth
- `calculate_species_dominance()` - Calculate species dominance
- `normalize_z_score()` - Z-score normalization

**Stability Metrics:**
- `calculate_ecosystem_stability()` - Overall ecosystem stability
- `calculate_biodiversity_index()` - Biodiversity measurement
- `classify_population_dynamics()` - Classify population patterns
- `generate_stability_report()` - Comprehensive stability report

**ML Models:**
- `create_regression_pipeline()` - Create regression model
- `create_classification_pipeline()` - Create classification model
- `get_feature_importance()` - Extract feature importance
- `compare_regression_models()` - Compare multiple models

### `src.analyzer` - Evolution Analysis

Tools for analyzing evolution data and generating reports.

## Philosophy

Everything is information processing. Simple rules compose. Emergence is reliable.

