# Evolution Analyzer

Analyze evolution data from the Emergent Boids simulation.

## Features

- 📊 **Automatic Species Detection** - Infers species from CSV columns or stats.json
- 📈 **Population Trends** - Track population over time for all species
- ⚡ **Energy Analysis** - Monitor average energy levels
- 👶💀 **Birth/Death Rates** - Analyze reproduction and mortality
- 🎯 **Stability Metrics** - Detect equilibrium and measure stability
- 🦁🦌 **Prey/Predator Ratio** - Track ecosystem balance

## Installation

```bash
# Install dependencies with uv
uv sync

# Or with pip
pip install -r requirements.txt
```

## Usage

### Basic Analysis

```bash
# From the analyzer directory
python src/evolution_analyzer.py
```

This will:
1. Load `evolution.csv` and `stats.json`
2. Auto-detect species
3. Generate summary statistics
4. Create 5 visualization plots in `./analysis/`

### Custom Paths

```python
from evolution_analyzer import generate_full_report

generate_full_report(
    csv_path='my_data/evolution.csv',
    output_dir='my_analysis',
    stats_json_path='my_data/stats.json'
)
```

### Individual Functions

```python
from evolution_analyzer import (
    load_evolution_data,
    detect_species_from_csv,
    get_species_colors,
    plot_population_trends,
    calculate_summary_stats
)

# Load data
df = load_evolution_data('evolution.csv')

# Detect species
species = detect_species_from_csv(df)
colors = get_species_colors(species)

# Generate specific plot
plot_population_trends(df, species, colors, 'my_plot.png')

# Calculate stats
stats = calculate_summary_stats(df, species)
print(stats['avg_populations'])
```

## Output

### Console Report

```
🔬 EVOLUTION ANALYSIS REPORT
======================================================================

📊 Run Statistics:
  Total Ticks: 1,000
  Tick Range: 5,847 → 8,844
  Duration: 5.12 hours

🦠 Species Survival:
  Cautious        ✅ ALIVE
  Explorer        ✅ ALIVE
  Independent     ✅ ALIVE
  Predator        ✅ ALIVE
  Social          ✅ ALIVE

📈 Average Populations:
  Cautious        148.2
  Explorer        145.7
  Independent     143.9
  Predator         49.8
  Social           73.4

🎯 Stability (CV - lower is better):
  Cautious        0.012 (Very Stable)
  Explorer        0.023 (Very Stable)
  Independent     0.045 (Very Stable)
  Predator        0.034 (Very Stable)
  Social          0.067 (Stable)

⚖️  Equilibrium:
  Reached at tick: 6,234
  Time to equilibrium: 12.9% of run
```

### Generated Plots

1. **population_trends.png** - Population over time for all species
2. **energy_trends.png** - Average energy levels over time
3. **birth_death_rates.png** - Birth and death rates (rolling average)
4. **stability_metrics.png** - Coefficient of variation over time
5. **prey_predator_ratio.png** - Prey:Predator ratio tracking

## Philosophy

> "Simple functions compose. Each plot is a pure function."

- **Functional approach** - Each plot is an independent function
- **Auto-detection** - No hardcoded species lists
- **Composable** - Use individual functions or full report
- **Extensible** - Easy to add new plots or metrics

## Future Features

- [ ] Multi-epoch analysis (compare multiple runs)
- [ ] Export to ZIP with all epochs
- [ ] Real-time analysis during simulation
- [ ] Custom species configuration file
- [ ] Interactive plots (plotly)
- [ ] Statistical tests (equilibrium detection)

## Example Output

See `./analysis/` directory after running the analyzer for:
- High-resolution PNG plots (300 DPI)
- Detailed console statistics
- Species-specific insights

## Notes

- CSV file can be any size (tested with 120KB+ files)
- Species are auto-detected from column names
- Works with custom species (no hardcoded lists)
- Handles missing data gracefully
- Rolling averages smooth noisy data

---

**Made with 🧬 for Emergent Boids**

## Generate new list of dependencies

```bash
uv pip freeze > requirements.txt
```