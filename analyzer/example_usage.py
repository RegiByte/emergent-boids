"""
Example usage of the Evolution Analyzer

Shows how to use individual functions for custom analysis.
Supports both CSV (legacy) and JSONL (recommended) formats.
"""

from pathlib import Path
from src.analyzer.evolution_analyzer import (
    load_evolution_data,
    detect_species_from_csv,
    get_species_colors,
    calculate_summary_stats,
    detect_equilibrium,
    plot_population_trends,
    plot_energy_trends,
    generate_full_report
)


def example_basic_usage():
    """Example: Basic full report generation (JSONL format)"""
    print("Example 1: Full Report (JSONL)")
    print("-" * 50)
    
    # Use JSONL format (recommended)
    generate_full_report(
        data_path='datasets/evolution.jsonl',
        output_dir='./my_analysis',
        stats_json_path='datasets/stats.json'
    )


def example_basic_usage_csv():
    """Example: Basic full report generation (Legacy CSV format)"""
    print("Example 1b: Full Report (Legacy CSV)")
    print("-" * 50)
    
    # Use CSV format (legacy, if JSONL not available)
    generate_full_report(
        data_path='datasets/evolution.csv',
        output_dir='./my_analysis_csv',
        stats_json_path='datasets/stats.json'
    )


def example_custom_analysis():
    """Example: Custom analysis with individual functions (JSONL)"""
    print("\nExample 2: Custom Analysis (JSONL)")
    print("-" * 50)
    
    # Load data (auto-detects JSONL format)
    data_path = 'datasets/evolution.jsonl'
    if not Path(data_path).exists():
        data_path = 'datasets/evolution.csv'  # Fallback to CSV
    
    df = load_evolution_data(data_path)
    print(f"Loaded {len(df)} data points from {Path(data_path).suffix} format")
    
    # Detect species
    species = detect_species_from_csv(df)
    print(f"Detected species: {', '.join(species)}")
    
    # Get colors
    colors = get_species_colors(species)
    
    # Calculate stats
    stats = calculate_summary_stats(df, species)
    print(f"\nAverage populations:")
    for sp, avg_pop in stats['avg_populations'].items():
        print(f"  {sp}: {avg_pop:.1f}")
    
    # Detect equilibrium
    eq_tick = detect_equilibrium(df, species)
    if eq_tick:
        print(f"\nEquilibrium reached at tick: {eq_tick:,}")
    else:
        print(f"\nSystem still stabilizing (no equilibrium)")
    
    # Generate specific plot
    plot_population_trends(df, species, colors, 'custom_population.png')
    print("\n✓ Generated custom_population.png")


def example_species_specific():
    """Example: Analyze specific species"""
    print("\nExample 3: Species-Specific Analysis")
    print("-" * 50)
    
    data_path = 'datasets/evolution.jsonl'
    if not Path(data_path).exists():
        data_path = 'datasets/evolution.csv'
    
    df = load_evolution_data(data_path)
    species = detect_species_from_csv(df)
    
    # Analyze explorer species
    explorer_cols = ['tick', 'explorer_population', 'explorer_births', 'explorer_deaths']
    if 'explorer_energy_mean' in df.columns:
        explorer_cols.append('explorer_energy_mean')
    
    explorer_data = df[explorer_cols]
    
    print("\nExplorer Statistics:")
    print(f"  Max population: {explorer_data['explorer_population'].max()}")
    print(f"  Min population: {explorer_data['explorer_population'].min()}")
    if 'explorer_energy_mean' in df.columns:
        print(f"  Avg energy: {explorer_data['explorer_energy_mean'].mean():.1f}")
    print(f"  Total births: {explorer_data['explorer_births'].sum()}")
    print(f"  Total deaths: {explorer_data['explorer_deaths'].sum()}")


def example_time_range():
    """Example: Analyze specific time range"""
    print("\nExample 4: Time Range Analysis")
    print("-" * 50)
    
    data_path = 'datasets/evolution.jsonl'
    if not Path(data_path).exists():
        data_path = 'datasets/evolution.csv'
    
    df = load_evolution_data(data_path)
    
    # Analyze first half
    midpoint = len(df) // 2
    early_df = df.head(midpoint)
    print(f"Early phase (first {midpoint} snapshots):")
    print(f"  Tick range: {early_df['tick'].min()} → {early_df['tick'].max()}")
    
    # Analyze second half
    late_df = df.tail(midpoint)
    print(f"\nLate phase (last {midpoint} snapshots):")
    print(f"  Tick range: {late_df['tick'].min()} → {late_df['tick'].max()}")
    
    # Compare populations
    species = detect_species_from_csv(df)
    print(f"\nPopulation changes:")
    for sp in species:
        pop_col = f'{sp}_population'
        early_avg = early_df[pop_col].mean()
        late_avg = late_df[pop_col].mean()
        if early_avg > 0:
            change = ((late_avg - early_avg) / early_avg) * 100
            print(f"  {sp}: {early_avg:.1f} → {late_avg:.1f} ({change:+.1f}%)")
        else:
            print(f"  {sp}: {early_avg:.1f} → {late_avg:.1f} (N/A - extinct early)")


if __name__ == '__main__':
    # Run all examples
    print("="*70)
    print("EVOLUTION ANALYZER - USAGE EXAMPLES")
    print("="*70)
    print("\nNote: Examples will use JSONL format if available, fallback to CSV")
    print("="*70)
    
    # Uncomment the examples you want to run:
    
    # example_basic_usage()  # Full report with JSONL
    # example_basic_usage_csv()  # Full report with CSV
    example_custom_analysis()
    example_species_specific()
    example_time_range()
    
    print("\n" + "="*70)
    print("Examples complete! Check the generated files.")
    print("="*70 + "\n")