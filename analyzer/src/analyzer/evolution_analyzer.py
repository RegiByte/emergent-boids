"""
Evolution Analyzer - Analyze boid simulation evolution data

Updated to work with new JSONL format and legacy CSV format.
Functional approach - each plot is a pure function.

Philosophy: Simple functions compose. Each plot is a pure function.

Supports both:
- Legacy CSV format (deprecated, ~10% data coverage)
- New JSONL format (recommended, 100% data coverage)
"""

import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Import unified data loader
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / 'ml'))
from jsonl_loader import load_evolution_data as load_evolution_auto


# ============================================
# Data Loading & Species Detection
# ============================================

def load_evolution_data(file_path: str) -> pd.DataFrame:
    """
    Load evolution data from CSV or JSONL (auto-detect)
    
    Args:
        file_path: Path to data file (.csv or .jsonl)
    
    Returns DataFrame with evolution snapshot data.
    For JSONL files, converts to CSV-compatible format.
    """
    df, config, metadata = load_evolution_auto(file_path, format='csv')
    
    # Ensure 'date' column exists (JSONL uses 'timestamp')
    if 'timestamp' in df.columns and 'date' not in df.columns:
        df['date'] = df['timestamp']
    
    return df


def load_stats_data(json_path: str) -> Dict:
    """Load stats JSON data"""
    with open(json_path, 'r') as f:
        return json.load(f)


def detect_species_from_csv(df: pd.DataFrame) -> List[str]:
    """
    Detect species from CSV column names
    
    Looks for columns ending in '_population' and extracts species names
    """
    species = []
    for col in df.columns:
        if col.endswith('_population'):
            species_name = col.replace('_population', '')
            species.append(species_name)
    return sorted(species)


def detect_species_from_stats(stats: Dict) -> List[str]:
    """
    Detect species from stats.json
    
    Uses the 'byType' field in populations
    """
    if 'populations' in stats and 'byType' in stats['populations']:
        return sorted(stats['populations']['byType'].keys())
    return []


def get_species_colors(species: List[str]) -> Dict[str, str]:
    """
    Get colors for species
    
    Uses known colors if available, generates otherwise
    """
    known_colors = {
        'cautious': '#00aaff',
        'explorer': '#00ff88',
        'independent': '#ffaa00',
        'predator': '#ff0000',
        'social': '#ff4488',
    }
    
    # Use known colors, fallback to seaborn palette
    colors = {}
    palette = sns.color_palette("husl", len(species))
    
    for i, sp in enumerate(species):
        colors[sp] = known_colors.get(sp, palette[i])
    
    return colors


# ============================================
# Summary Statistics
# ============================================

def calculate_summary_stats(df: pd.DataFrame, species: List[str]) -> Dict:
    """Calculate summary statistics for the evolution run"""
    stats = {
        'total_ticks': len(df),
        'tick_range': (df['tick'].min(), df['tick'].max()),
        'duration_seconds': (df['date'].max() - df['date'].min()).total_seconds(),
        'species_survival': {},
        'avg_populations': {},
        'stability_cv': {},
        'total_births': {},
        'total_deaths': {},
        'death_causes': {},
    }
    
    for sp in species:
        pop_col = f'{sp}_population'
        birth_col = f'{sp}_births'
        death_col = f'{sp}_deaths'
        
        # Survival check
        stats['species_survival'][sp] = (df[pop_col] > 0).all()
        
        # Average population
        stats['avg_populations'][sp] = df[pop_col].mean()
        
        # Stability (coefficient of variation)
        mean_pop = df[pop_col].mean()
        if mean_pop > 0:
            stats['stability_cv'][sp] = df[pop_col].std() / mean_pop
        else:
            stats['stability_cv'][sp] = float('inf')
        
        # Total births and deaths
        if birth_col in df.columns:
            stats['total_births'][sp] = df[birth_col].sum()
        if death_col in df.columns:
            stats['total_deaths'][sp] = df[death_col].sum()
        
        # Death causes (NEW!)
        death_causes = {}
        for cause in ['old_age', 'starvation', 'predation']:
            cause_col = f'{sp}_deaths_{cause}'
            if cause_col in df.columns:
                death_causes[cause] = df[cause_col].sum()
        stats['death_causes'][sp] = death_causes
    
    return stats


def detect_equilibrium(df: pd.DataFrame, species: List[str], 
                       window: int = 100, threshold: float = 0.1) -> Optional[int]:
    """
    Detect when system reaches equilibrium
    
    Equilibrium = all species have CV < threshold over rolling window
    """
    for tick_idx in range(window, len(df)):
        window_data = df.iloc[tick_idx-window:tick_idx]
        all_stable = True
        
        for sp in species:
            pop_col = f'{sp}_population'
            mean_pop = window_data[pop_col].mean()
            if mean_pop > 0:
                cv = window_data[pop_col].std() / mean_pop
                if cv > threshold:
                    all_stable = False
                    break
        
        if all_stable:
            return int(df.iloc[tick_idx]['tick'])
    
    return None


# ============================================
# Plotting Functions
# ============================================

def plot_population_trends(df: pd.DataFrame, species: List[str], 
                          colors: Dict[str, str], save_path: Optional[str] = None):
    """Plot population trends over time"""
    fig, ax = plt.subplots(figsize=(14, 8))
    
    for sp in species:
        pop_col = f'{sp}_population'
        ax.plot(df['tick'], df[pop_col], 
               label=sp.capitalize(), color=colors[sp], linewidth=2, alpha=0.9)
    
    ax.set_xlabel('Tick', fontsize=12)
    ax.set_ylabel('Population', fontsize=12)
    ax.set_title('Population Evolution Over Time', fontsize=14, fontweight='bold')
    ax.legend(loc='best', framealpha=0.9)
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"  ✓ Saved: {save_path}")
    plt.close()


def plot_energy_trends(df: pd.DataFrame, species: List[str], 
                      colors: Dict[str, str], save_path: Optional[str] = None):
    """Plot average energy levels over time (NEW SCHEMA: energy_mean)"""
    fig, ax = plt.subplots(figsize=(14, 8))
    
    for sp in species:
        energy_col = f'{sp}_energy_mean'
        if energy_col in df.columns:
            ax.plot(df['tick'], df[energy_col], 
                   label=sp.capitalize(), color=colors[sp], linewidth=2, alpha=0.8)
    
    ax.set_xlabel('Tick', fontsize=12)
    ax.set_ylabel('Average Energy', fontsize=12)
    ax.set_title('Energy Levels Over Time', fontsize=14, fontweight='bold')
    ax.legend(loc='best', framealpha=0.9)
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"  ✓ Saved: {save_path}")
    plt.close()


def plot_birth_death_rates(df: pd.DataFrame, species: List[str], 
                           colors: Dict[str, str], save_path: Optional[str] = None):
    """Plot birth and death rates with rolling average"""
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10))
    
    window = 10  # Rolling average window
    
    # Births
    for sp in species:
        birth_col = f'{sp}_births'
        if birth_col in df.columns:
            rolling_births = df[birth_col].rolling(window, min_periods=1).mean()
            ax1.plot(df['tick'], rolling_births, 
                    label=sp.capitalize(), color=colors[sp], linewidth=2)
    
    ax1.set_ylabel(f'Births ({window}-tick rolling avg)', fontsize=12)
    ax1.set_title('Birth Rates Over Time', fontsize=14, fontweight='bold')
    ax1.legend(loc='best', framealpha=0.9)
    ax1.grid(True, alpha=0.3)
    
    # Deaths
    for sp in species:
        death_col = f'{sp}_deaths'
        if death_col in df.columns:
            rolling_deaths = df[death_col].rolling(window, min_periods=1).mean()
            ax2.plot(df['tick'], rolling_deaths, 
                    label=sp.capitalize(), color=colors[sp], linewidth=2)
    
    ax2.set_xlabel('Tick', fontsize=12)
    ax2.set_ylabel(f'Deaths ({window}-tick rolling avg)', fontsize=12)
    ax2.set_title('Death Rates Over Time', fontsize=14, fontweight='bold')
    ax2.legend(loc='best', framealpha=0.9)
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"  ✓ Saved: {save_path}")
    plt.close()


def plot_death_causes(df: pd.DataFrame, species: List[str], 
                     colors: Dict[str, str], save_path: Optional[str] = None):
    """Plot death causes breakdown (NEW!)"""
    fig, ax = plt.subplots(figsize=(14, 8))
    
    causes = ['old_age', 'starvation', 'predation']
    cause_labels = ['Old Age', 'Starvation', 'Predation']
    
    # Aggregate death causes per species
    data = []
    for sp in species:
        sp_data = {'species': sp.capitalize()}
        for cause in causes:
            cause_col = f'{sp}_deaths_{cause}'
            if cause_col in df.columns:
                sp_data[cause] = df[cause_col].sum()
            else:
                sp_data[cause] = 0
        data.append(sp_data)
    
    death_df = pd.DataFrame(data)
    
    # Create stacked bar chart
    x = range(len(species))
    width = 0.6
    
    bottom = [0] * len(species)
    for i, cause in enumerate(causes):
        values = death_df[cause].values
        ax.bar(x, values, width, label=cause_labels[i], bottom=bottom)
        bottom = [bottom[j] + values[j] for j in range(len(values))]
    
    ax.set_xlabel('Species', fontsize=12)
    ax.set_ylabel('Total Deaths', fontsize=12)
    ax.set_title('Death Causes by Species', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels([sp.capitalize() for sp in species])
    ax.legend(loc='best', framealpha=0.9)
    ax.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"  ✓ Saved: {save_path}")
    plt.close()


def plot_stability_metrics(df: pd.DataFrame, species: List[str], 
                           colors: Dict[str, str], save_path: Optional[str] = None):
    """Plot stability metrics (rolling CV) over time"""
    fig, ax = plt.subplots(figsize=(14, 8))
    
    window = 100  # Rolling window for CV calculation
    
    for sp in species:
        pop_col = f'{sp}_population'
        # Calculate rolling CV
        rolling_mean = df[pop_col].rolling(window, min_periods=1).mean()
        rolling_std = df[pop_col].rolling(window, min_periods=1).std()
        rolling_cv = rolling_std / rolling_mean
        
        ax.plot(df['tick'], rolling_cv, 
               label=sp.capitalize(), color=colors[sp], linewidth=2, alpha=0.8)
    
    # Add stability threshold line
    ax.axhline(y=0.1, color='gray', linestyle='--', linewidth=1, 
              label='Stability Threshold (CV=0.1)')
    
    ax.set_xlabel('Tick', fontsize=12)
    ax.set_ylabel('Coefficient of Variation (CV)', fontsize=12)
    ax.set_title('Population Stability Over Time (Lower = More Stable)', 
                fontsize=14, fontweight='bold')
    ax.legend(loc='best', framealpha=0.9)
    ax.grid(True, alpha=0.3)
    ax.set_ylim(0, 0.5)  # Limit y-axis for readability
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"  ✓ Saved: {save_path}")
    plt.close()


def plot_prey_predator_ratio(df: pd.DataFrame, species: List[str], 
                             save_path: Optional[str] = None):
    """Plot prey to predator ratio over time"""
    # Identify prey and predators
    predator_species = [sp for sp in species if 'predator' in sp.lower()]
    prey_species = [sp for sp in species if sp not in predator_species]
    
    if not predator_species or not prey_species:
        print("  ⚠ Skipping prey/predator ratio plot (no predators detected)")
        return
    
    # Calculate total prey and predator populations
    prey_total = sum(df[f'{sp}_population'] for sp in prey_species)
    predator_total = sum(df[f'{sp}_population'] for sp in predator_species)
    
    # Calculate ratio (avoid division by zero)
    ratio = prey_total / predator_total.replace(0, float('nan'))
    
    fig, ax = plt.subplots(figsize=(14, 8))
    
    ax.plot(df['tick'], ratio, color='#8b4513', linewidth=2)
    ax.axhline(y=10, color='green', linestyle='--', linewidth=1, 
              label='Target Ratio (10:1)')
    
    ax.set_xlabel('Tick', fontsize=12)
    ax.set_ylabel('Prey:Predator Ratio', fontsize=12)
    ax.set_title('Prey to Predator Ratio Over Time', fontsize=14, fontweight='bold')
    ax.legend(loc='best', framealpha=0.9)
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"  ✓ Saved: {save_path}")
    plt.close()


# ============================================
# Report Generation
# ============================================

def print_summary_report(stats: Dict, species: List[str], equilibrium_tick: Optional[int]):
    """Print summary report to console"""
    print("\n" + "="*70)
    print("🔬 EVOLUTION ANALYSIS REPORT")
    print("="*70)
    
    # Basic stats
    print(f"\n📊 Run Statistics:")
    print(f"  Total Ticks: {stats['total_ticks']:,}")
    print(f"  Tick Range: {stats['tick_range'][0]:,} → {stats['tick_range'][1]:,}")
    print(f"  Duration: {stats['duration_seconds']:.2f} seconds")
    
    # Species survival
    print(f"\n🦠 Species Survival:")
    for sp in species:
        survived = stats['species_survival'][sp]
        status = "✅ ALIVE" if survived else "❌ EXTINCT"
        print(f"  {sp.capitalize():15} {status}")
    
    # Average populations
    print(f"\n📈 Average Populations:")
    for sp in species:
        avg_pop = stats['avg_populations'][sp]
        print(f"  {sp.capitalize():15} {avg_pop:6.1f}")
    
    # Stability
    print(f"\n🎯 Stability (CV - lower is better):")
    for sp in species:
        cv = stats['stability_cv'][sp]
        if cv == float('inf'):
            stability = "N/A (extinct)"
        elif cv < 0.05:
            stability = "Very Stable"
        elif cv < 0.1:
            stability = "Stable"
        elif cv < 0.2:
            stability = "Oscillating"
        else:
            stability = "Unstable"
        print(f"  {sp.capitalize():15} {cv:6.3f} ({stability})")
    
    # Births and deaths
    if stats['total_births']:
        print(f"\n👶 Total Births:")
        for sp in species:
            births = stats['total_births'].get(sp, 0)
            print(f"  {sp.capitalize():15} {births:6,}")
    
    if stats['total_deaths']:
        print(f"\n💀 Total Deaths:")
        for sp in species:
            deaths = stats['total_deaths'].get(sp, 0)
            print(f"  {sp.capitalize():15} {deaths:6,}")
    
    # Death causes (NEW!)
    print(f"\n💀 Death Causes:")
    for sp in species:
        causes = stats['death_causes'].get(sp, {})
        if causes:
            print(f"  {sp.capitalize()}:")
            for cause, count in causes.items():
                if count > 0:
                    print(f"    {cause:12} {count:6,}")
    
    # Equilibrium
    if equilibrium_tick:
        print(f"\n⚖️  Equilibrium:")
        print(f"  Reached at tick: {equilibrium_tick:,}")
        print(f"  Time to equilibrium: {(equilibrium_tick / stats['tick_range'][1]) * 100:.1f}% of run")
    else:
        print(f"\n⚖️  Equilibrium:")
        print(f"  System still stabilizing (no equilibrium detected)")
    
    print("\n" + "="*70)


def generate_full_report(data_path: str, output_dir: str = './analysis', 
                        stats_json_path: Optional[str] = None):
    """
    Generate complete analysis report with all plots
    
    Main entry point for analysis.
    Supports both CSV and JSONL formats (auto-detect).
    
    Args:
        data_path: Path to evolution data file (.csv or .jsonl)
        output_dir: Directory to save plots
        stats_json_path: Optional path to stats.json file
    """
    print("\n🚀 Starting Evolution Analysis...")
    print(f"📂 Loading data from: {data_path}")
    
    # Detect format
    file_ext = Path(data_path).suffix
    if file_ext == '.jsonl':
        print(f"   Format: JSONL (100% data coverage)")
    elif file_ext == '.csv':
        print(f"   Format: CSV (legacy, ~10% data coverage)")
    
    # Load data
    df = load_evolution_data(data_path)
    
    # Detect species
    species = detect_species_from_csv(df)
    print(f"🦠 Detected {len(species)} species: {', '.join(species)}")
    
    # If stats.json available, cross-check species
    if stats_json_path and Path(stats_json_path).exists():
        stats_data = load_stats_data(stats_json_path)
        stats_species = detect_species_from_stats(stats_data)
        if stats_species and set(stats_species) != set(species):
            print(f"⚠️  Warning: Species mismatch between CSV and stats.json")
            print(f"   CSV: {species}")
            print(f"   Stats: {stats_species}")
    
    # Get colors
    colors = get_species_colors(species)
    
    # Calculate statistics
    print(f"\n📊 Calculating statistics...")
    stats = calculate_summary_stats(df, species)
    equilibrium_tick = detect_equilibrium(df, species)
    
    # Print summary report
    print_summary_report(stats, species, equilibrium_tick)
    
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    print(f"\n📊 Generating visualizations in: {output_dir}/")
    
    # Generate all plots
    plot_population_trends(df, species, colors, f'{output_dir}/population_trends.png')
    plot_energy_trends(df, species, colors, f'{output_dir}/energy_trends.png')
    plot_birth_death_rates(df, species, colors, f'{output_dir}/birth_death_rates.png')
    plot_death_causes(df, species, colors, f'{output_dir}/death_causes.png')
    plot_stability_metrics(df, species, colors, f'{output_dir}/stability_metrics.png')
    plot_prey_predator_ratio(df, species, f'{output_dir}/prey_predator_ratio.png')
    
    print(f"\n✅ Analysis complete!")
    print(f"📁 Check {output_dir}/ for all generated plots")
    print("\n" + "="*70 + "\n")


# ============================================
# Main Entry Point
# ============================================

if __name__ == '__main__':
    import sys
    
    # Default paths (can be overridden via command line)
    if len(sys.argv) > 1:
        data_path = sys.argv[1]
    else:
        # Try JSONL first (preferred), then CSV (legacy)
        jsonl_path = 'datasets/evolution.jsonl'
        csv_path = 'datasets/evolution.csv'
        
        if Path(jsonl_path).exists():
            data_path = jsonl_path
        elif Path(csv_path).exists():
            data_path = csv_path
        else:
            print(f"❌ Error: No evolution data file found")
            print(f"   Tried: {jsonl_path}, {csv_path}")
            print(f"   Usage: python evolution_analyzer.py [path/to/evolution.jsonl]")
            sys.exit(1)
    
    stats_path = 'datasets/stats.json'
    output_dir = './analysis'
    
    # Check if data file exists
    if not Path(data_path).exists():
        print(f"❌ Error: {data_path} not found")
        print(f"   Usage: python evolution_analyzer.py [path/to/evolution.jsonl]")
        sys.exit(1)
    
    # Run analysis
    generate_full_report(data_path, output_dir, stats_path)
