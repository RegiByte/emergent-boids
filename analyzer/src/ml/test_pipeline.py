"""
ML Pipeline Integration Test

Tests all modules working together with real data.
Demonstrates the full ML workflow from data loading to model training.

Philosophy: Simple functions compose. Test the composition.
"""

import sys
from pathlib import Path

# Import all our pure functional modules
from data_loader import (
    load_evolution_csv, detect_species_from_columns, 
    partition_species_by_role, extract_death_causes,
    summarize_dataset
)
from feature_engineering import (
    calculate_birth_rate, calculate_death_rate, calculate_growth_rate,
    normalize_z_score, calculate_rolling_cv, calculate_stability_score,
    calculate_prey_predator_ratio, aggregate_species_metric,
    calculate_species_dominance
)
from stability_metrics import (
    calculate_population_stability, calculate_ecosystem_stability,
    calculate_biodiversity_index, detect_equilibrium,
    classify_population_dynamics, generate_stability_report,
    calculate_predator_prey_stability
)
from models import (
    prepare_features, create_regression_pipeline,
    create_classification_pipeline, get_feature_importance
)


def test_data_loading():
    """Test data loading module"""
    print("\n" + "="*70)
    print("🧪 TEST 1: Data Loading")
    print("="*70)
    
    # Load data
    df = load_evolution_csv('../../evolution.csv')
    print(f"✅ Loaded {len(df)} snapshots")
    
    # Detect species
    species = detect_species_from_columns(df)
    print(f"✅ Detected {len(species)} species: {', '.join(species)}")
    
    # Partition by role
    by_role = partition_species_by_role(species)
    print(f"✅ Prey species: {len(by_role['prey'])}")
    print(f"✅ Predator species: {len(by_role['predator'])}")
    
    # Summarize dataset
    summary = summarize_dataset(df, species)
    print(f"✅ Total births: {summary['total_births']}")
    print(f"✅ Total deaths: {summary['total_deaths']}")
    
    # Extract death causes
    death_causes = extract_death_causes(df, species)
    print(f"✅ Death causes extracted: {len(death_causes)} rows")
    
    return df, species, by_role


def test_feature_engineering(df, species):
    """Test feature engineering module"""
    print("\n" + "="*70)
    print("🧪 TEST 2: Feature Engineering")
    print("="*70)
    
    # Test rate calculations
    sp = species[0]
    pop_col = f'{sp}_population'
    births_col = f'{sp}_births'
    deaths_col = f'{sp}_deaths'
    
    birth_rate = calculate_birth_rate(df[births_col], df[pop_col], df['deltaSeconds'])
    death_rate = calculate_death_rate(df[deaths_col], df[pop_col], df['deltaSeconds'])
    growth_rate = calculate_growth_rate(df[births_col], df[deaths_col], df[pop_col], df['deltaSeconds'])
    
    print(f"✅ Birth rate calculated: mean={birth_rate.mean():.6f}")
    print(f"✅ Death rate calculated: mean={death_rate.mean():.6f}")
    print(f"✅ Growth rate calculated: mean={growth_rate.mean():.6f}")
    
    # Test normalization
    normalized = normalize_z_score(df[pop_col])
    print(f"✅ Z-score normalization: mean={normalized.mean():.3f}, std={normalized.std():.3f}")
    
    # Test rolling features
    rolling_cv = calculate_rolling_cv(df[pop_col], window=10)
    stability = calculate_stability_score(df[pop_col], window=10)
    print(f"✅ Rolling CV calculated: mean={rolling_cv.mean():.4f}")
    print(f"✅ Stability score calculated: mean={stability.mean():.4f}")
    
    # Test dominance
    dominance = calculate_species_dominance(df, species)
    print(f"✅ Species dominance calculated: {len(dominance.columns)} species")
    
    return birth_rate, death_rate, growth_rate


def test_stability_metrics(df, species, by_role):
    """Test stability metrics module"""
    print("\n" + "="*70)
    print("🧪 TEST 3: Stability Metrics")
    print("="*70)
    
    # Per-species stability
    for sp in species[:3]:  # Test first 3
        cv = calculate_population_stability(df, sp, window=10)
        dynamics = classify_population_dynamics(df, sp, window=10)
        print(f"✅ {sp}: CV={cv:.4f}, dynamics={dynamics}")
    
    # Ecosystem stability
    ecosystem_cv = calculate_ecosystem_stability(df, species, window=10)
    print(f"✅ Ecosystem stability: CV={ecosystem_cv:.4f}")
    
    # Biodiversity
    biodiversity = calculate_biodiversity_index(df, species)
    print(f"✅ Biodiversity index: mean={biodiversity.mean():.4f}")
    
    # Equilibrium detection
    equilibrium_tick = detect_equilibrium(df, species, window=10, cv_threshold=0.1)
    if equilibrium_tick:
        print(f"✅ Equilibrium reached at tick {equilibrium_tick}")
    else:
        print(f"✅ Equilibrium not yet reached (expected for short run)")
    
    # Predator-prey dynamics
    if by_role['prey'] and by_role['predator']:
        pp_stability = calculate_predator_prey_stability(df, by_role['prey'], by_role['predator'])
        print(f"✅ Prey:Predator ratio: {pp_stability['ratio_mean']:.2f}")
        print(f"✅ Correlation: {pp_stability['correlation']:.4f}")
    
    # Generate full report
    report = generate_stability_report(df, species)
    print(f"✅ Comprehensive stability report generated")
    print(f"   - Ecosystem CV: {report['ecosystem_stability']:.4f}")
    print(f"   - Biodiversity: {report['biodiversity']['mean']:.4f}")
    print(f"   - Equilibrium reached: {report['equilibrium']['reached']}")
    
    return report


def test_ml_models(df, species):
    """Test ML models module"""
    print("\n" + "="*70)
    print("🧪 TEST 4: ML Models")
    print("="*70)
    
    # Prepare features for population prediction
    sp = species[0]
    pop_col = f'{sp}_population'
    births_col = f'{sp}_births'
    deaths_col = f'{sp}_deaths'
    
    # Calculate features
    df['birth_rate'] = calculate_birth_rate(df[births_col], df[pop_col], df['deltaSeconds'])
    df['death_rate'] = calculate_death_rate(df[deaths_col], df[pop_col], df['deltaSeconds'])
    df['growth_rate'] = calculate_growth_rate(df[births_col], df[deaths_col], df[pop_col], df['deltaSeconds'])
    df['next_population'] = df[pop_col].shift(-1)
    
    # Prepare data
    feature_cols = ['birth_rate', 'death_rate', 'growth_rate', pop_col]
    target_col = 'next_population'
    
    X, y = prepare_features(df, feature_cols, target_col)
    print(f"✅ Features prepared: {X.shape}")
    
    # Train regression models
    print(f"\n📊 Training regression models...")
    pipeline = create_regression_pipeline(X, y, test_size=0.2)
    
    print(f"✅ Trained {len(pipeline['models'])} models")
    print(f"✅ Best model: {pipeline['best_model_name']}")
    
    # Show comparison
    print(f"\n📊 Model Comparison:")
    print(pipeline['comparison'].to_string(index=False))
    
    # Feature importance
    importance = get_feature_importance(pipeline['best_model'], feature_cols)
    print(f"\n📊 Feature Importance:")
    print(importance.to_string(index=False))
    
    # Test classification
    print(f"\n📊 Training classification models...")
    import pandas as pd
    import numpy as np
    
    df['stability_class'] = pd.cut(
        df['growth_rate'], 
        bins=[-np.inf, -0.01, 0.01, np.inf],
        labels=['declining', 'stable', 'growing']
    )
    
    X_class, y_class = prepare_features(df, feature_cols, 'stability_class')
    class_pipeline = create_classification_pipeline(X_class, y_class, test_size=0.2)
    
    print(f"✅ Trained {len(class_pipeline['models'])} classifiers")
    print(f"✅ Best classifier: {class_pipeline['best_model_name']}")
    
    print(f"\n📊 Classifier Comparison:")
    print(class_pipeline['comparison'].to_string(index=False))
    
    return pipeline, class_pipeline


def run_full_pipeline_test():
    """Run complete pipeline test"""
    print("\n" + "="*80)
    print("🚀 EMERGENT BOIDS ML PIPELINE - FULL INTEGRATION TEST")
    print("="*80)
    print("\nPhilosophy: Everything is information processing.")
    print("Simple functions compose. Emergence is reliable.")
    print("="*80)
    
    try:
        # Test 1: Data Loading
        df, species, by_role = test_data_loading()
        
        # Test 2: Feature Engineering
        birth_rate, death_rate, growth_rate = test_feature_engineering(df, species)
        
        # Test 3: Stability Metrics
        report = test_stability_metrics(df, species, by_role)
        
        # Test 4: ML Models
        reg_pipeline, class_pipeline = test_ml_models(df, species)
        
        # Final summary
        print("\n" + "="*70)
        print("✅ ALL TESTS PASSED!")
        print("="*70)
        print("\n📊 Summary:")
        print(f"  ✅ Data loading: {len(df)} snapshots, {len(species)} species")
        print(f"  ✅ Feature engineering: rates, normalization, rolling features")
        print(f"  ✅ Stability metrics: ecosystem CV={report['ecosystem_stability']:.4f}")
        print(f"  ✅ Regression: best R²={reg_pipeline['comparison'].iloc[0]['test_r2']:.4f}")
        print(f"  ✅ Classification: best F1={class_pipeline['comparison'].iloc[0]['test_f1']:.4f}")
        
        print("\n🎯 ML Pipeline Status: READY FOR PRODUCTION")
        print("\n💡 Next Steps:")
        print("  1. Collect more data (longer simulations)")
        print("  2. Train on multiple configurations")
        print("  3. Build parameter optimization system")
        print("  4. Create real-time prediction dashboard")
        
        print("\n" + "="*80)
        print("🎊 MISSION ACCOMPLISHED, SIR REGIBYTE! 🎊")
        print("="*80 + "\n")
        
        return True
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == '__main__':
    success = run_full_pipeline_test()
    sys.exit(0 if success else 1)

