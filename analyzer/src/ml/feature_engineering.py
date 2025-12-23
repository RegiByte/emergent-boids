"""
Feature Engineering Module - Pure functional feature transformations

Philosophy: Simple functions compose. Each transformation is pure.
No classes, just functions that transform data.
"""

from typing import Dict, List, Tuple
import pandas as pd
import numpy as np


# ============================================
# Rate Calculations (Pure Functions)
# ============================================

def calculate_birth_rate(births: pd.Series, population: pd.Series, 
                         delta_seconds: pd.Series) -> pd.Series:
    """
    Calculate birth rate per capita per second
    
    birth_rate = births / (population * delta_seconds)
    Returns NaN where population is 0.
    """
    denominator = population * delta_seconds
    return births / denominator.replace(0, float('nan'))


def calculate_death_rate(deaths: pd.Series, population: pd.Series, 
                        delta_seconds: pd.Series) -> pd.Series:
    """
    Calculate death rate per capita per second
    
    death_rate = deaths / (population * delta_seconds)
    Returns NaN where population is 0.
    """
    denominator = population * delta_seconds
    return deaths / denominator.replace(0, float('nan'))


def calculate_growth_rate(births: pd.Series, deaths: pd.Series, 
                         population: pd.Series, delta_seconds: pd.Series) -> pd.Series:
    """
    Calculate net growth rate per capita per second
    
    growth_rate = (births - deaths) / (population * delta_seconds)
    Returns NaN where population is 0.
    """
    net_change = births - deaths
    denominator = population * delta_seconds
    return net_change / denominator.replace(0, float('nan'))


def calculate_population_change_pct(population: pd.Series) -> pd.Series:
    """
    Calculate percentage change in population from previous tick
    
    Returns Series with first value as NaN.
    """
    return population.pct_change() * 100


# ============================================
# Normalization Functions
# ============================================

def normalize_min_max(series: pd.Series, 
                      feature_range: Tuple[float, float] = (0, 1)) -> pd.Series:
    """
    Min-max normalization to specified range
    
    Scales values to [min, max] range.
    Returns original series if all values are equal.
    """
    min_val = series.min()
    max_val = series.max()
    
    if min_val == max_val:
        # All values are the same, return midpoint of range
        return pd.Series([np.mean(feature_range)] * len(series), index=series.index)
    
    # Scale to [0, 1] then to feature_range
    normalized = (series - min_val) / (max_val - min_val)
    range_min, range_max = feature_range
    return normalized * (range_max - range_min) + range_min


def normalize_z_score(series: pd.Series) -> pd.Series:
    """
    Z-score normalization (standardization)
    
    Transforms to mean=0, std=1.
    Returns zeros if std is 0.
    """
    mean = series.mean()
    std = series.std()
    
    if std == 0:
        return pd.Series([0] * len(series), index=series.index)
    
    return (series - mean) / std


def normalize_log(series: pd.Series, offset: float = 1.0) -> pd.Series:
    """
    Log normalization for skewed distributions
    
    Applies log(x + offset) transformation.
    Useful for population counts that vary by orders of magnitude.
    """
    return np.log(series + offset)


# ============================================
# Rolling Window Features
# ============================================

def calculate_rolling_mean(series: pd.Series, window: int) -> pd.Series:
    """Calculate rolling mean over window"""
    return series.rolling(window, min_periods=1).mean()


def calculate_rolling_std(series: pd.Series, window: int) -> pd.Series:
    """Calculate rolling standard deviation over window"""
    return series.rolling(window, min_periods=1).std()


def calculate_rolling_cv(series: pd.Series, window: int) -> pd.Series:
    """
    Calculate rolling coefficient of variation (CV)
    
    CV = std / mean
    Lower CV = more stable
    """
    rolling_mean = calculate_rolling_mean(series, window)
    rolling_std = calculate_rolling_std(series, window)
    return rolling_std / rolling_mean.replace(0, float('nan'))


def calculate_rolling_min(series: pd.Series, window: int) -> pd.Series:
    """Calculate rolling minimum over window"""
    return series.rolling(window, min_periods=1).min()


def calculate_rolling_max(series: pd.Series, window: int) -> pd.Series:
    """Calculate rolling maximum over window"""
    return series.rolling(window, min_periods=1).max()


# ============================================
# Lag Features (Time-shifted)
# ============================================

def create_lag_feature(series: pd.Series, lag: int) -> pd.Series:
    """
    Create lagged version of series
    
    lag=1 means previous value, lag=2 means 2 ticks ago, etc.
    """
    return series.shift(lag)


def create_multiple_lags(series: pd.Series, lags: List[int]) -> pd.DataFrame:
    """
    Create multiple lag features
    
    Returns DataFrame with columns: lag_1, lag_2, lag_3, etc.
    """
    result = pd.DataFrame(index=series.index)
    for lag in lags:
        result[f'lag_{lag}'] = create_lag_feature(series, lag)
    return result


# ============================================
# Ratio Features
# ============================================

def calculate_ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    """
    Calculate ratio, handling division by zero
    
    Returns NaN where denominator is 0.
    """
    return numerator / denominator.replace(0, float('nan'))


def calculate_prey_predator_ratio(prey_pop: pd.Series, 
                                  predator_pop: pd.Series) -> pd.Series:
    """Calculate prey:predator ratio"""
    return calculate_ratio(prey_pop, predator_pop)


def calculate_birth_death_ratio(births: pd.Series, deaths: pd.Series) -> pd.Series:
    """
    Calculate birth:death ratio
    
    Ratio > 1 means population growing
    Ratio < 1 means population declining
    """
    return calculate_ratio(births, deaths)


# ============================================
# Stability Metrics
# ============================================

def calculate_stability_score(population: pd.Series, window: int = 10) -> pd.Series:
    """
    Calculate stability score (inverse of CV)
    
    Higher score = more stable
    Score in range [0, 1] where 1 is perfectly stable
    """
    cv = calculate_rolling_cv(population, window)
    # Invert CV and clip to [0, 1]
    stability = 1 / (1 + cv)
    return stability.clip(0, 1)


def detect_oscillation(series: pd.Series, window: int = 10) -> pd.Series:
    """
    Detect oscillating behavior
    
    Returns 1 where oscillating, 0 where stable.
    Oscillation = high frequency of sign changes in derivative.
    """
    # Calculate derivative (difference)
    derivative = series.diff()
    
    # Count sign changes in rolling window
    sign_changes = (derivative.shift(1) * derivative < 0).astype(int)
    oscillation_count = sign_changes.rolling(window, min_periods=1).sum()
    
    # Normalize to [0, 1]
    return (oscillation_count / window).clip(0, 1)


def calculate_volatility(series: pd.Series, window: int = 10) -> pd.Series:
    """
    Calculate volatility (rolling standard deviation of returns)
    
    Higher volatility = more unstable
    """
    returns = series.pct_change()
    return calculate_rolling_std(returns, window)


# ============================================
# Categorical Encoding
# ============================================

def one_hot_encode(series: pd.Series) -> pd.DataFrame:
    """
    One-hot encode categorical series
    
    Returns DataFrame with binary columns for each category.
    """
    return pd.get_dummies(series, prefix=series.name)


def label_encode(series: pd.Series) -> Tuple[pd.Series, Dict[str, int]]:
    """
    Label encode categorical series
    
    Returns (encoded_series, mapping_dict)
    """
    unique_values = sorted(series.unique())
    mapping = {val: idx for idx, val in enumerate(unique_values)}
    encoded = series.map(mapping)
    return encoded, mapping


# ============================================
# Feature Interaction
# ============================================

def create_interaction_feature(feature1: pd.Series, feature2: pd.Series) -> pd.Series:
    """
    Create interaction feature (product of two features)
    
    Captures non-linear relationships.
    """
    return feature1 * feature2


def create_polynomial_features(series: pd.Series, degree: int = 2) -> pd.DataFrame:
    """
    Create polynomial features up to specified degree
    
    Returns DataFrame with columns: x, x^2, x^3, etc.
    """
    result = pd.DataFrame(index=series.index)
    for d in range(1, degree + 1):
        result[f'{series.name}_pow_{d}'] = series ** d
    return result


# ============================================
# Aggregation Helpers
# ============================================

def aggregate_species_metric(df: pd.DataFrame, species: List[str], 
                             metric: str) -> pd.Series:
    """
    Aggregate metric across all species
    
    Example: aggregate_species_metric(df, ['prey1', 'prey2'], 'population')
    Returns total population across all prey species.
    """
    cols = [f'{sp}_{metric}' for sp in species]
    available_cols = [col for col in cols if col in df.columns]
    return df[available_cols].sum(axis=1)


def calculate_species_dominance(df: pd.DataFrame, species: List[str]) -> pd.DataFrame:
    """
    Calculate dominance (percentage) of each species
    
    Returns DataFrame with dominance percentages for each species.
    """
    result = pd.DataFrame(index=df.index)
    pop_cols = [f'{sp}_population' for sp in species]
    available_cols = [col for col in pop_cols if col in df.columns]
    
    total_pop = df[available_cols].sum(axis=1)
    
    for sp in species:
        pop_col = f'{sp}_population'
        if pop_col in df.columns:
            result[f'{sp}_dominance'] = (df[pop_col] / total_pop.replace(0, float('nan'))) * 100
    
    return result


# ============================================
# Composition Helpers
# ============================================

def apply_to_all_species(df: pd.DataFrame, species: List[str], 
                        metric: str, func, **kwargs) -> pd.DataFrame:
    """
    Apply function to metric for all species
    
    Example: apply_to_all_species(df, species, 'population', normalize_z_score)
    Returns DataFrame with normalized populations for all species.
    """
    result = pd.DataFrame(index=df.index)
    for sp in species:
        col_name = f'{sp}_{metric}'
        if col_name in df.columns:
            result[f'{sp}_{metric}_transformed'] = func(df[col_name], **kwargs)
    return result


# ============================================
# Main Entry Point for Testing
# ============================================

if __name__ == '__main__':
    from data_loader import load_evolution_csv, detect_species_from_columns
    
    print("🧪 Testing feature engineering...")
    
    # Load data
    df = load_evolution_csv('../../evolution.csv')
    species = detect_species_from_columns(df)
    
    # Test rate calculations
    print("\n📊 Testing rate calculations...")
    for sp in species[:2]:  # Test first 2 species
        pop_col = f'{sp}_population'
        births_col = f'{sp}_births'
        deaths_col = f'{sp}_deaths'
        
        if all(col in df.columns for col in [pop_col, births_col, deaths_col]):
            birth_rate = calculate_birth_rate(
                df[births_col], df[pop_col], df['deltaSeconds']
            )
            death_rate = calculate_death_rate(
                df[deaths_col], df[pop_col], df['deltaSeconds']
            )
            growth_rate = calculate_growth_rate(
                df[births_col], df[deaths_col], df[pop_col], df['deltaSeconds']
            )
            
            print(f"  {sp}:")
            print(f"    Birth rate: {birth_rate.mean():.6f} per capita/sec")
            print(f"    Death rate: {death_rate.mean():.6f} per capita/sec")
            print(f"    Growth rate: {growth_rate.mean():.6f} per capita/sec")
    
    # Test normalization
    print("\n📊 Testing normalization...")
    pop_col = f'{species[0]}_population'
    original = df[pop_col]
    normalized_minmax = normalize_min_max(original)
    normalized_zscore = normalize_z_score(original)
    
    print(f"  Original range: [{original.min():.1f}, {original.max():.1f}]")
    print(f"  Min-max normalized: [{normalized_minmax.min():.3f}, {normalized_minmax.max():.3f}]")
    print(f"  Z-score normalized: mean={normalized_zscore.mean():.3f}, std={normalized_zscore.std():.3f}")
    
    # Test rolling features
    print("\n📊 Testing rolling features...")
    rolling_cv = calculate_rolling_cv(original, window=10)
    stability = calculate_stability_score(original, window=10)
    
    print(f"  Rolling CV (last 5): {rolling_cv.tail(5).values}")
    print(f"  Stability score (last 5): {stability.tail(5).values}")
    
    # Test lag features
    print("\n📊 Testing lag features...")
    lags = create_multiple_lags(original, [1, 2, 3])
    print(f"  Created {len(lags.columns)} lag features")
    print(f"  Lag columns: {list(lags.columns)}")
    
    # Test ratios
    print("\n📊 Testing ratio features...")
    prey_species = [sp for sp in species if 'predator' not in sp.lower()]
    predator_species = [sp for sp in species if 'predator' in sp.lower()]
    
    if prey_species and predator_species:
        prey_total = aggregate_species_metric(df, prey_species, 'population')
        predator_total = aggregate_species_metric(df, predator_species, 'population')
        ratio = calculate_prey_predator_ratio(prey_total, predator_total)
        
        print(f"  Prey:Predator ratio: mean={ratio.mean():.2f}, std={ratio.std():.2f}")
    
    # Test dominance
    print("\n📊 Testing dominance calculation...")
    dominance = calculate_species_dominance(df, species)
    print(f"  Dominance columns: {list(dominance.columns)}")
    print(f"  Final tick dominance:")
    for col in dominance.columns:
        print(f"    {col}: {dominance[col].iloc[-1]:.1f}%")
    
    print("\n✅ All feature engineering tests passed!")

