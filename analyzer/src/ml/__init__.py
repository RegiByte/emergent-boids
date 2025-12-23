"""Machine learning module for ecosystem analysis."""

# Data loading
from .data_loader import (
    load_evolution_csv,
    load_stats_json,
    detect_species_from_columns,
    partition_species_by_role,
    extract_death_causes,
    extract_species_timeseries,
    extract_all_populations,
    summarize_dataset,
)

# Feature engineering
from .feature_engineering import (
    calculate_birth_rate,
    calculate_death_rate,
    calculate_growth_rate,
    calculate_rolling_cv,
    calculate_rolling_mean,
    calculate_rolling_std,
    calculate_species_dominance,
    calculate_prey_predator_ratio,
    aggregate_species_metric,
    normalize_z_score,
    normalize_min_max,
    create_lag_feature,
)

# Stability metrics
from .stability_metrics import (
    calculate_ecosystem_stability,
    calculate_biodiversity_index,
    classify_population_dynamics,
    generate_stability_report,
    calculate_population_stability,
    detect_extinction_risk,
)

# ML models
from .models import (
    prepare_features,
    create_regression_pipeline,
    create_classification_pipeline,
    get_feature_importance,
    compare_regression_models,
    compare_classification_models,
    evaluate_regression,
    evaluate_classification,
)

__all__ = [
    # Data loading
    'load_evolution_csv',
    'load_stats_json',
    'detect_species_from_columns',
    'partition_species_by_role',
    'extract_death_causes',
    'extract_species_timeseries',
    'extract_all_populations',
    'summarize_dataset',
    # Feature engineering
    'calculate_birth_rate',
    'calculate_death_rate',
    'calculate_growth_rate',
    'calculate_rolling_cv',
    'calculate_rolling_mean',
    'calculate_rolling_std',
    'calculate_species_dominance',
    'calculate_prey_predator_ratio',
    'aggregate_species_metric',
    'normalize_z_score',
    'normalize_min_max',
    'create_lag_feature',
    # Stability metrics
    'calculate_ecosystem_stability',
    'calculate_biodiversity_index',
    'classify_population_dynamics',
    'generate_stability_report',
    'calculate_population_stability',
    'detect_extinction_risk',
    # ML models
    'prepare_features',
    'create_regression_pipeline',
    'create_classification_pipeline',
    'get_feature_importance',
    'compare_regression_models',
    'compare_classification_models',
    'evaluate_regression',
    'evaluate_classification',
]

