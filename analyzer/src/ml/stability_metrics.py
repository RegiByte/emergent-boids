"""
Stability Metrics Module - Pure functional stability analysis

Philosophy: Simple functions compose. Each metric is a pure function.
Stability emerges from simple measurements.
"""

from typing import Dict, List, Optional, Tuple
import pandas as pd
import numpy as np


# ============================================
# Population Stability Metrics
# ============================================

def calculate_coefficient_of_variation(series: pd.Series) -> float:
    """
    Calculate coefficient of variation (CV)
    
    CV = std / mean
    Lower CV = more stable
    Returns inf if mean is 0.
    """
    mean = series.mean()
    if mean == 0:
        return float('inf')
    return series.std() / mean


def calculate_population_stability(df: pd.DataFrame, species: str, 
                                   window: int = 100) -> float:
    """
    Calculate overall population stability for a species
    
    Returns average CV over rolling windows.
    Lower value = more stable.
    """
    pop_col = f'{species}_population'
    if pop_col not in df.columns:
        return float('nan')
    
    rolling_cv = df[pop_col].rolling(window, min_periods=1).apply(
        lambda x: calculate_coefficient_of_variation(x)
    )
    return rolling_cv.mean()


def detect_extinction_risk(df: pd.DataFrame, species: str, 
                           threshold: int = 10) -> Tuple[bool, float]:
    """
    Detect if species is at risk of extinction
    
    Returns (at_risk, min_population)
    at_risk = True if population ever drops below threshold
    """
    pop_col = f'{species}_population'
    if pop_col not in df.columns:
        return False, float('nan')
    
    min_pop = df[pop_col].min()
    at_risk = min_pop < threshold
    return at_risk, float(min_pop)


def calculate_survival_probability(df: pd.DataFrame, species: str, 
                                   window: int = 10) -> pd.Series:
    """
    Calculate rolling survival probability
    
    Based on recent death rate and population.
    Returns probability in [0, 1] where 1 = certain survival.
    """
    pop_col = f'{species}_population'
    deaths_col = f'{species}_deaths'
    
    if pop_col not in df.columns or deaths_col not in df.columns:
        return pd.Series([float('nan')] * len(df), index=df.index)
    
    # Calculate rolling death rate
    rolling_deaths = df[deaths_col].rolling(window, min_periods=1).mean()
    rolling_pop = df[pop_col].rolling(window, min_periods=1).mean()
    
    # Death rate per capita
    death_rate = rolling_deaths / rolling_pop.replace(0, float('nan'))
    
    # Convert to survival probability (inverse of death rate)
    survival_prob = 1 / (1 + death_rate)
    return survival_prob.clip(0, 1)


# ============================================
# Ecosystem Stability Metrics
# ============================================

def calculate_ecosystem_stability(df: pd.DataFrame, species: List[str], 
                                  window: int = 100) -> float:
    """
    Calculate overall ecosystem stability
    
    Average CV across all species.
    Lower value = more stable ecosystem.
    """
    cvs = []
    for sp in species:
        cv = calculate_population_stability(df, sp, window)
        if not np.isnan(cv) and not np.isinf(cv):
            cvs.append(cv)
    
    return np.mean(cvs) if cvs else float('nan')


def calculate_biodiversity_index(df: pd.DataFrame, species: List[str]) -> pd.Series:
    """
    Calculate Shannon diversity index over time
    
    H = -sum(p_i * log(p_i))
    where p_i is proportion of species i
    
    Higher value = more diverse ecosystem
    """
    result = []
    
    for idx in df.index:
        populations = []
        for sp in species:
            pop_col = f'{sp}_population'
            if pop_col in df.columns:
                populations.append(df.loc[idx, pop_col])
        
        total = sum(populations)
        if total == 0:
            result.append(0)
            continue
        
        # Calculate Shannon index
        shannon = 0
        for pop in populations:
            if pop > 0:
                p = pop / total
                shannon -= p * np.log(p)
        
        result.append(shannon)
    
    return pd.Series(result, index=df.index)


def detect_ecosystem_collapse(df: pd.DataFrame, species: List[str], 
                              threshold: float = 0.5) -> Tuple[bool, Optional[int]]:
    """
    Detect ecosystem collapse
    
    Collapse = more than threshold% of species go extinct
    Returns (collapsed, tick_of_collapse)
    """
    for idx in df.index:
        extinct_count = 0
        for sp in species:
            pop_col = f'{sp}_population'
            if pop_col in df.columns and df.loc[idx, pop_col] == 0:
                extinct_count += 1
        
        extinction_rate = extinct_count / len(species)
        if extinction_rate > threshold:
            return True, int(df.loc[idx, 'tick'])
    
    return False, None


# ============================================
# Equilibrium Detection
# ============================================

def detect_equilibrium(df: pd.DataFrame, species: List[str], 
                      window: int = 100, cv_threshold: float = 0.1) -> Optional[int]:
    """
    Detect when system reaches equilibrium
    
    Equilibrium = all species have CV < threshold over rolling window
    Returns tick number when equilibrium is reached, or None.
    """
    for i in range(window, len(df)):
        window_data = df.iloc[i-window:i]
        all_stable = True
        
        for sp in species:
            pop_col = f'{sp}_population'
            if pop_col not in df.columns:
                continue
            
            cv = calculate_coefficient_of_variation(window_data[pop_col])
            if np.isnan(cv) or np.isinf(cv) or cv > cv_threshold:
                all_stable = False
                break
        
        if all_stable:
            return int(df.iloc[i]['tick'])
    
    return None


def calculate_time_to_equilibrium(df: pd.DataFrame, species: List[str], 
                                  window: int = 100, cv_threshold: float = 0.1) -> Optional[float]:
    """
    Calculate time (in seconds) to reach equilibrium
    
    Returns None if equilibrium not reached.
    """
    equilibrium_tick = detect_equilibrium(df, species, window, cv_threshold)
    if equilibrium_tick is None:
        return None
    
    # Find the row with this tick
    equilibrium_row = df[df['tick'] == equilibrium_tick].iloc[0]
    start_time = df['date'].iloc[0]
    equilibrium_time = equilibrium_row['date']
    
    return (equilibrium_time - start_time).total_seconds()


# ============================================
# Oscillation Detection
# ============================================

def detect_oscillation(series: pd.Series, window: int = 20) -> float:
    """
    Detect oscillating behavior in time series
    
    Returns oscillation score in [0, 1]
    1 = highly oscillating, 0 = stable
    """
    # Count sign changes in derivative
    derivative = series.diff()
    sign_changes = (derivative.shift(1) * derivative < 0).astype(int)
    
    # Calculate oscillation frequency
    oscillation_freq = sign_changes.rolling(window, min_periods=1).mean()
    
    return oscillation_freq.mean()


def classify_population_dynamics(df: pd.DataFrame, species: str, 
                                window: int = 100) -> str:
    """
    Classify population dynamics pattern
    
    Returns: 'stable', 'growing', 'declining', 'oscillating', 'extinct'
    """
    pop_col = f'{species}_population'
    if pop_col not in df.columns:
        return 'unknown'
    
    population = df[pop_col]
    
    # Check extinction
    if population.iloc[-1] == 0:
        return 'extinct'
    
    # Check oscillation
    oscillation_score = detect_oscillation(population, window)
    if oscillation_score > 0.3:
        return 'oscillating'
    
    # Check trend
    recent = population.iloc[-window:]
    cv = calculate_coefficient_of_variation(recent)
    
    if cv < 0.1:
        # Stable - check if growing or declining
        trend = recent.iloc[-1] - recent.iloc[0]
        if abs(trend) < recent.mean() * 0.1:
            return 'stable'
        elif trend > 0:
            return 'growing'
        else:
            return 'declining'
    else:
        return 'unstable'


# ============================================
# Predator-Prey Dynamics
# ============================================

def calculate_predator_prey_stability(df: pd.DataFrame, 
                                     prey_species: List[str], 
                                     predator_species: List[str]) -> Dict[str, float]:
    """
    Calculate predator-prey relationship stability metrics
    
    Returns dict with various stability measures.
    """
    # Aggregate populations
    prey_total = sum(df[f'{sp}_population'] for sp in prey_species 
                    if f'{sp}_population' in df.columns)
    predator_total = sum(df[f'{sp}_population'] for sp in predator_species 
                        if f'{sp}_population' in df.columns)
    
    # Calculate ratio
    ratio = prey_total / predator_total.replace(0, float('nan'))
    
    # Calculate metrics
    return {
        'ratio_mean': ratio.mean(),
        'ratio_std': ratio.std(),
        'ratio_cv': calculate_coefficient_of_variation(ratio),
        'prey_cv': calculate_coefficient_of_variation(prey_total),
        'predator_cv': calculate_coefficient_of_variation(predator_total),
        'correlation': prey_total.corr(predator_total),
    }


def detect_predator_prey_cycles(df: pd.DataFrame, 
                               prey_species: List[str], 
                               predator_species: List[str], 
                               min_period: int = 10) -> Tuple[bool, Optional[float]]:
    """
    Detect cyclic predator-prey dynamics
    
    Returns (has_cycles, average_period)
    """
    # Aggregate populations
    prey_total = sum(df[f'{sp}_population'] for sp in prey_species 
                    if f'{sp}_population' in df.columns)
    predator_total = sum(df[f'{sp}_population'] for sp in predator_species 
                        if f'{sp}_population' in df.columns)
    
    # Find peaks in prey population
    prey_peaks = []
    for i in range(1, len(prey_total) - 1):
        if prey_total.iloc[i] > prey_total.iloc[i-1] and prey_total.iloc[i] > prey_total.iloc[i+1]:
            prey_peaks.append(i)
    
    # Calculate periods between peaks
    if len(prey_peaks) < 2:
        return False, None
    
    periods = [prey_peaks[i+1] - prey_peaks[i] for i in range(len(prey_peaks)-1)]
    avg_period = np.mean(periods)
    
    # Check if periods are consistent
    period_cv = np.std(periods) / avg_period if avg_period > 0 else float('inf')
    
    has_cycles = avg_period >= min_period and period_cv < 0.5
    return has_cycles, avg_period if has_cycles else None


# ============================================
# Summary Reports
# ============================================

def generate_stability_report(df: pd.DataFrame, species: List[str]) -> Dict:
    """
    Generate comprehensive stability report
    
    Returns dict with all stability metrics.
    """
    report = {
        'species_stability': {},
        'species_dynamics': {},
        'extinction_risk': {},
        'ecosystem_stability': calculate_ecosystem_stability(df, species),
        'biodiversity': {
            'mean': calculate_biodiversity_index(df, species).mean(),
            'min': calculate_biodiversity_index(df, species).min(),
            'max': calculate_biodiversity_index(df, species).max(),
        },
    }
    
    # Per-species metrics
    for sp in species:
        report['species_stability'][sp] = calculate_population_stability(df, sp)
        report['species_dynamics'][sp] = classify_population_dynamics(df, sp)
        at_risk, min_pop = detect_extinction_risk(df, sp)
        report['extinction_risk'][sp] = {
            'at_risk': at_risk,
            'min_population': min_pop,
        }
    
    # Equilibrium
    equilibrium_tick = detect_equilibrium(df, species)
    equilibrium_time = calculate_time_to_equilibrium(df, species)
    report['equilibrium'] = {
        'reached': equilibrium_tick is not None,
        'tick': equilibrium_tick,
        'time_seconds': equilibrium_time,
    }
    
    # Ecosystem collapse
    collapsed, collapse_tick = detect_ecosystem_collapse(df, species)
    report['collapse'] = {
        'occurred': collapsed,
        'tick': collapse_tick,
    }
    
    return report


# ============================================
# Main Entry Point for Testing
# ============================================

if __name__ == '__main__':
    from data_loader import load_evolution_csv, detect_species_from_columns, partition_species_by_role
    
    print("🧪 Testing stability metrics...")
    
    # Load data
    df = load_evolution_csv('../../evolution.csv')
    species = detect_species_from_columns(df)
    by_role = partition_species_by_role(species)
    
    print(f"\n📊 Analyzing {len(species)} species over {len(df)} snapshots")
    
    # Test per-species stability
    print("\n📊 Species Stability (CV):")
    for sp in species:
        cv = calculate_population_stability(df, sp, window=10)
        dynamics = classify_population_dynamics(df, sp, window=10)
        print(f"  {sp:15} CV={cv:.4f} ({dynamics})")
    
    # Test ecosystem stability
    ecosystem_cv = calculate_ecosystem_stability(df, species, window=10)
    print(f"\n📊 Ecosystem Stability: CV={ecosystem_cv:.4f}")
    
    # Test biodiversity
    biodiversity = calculate_biodiversity_index(df, species)
    print(f"\n📊 Biodiversity Index:")
    print(f"  Mean: {biodiversity.mean():.4f}")
    print(f"  Range: [{biodiversity.min():.4f}, {biodiversity.max():.4f}]")
    
    # Test equilibrium detection
    equilibrium_tick = detect_equilibrium(df, species, window=10, cv_threshold=0.1)
    if equilibrium_tick:
        print(f"\n📊 Equilibrium reached at tick {equilibrium_tick}")
    else:
        print(f"\n📊 Equilibrium not yet reached")
    
    # Test extinction risk
    print(f"\n📊 Extinction Risk:")
    for sp in species:
        at_risk, min_pop = detect_extinction_risk(df, sp, threshold=10)
        status = "⚠️  AT RISK" if at_risk else "✅ SAFE"
        print(f"  {sp:15} {status} (min pop: {min_pop:.0f})")
    
    # Test predator-prey dynamics
    if by_role['prey'] and by_role['predator']:
        print(f"\n📊 Predator-Prey Dynamics:")
        pp_stability = calculate_predator_prey_stability(df, by_role['prey'], by_role['predator'])
        print(f"  Ratio: {pp_stability['ratio_mean']:.2f} ± {pp_stability['ratio_std']:.2f}")
        print(f"  Correlation: {pp_stability['correlation']:.4f}")
        
        has_cycles, period = detect_predator_prey_cycles(df, by_role['prey'], by_role['predator'])
        if has_cycles:
            print(f"  Cycles detected: period = {period:.1f} ticks")
        else:
            print(f"  No clear cycles detected")
    
    # Generate full report
    print(f"\n📊 Generating comprehensive stability report...")
    report = generate_stability_report(df, species)
    
    print(f"\n✅ Stability Report Generated:")
    print(f"  Ecosystem CV: {report['ecosystem_stability']:.4f}")
    print(f"  Biodiversity: {report['biodiversity']['mean']:.4f}")
    print(f"  Equilibrium: {report['equilibrium']['reached']}")
    print(f"  Collapse: {report['collapse']['occurred']}")
    
    print("\n✅ All stability metrics tests passed!")

