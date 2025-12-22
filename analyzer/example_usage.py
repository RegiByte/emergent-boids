"""
Example usage of the Evolution Analyzer

Shows how to use individual functions for custom analysis
"""

from src.evolution_analyzer import (
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
    """Example: Basic full report generation"""
    print("Example 1: Full Report")
    print("-" * 50)
    
    generate_full_report(
        csv_path='evolution.csv',
        output_dir='./my_analysis',
        stats_json_path='stats.json'
    )


def example_custom_analysis():
    """Example: Custom analysis with individual functions"""
    print("\nExample 2: Custom Analysis")
    print("-" * 50)
    
    # Load data
    df = load_evolution_data('evolution.csv')
    print(f"Loaded {len(df)} data points")
    
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
    
    # Generate specific plot
    plot_population_trends(df, species, colors, 'custom_population.png')
    print("\n✓ Generated custom_population.png")


def example_species_specific():
    """Example: Analyze specific species"""
    print("\nExample 3: Species-Specific Analysis")
    print("-" * 50)
    
    df = load_evolution_data('evolution.csv')
    species = detect_species_from_csv(df)
    
    # Analyze explorer species
    explorer_data = df[['tick', 'explorer_population', 'explorer_avgEnergy', 
                        'explorer_births', 'explorer_deaths']]
    
    print("\nExplorer Statistics:")
    print(f"  Max population: {explorer_data['explorer_population'].max()}")
    print(f"  Min population: {explorer_data['explorer_population'].min()}")
    print(f"  Avg energy: {explorer_data['explorer_avgEnergy'].mean():.1f}")
    print(f"  Total births: {explorer_data['explorer_births'].sum()}")
    print(f"  Total deaths: {explorer_data['explorer_deaths'].sum()}")


def example_time_range():
    """Example: Analyze specific time range"""
    print("\nExample 4: Time Range Analysis")
    print("-" * 50)
    
    df = load_evolution_data('evolution.csv')
    
    # Analyze first 100 ticks
    early_df = df.head(100)
    print(f"Early phase (first 100 ticks):")
    print(f"  Tick range: {early_df['tick'].min()} → {early_df['tick'].max()}")
    
    # Analyze last 100 ticks
    late_df = df.tail(100)
    print(f"\nLate phase (last 100 ticks):")
    print(f"  Tick range: {late_df['tick'].min()} → {late_df['tick'].max()}")
    
    # Compare populations
    species = detect_species_from_csv(df)
    print(f"\nPopulation changes:")
    for sp in species:
        pop_col = f'{sp}_population'
        early_avg = early_df[pop_col].mean()
        late_avg = late_df[pop_col].mean()
        change = ((late_avg - early_avg) / early_avg) * 100
        print(f"  {sp}: {early_avg:.1f} → {late_avg:.1f} ({change:+.1f}%)")


if __name__ == '__main__':
    # Run all examples
    print("="*70)
    print("EVOLUTION ANALYZER - USAGE EXAMPLES")
    print("="*70)
    
    # Uncomment the examples you want to run:
    
    # example_basic_usage()
    example_custom_analysis()
    example_species_specific()
    example_time_range()
    
    print("\n" + "="*70)
    print("Examples complete! Check the generated files.")
    print("="*70 + "\n")



# TODO: Remove this file once we are ready to publish