"""
Data Loading Module - Pure functional data loading and parsing

Philosophy: Simple functions compose. Each loader is a pure function.
No classes, just functions that transform data.
"""

from pathlib import Path
from typing import Dict, List, Optional
import pandas as pd
import json


# ============================================
# CSV Data Loading
# ============================================

def load_evolution_csv(csv_path: str) -> pd.DataFrame:
    """
    Load evolution CSV data with new schema
    
    Returns DataFrame with all evolution snapshot data including:
    - Population counts per species
    - Birth/death counts with causes
    - Energy statistics
    - Environment state
    - Atmosphere events
    """
    df = pd.read_csv(csv_path)
    df['date'] = pd.to_datetime(df['date'])
    return df


def load_stats_json(json_path: str) -> Dict:
    """Load current stats JSON snapshot"""
    with open(json_path, 'r') as f:
        return json.load(f)


# ============================================
# Species Detection
# ============================================

def detect_species_from_columns(df: pd.DataFrame) -> List[str]:
    """
    Detect species from CSV column names
    
    Looks for columns ending in '_population' and extracts species names.
    Returns sorted list of species identifiers.
    """
    species = set()
    for col in df.columns:
        if col.endswith('_population'):
            species_name = col.replace('_population', '')
            species.add(species_name)
    return sorted(species)


def classify_species_role(species_name: str) -> str:
    """
    Classify species as 'prey' or 'predator'
    
    Pure function - deterministic classification based on name.
    """
    return 'predator' if 'predator' in species_name.lower() else 'prey'


def partition_species_by_role(species: List[str]) -> Dict[str, List[str]]:
    """
    Partition species into prey and predators
    
    Returns dict with 'prey' and 'predator' keys.
    """
    prey = [sp for sp in species if classify_species_role(sp) == 'prey']
    predators = [sp for sp in species if classify_species_role(sp) == 'predator']
    return {'prey': prey, 'predator': predators}


# ============================================
# Column Name Builders (Pure Functions)
# ============================================

def build_population_col(species: str) -> str:
    """Build population column name for species"""
    return f'{species}_population'


def build_births_col(species: str) -> str:
    """Build births column name for species"""
    return f'{species}_births'


def build_deaths_col(species: str) -> str:
    """Build deaths column name for species"""
    return f'{species}_deaths'


def build_energy_mean_col(species: str) -> str:
    """Build energy mean column name for species"""
    return f'{species}_energy_mean'


def build_death_cause_col(species: str, cause: str) -> str:
    """Build death cause column name for species and cause"""
    return f'{species}_deaths_{cause}'


# ============================================
# Data Validation
# ============================================

def validate_required_columns(df: pd.DataFrame, required: List[str]) -> bool:
    """
    Check if DataFrame has all required columns
    
    Returns True if all required columns exist, False otherwise.
    """
    missing = [col for col in required if col not in df.columns]
    if missing:
        print(f"⚠️  Missing columns: {', '.join(missing)}")
        return False
    return True


def get_available_columns(df: pd.DataFrame, pattern: str) -> List[str]:
    """
    Get all columns matching a pattern
    
    Example: get_available_columns(df, '_deaths_') returns all death cause columns
    """
    return [col for col in df.columns if pattern in col]


# ============================================
# Data Extraction Helpers
# ============================================

def extract_species_timeseries(df: pd.DataFrame, species: str, 
                               metric: str) -> pd.Series:
    """
    Extract time series for a specific species and metric
    
    metric can be: 'population', 'births', 'deaths', 'energy_mean'
    Returns pandas Series indexed by tick.
    """
    col_name = f'{species}_{metric}'
    if col_name not in df.columns:
        raise ValueError(f"Column {col_name} not found in DataFrame")
    return df.set_index('tick')[col_name]


def extract_all_populations(df: pd.DataFrame, species: List[str]) -> pd.DataFrame:
    """
    Extract population data for all species
    
    Returns DataFrame with tick index and species as columns.
    """
    pop_cols = [build_population_col(sp) for sp in species]
    return df.set_index('tick')[pop_cols].rename(
        columns={build_population_col(sp): sp for sp in species}
    )


def extract_death_causes(df: pd.DataFrame, species: List[str]) -> pd.DataFrame:
    """
    Extract death cause data for all species
    
    Returns DataFrame with columns: species, cause, count
    """
    causes = ['old_age', 'starvation', 'predation']
    rows = []
    
    for sp in species:
        for cause in causes:
            col_name = build_death_cause_col(sp, cause)
            if col_name in df.columns:
                total = df[col_name].sum()
                rows.append({'species': sp, 'cause': cause, 'count': total})
    
    return pd.DataFrame(rows)


# ============================================
# Data Aggregation
# ============================================

def aggregate_by_role(df: pd.DataFrame, species_by_role: Dict[str, List[str]], 
                      metric: str) -> pd.DataFrame:
    """
    Aggregate metric by role (prey vs predator)
    
    Returns DataFrame with 'prey_total' and 'predator_total' columns.
    """
    result = df[['tick']].copy()
    
    for role, species_list in species_by_role.items():
        cols = [f'{sp}_{metric}' for sp in species_list]
        available_cols = [col for col in cols if col in df.columns]
        if available_cols:
            result[f'{role}_total'] = df[available_cols].sum(axis=1)
        else:
            result[f'{role}_total'] = 0
    
    return result.set_index('tick')


def calculate_prey_predator_ratio(df: pd.DataFrame, 
                                   species_by_role: Dict[str, List[str]]) -> pd.Series:
    """
    Calculate prey:predator ratio over time
    
    Returns Series with ratio values (NaN where predators = 0).
    """
    aggregated = aggregate_by_role(df, species_by_role, 'population')
    ratio = aggregated['prey_total'] / aggregated['predator_total'].replace(0, float('nan'))
    return ratio


# ============================================
# Data Summary
# ============================================

def summarize_dataset(df: pd.DataFrame, species: List[str]) -> Dict:
    """
    Create high-level summary of dataset
    
    Pure function - returns dict with summary statistics.
    """
    return {
        'total_snapshots': len(df),
        'tick_range': (int(df['tick'].min()), int(df['tick'].max())),
        'time_range': (df['date'].min(), df['date'].max()),
        'duration_seconds': (df['date'].max() - df['date'].min()).total_seconds(),
        'species_count': len(species),
        'species_list': species,
        'total_births': sum(df[build_births_col(sp)].sum() 
                           for sp in species if build_births_col(sp) in df.columns),
        'total_deaths': sum(df[build_deaths_col(sp)].sum() 
                           for sp in species if build_deaths_col(sp) in df.columns),
    }


# ============================================
# Composition Helpers
# ============================================

def pipe(data, *functions):
    """
    Pipe data through a series of functions
    
    Example: pipe(df, detect_species, partition_by_role)
    """
    result = data
    for func in functions:
        result = func(result)
    return result


def compose(*functions):
    """
    Compose functions right-to-left
    
    Example: composed = compose(f, g, h)  # h(g(f(x)))
    """
    def composed(x):
        result = x
        for func in reversed(functions):
            result = func(result)
        return result
    return composed


# ============================================
# Main Entry Point for Testing
# ============================================

if __name__ == '__main__':
    # Test with actual data
    csv_path = '../../evolution.csv'
    
    if not Path(csv_path).exists():
        print(f"❌ {csv_path} not found")
        exit(1)
    
    print("🧪 Testing data loader...")
    
    # Load data
    df = load_evolution_csv(csv_path)
    print(f"✅ Loaded {len(df)} snapshots")
    
    # Detect species
    species = detect_species_from_columns(df)
    print(f"✅ Detected species: {', '.join(species)}")
    
    # Partition by role
    by_role = partition_species_by_role(species)
    print(f"✅ Prey: {', '.join(by_role['prey'])}")
    print(f"✅ Predators: {', '.join(by_role['predator'])}")
    
    # Summarize
    summary = summarize_dataset(df, species)
    print(f"\n📊 Dataset Summary:")
    print(f"  Snapshots: {summary['total_snapshots']}")
    print(f"  Ticks: {summary['tick_range'][0]} → {summary['tick_range'][1]}")
    print(f"  Duration: {summary['duration_seconds']:.1f} seconds")
    print(f"  Total Births: {summary['total_births']}")
    print(f"  Total Deaths: {summary['total_deaths']}")
    
    # Extract death causes
    death_causes = extract_death_causes(df, species)
    print(f"\n💀 Death Causes:")
    for _, row in death_causes.iterrows():
        if row['count'] > 0:
            print(f"  {row['species']:15} {row['cause']:12} {int(row['count']):4}")
    
    print("\n✅ All tests passed!")

