# Evolution Analyzer

Analyze evolution data from the Emergent Boids simulation.

**Now supports both CSV (legacy) and JSONL (recommended) formats!**

## Features

- 📊 **Automatic Species Detection** - Infers species from data or stats.json
- 📈 **Population Trends** - Track population over time for all species
- ⚡ **Energy Analysis** - Monitor average energy levels
- 👶💀 **Birth/Death Rates** - Analyze reproduction and mortality
- 🎯 **Stability Metrics** - Detect equilibrium and measure stability
- 🦁🦌 **Prey/Predator Ratio** - Track ecosystem balance
- 🧬 **Genetics Evolution** - Track trait evolution over generations (JSONL only)
- 🌍 **Spatial Patterns** - Analyze clustering and dispersion (JSONL only)
- 🤝 **Interactions** - Track predation, escapes, and chases (JSONL only)
- 📦 **Multi-Rate Export** - Export at multiple sampling rates (NEW!)

## Installation

```bash
# Install dependencies with uv
uv sync

# Or with pip
pip install -r requirements.txt
```

## Data Formats

### Multi-Rate ZIP Export (Recommended) ✅ NEW!

- **Multiple sampling rates** - 1x, 3x, 10x, 50x, 100x in one ZIP
- **Flexible training** - Choose resolution for your use case
- **Efficient storage** - Only load what you need
- **Easy distribution** - Single file contains everything

See [MULTIRATE_EXPORT.md](./MULTIRATE_EXPORT.md) for full guide.

### JSONL Format (Single File) ✅

- **100% data coverage** - All evolution metrics captured
- **Token-efficient** - No repeated headers
- **Genetics data** - Full trait evolution tracking
- **Spatial patterns** - Clustering, dispersion, territory
- **Interactions** - Predation, escapes, chases
- **File size** - ~360 KB for 5 min simulation (optimized)

See [JSONL_FORMAT.md](./JSONL_FORMAT.md) for full specification.

### CSV Format (Legacy) ⚠️

- **~10% data coverage** - Basic metrics only
- **No genetics** - Trait evolution not captured
- **Larger files** - Repeated headers waste space
- **Deprecated** - Use JSONL or Multi-Rate ZIP for new projects

## Usage

### Basic Analysis

```bash
# From the analyzer directory (auto-detects format)
uv run python src/analyzer/evolution_analyzer.py

# Or specify file explicitly
uv run python src/analyzer/evolution_analyzer.py datasets/evolution.jsonl
```

This will:
1. Load `evolution.jsonl` (or `evolution.csv` if JSONL not available)
2. Auto-detect species
3. Generate summary statistics
4. Create 6 visualization plots in `./analysis/`

### Custom Paths

```python
from src.analyzer.evolution_analyzer import generate_full_report

# Works with both CSV and JSONL (auto-detect)
generate_full_report(
    data_path='datasets/evolution.jsonl',
    output_dir='my_analysis',
    stats_json_path='datasets/stats.json'
)
```

### Individual Functions

```python
from src.analyzer.evolution_analyzer import (
    load_evolution_data,
    detect_species_from_csv,
    get_species_colors,
    plot_population_trends,
    calculate_summary_stats
)

# Load data (auto-detects CSV or JSONL)
df = load_evolution_data('datasets/evolution.jsonl')

# Detect species
species = detect_species_from_csv(df)
colors = get_species_colors(species)

# Generate specific plot
plot_population_trends(df, species, colors, 'my_plot.png')

# Calculate stats
stats = calculate_summary_stats(df, species)
print(stats['avg_populations'])
```

### Loading JSONL with Full Metadata

```python
from src.ml.jsonl_loader import load_evolution_jsonl

# Load with config and metadata
df, config, metadata = load_evolution_jsonl('datasets/evolution.jsonl', format='csv')

print(f"Snapshots: {metadata['snapshots']}")
print(f"Perception radius: {config['perceptionRadius']}")

# Access genetics data (JSONL only)
print(df['genetics_cautious_traits_fearResponse_mean'])
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
4. **death_causes.png** - Death causes breakdown by species
5. **stability_metrics.png** - Coefficient of variation over time
6. **prey_predator_ratio.png** - Prey:Predator ratio tracking

## Philosophy

> "Simple functions compose. Each plot is a pure function."

- **Functional approach** - Each plot is an independent function
- **Auto-detection** - No hardcoded species lists
- **Composable** - Use individual functions or full report
- **Extensible** - Easy to add new plots or metrics

## Future Features

- [x] JSONL format support (100% data coverage)
- [x] Genetics evolution tracking
- [x] Spatial pattern analysis
- [x] Interaction metrics (predation, escapes)
- [ ] Multi-file JSONL support (core.jsonl, genetics.jsonl, etc.)
- [ ] Real-time evolution graphs in UI
- [ ] ML model training on evolution data
- [ ] Multi-epoch analysis (compare multiple runs)
- [ ] Interactive plots (plotly)
- [ ] Statistical tests (equilibrium detection)

## Example Output

See `./analysis/` directory after running the analyzer for:
- High-resolution PNG plots (300 DPI)
- Detailed console statistics
- Species-specific insights

## Notes

- **JSONL format recommended** - 100% data coverage vs ~10% in CSV
- **Auto-format detection** - Works with both CSV and JSONL
- **Species auto-detection** - No hardcoded lists
- **Genetics sampling** - Forward-filled for continuous data
- **Streaming support** - Can process files larger than RAM
- **Token-efficient** - Config stored once, no repeated headers
- **Rolling averages** - Smooth noisy data for better visualization

## Migration from CSV to JSONL

No code changes needed! The analyzer auto-detects format:

```python
# Old code (still works)
df = load_evolution_data('evolution.csv')

# New code (same API!)
df = load_evolution_data('evolution.jsonl')
```

See [JSONL_FORMAT.md](./JSONL_FORMAT.md) for full migration guide.

---

**Made with 🧬 for Emergent Boids**

## Generate new list of dependencies

```bash
uv pip freeze > requirements.txt
```