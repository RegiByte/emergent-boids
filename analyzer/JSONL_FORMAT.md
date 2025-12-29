# JSONL Format Documentation

## Overview

The analyzer now supports **JSONL (JSON Lines)** format for evolution data, replacing the legacy CSV format. JSONL provides 100% data coverage compared to ~10% in CSV.

## Format Specification

### File Structure

```jsonl
# Emergent Boids - Evolution Data (JSONL Format)
# Generated: 2025-12-29T17:17:59.179Z
# Snapshots: 112
# Time Range: 2025-12-29T17:15:05.405Z to 2025-12-29T17:17:57.793Z
# Format: One JSON object per line (after config block)
# Optimization: activeParameters stored once (saves ~13.0% file size)
#
# Configuration (applies to all snapshots):
# CONFIG_START
# {
#   "perceptionRadius": 50,
#   "fearRadius": 150,
#   "speciesConfigs": { ... }
# }
# CONFIG_END
#
{"tick":3,"timestamp":1767028505405,"populations":{"cautious":58},"genetics":{...}}
{"tick":6,"timestamp":1767028506962,"populations":{"cautious":58},"genetics":{...}}
{"tick":9,"timestamp":1767028508461,"populations":{"cautious":58}}
```

### Components

1. **Header Comments** (lines starting with `#`)

   - Metadata about the export
   - Generation timestamp
   - Snapshot count
   - Time range
   - Optimization notes

2. **Config Block** (optional)

   ```jsonl
   # CONFIG_START
   # { ... JSON config ... }
   # CONFIG_END
   ```

   - Stores static configuration once
   - Applies to all snapshots
   - Saves ~13% file size

3. **Data Lines** (one JSON object per line)
   - Each line is a complete snapshot
   - Self-contained (no dependencies on other lines)
   - Can be processed line-by-line (streaming)

### Snapshot Structure

Each snapshot contains:

```typescript
{
  // Core metadata
  tick: number,
  timestamp: number,  // Unix timestamp (ms)
  deltaSeconds: number,

  // Populations
  populations: {
    [species: string]: number
  },

  // Births and deaths
  births: { [species: string]: number },
  deaths: { [species: string]: number },
  deathsByCause: {
    [species: string]: {
      old_age: number,
      starvation: number,
      predation: number
    }
  },

  // Energy
  energy: {
    [species: string]: {
      total: number,
      mean: number,
      min: number,
      max: number,
      stdDev: number
    }
  },

  // Genetics (may be sampled - not in every snapshot)
  genetics?: {
    [species: string]: {
      generationDistribution: { [gen: string]: number },
      maxGeneration: number,
      avgGeneration: number,
      traits: {
        [trait: string]: {
          mean: number,
          min: number,
          max: number,
          stdDev: number
        }
      },
      colorDiversity: number,
      uniqueColors: number,
      bodyPartStats: { ... },
      mutationsSinceLastSnapshot: { ... }
    }
  },

  // Spatial patterns
  spatial: {
    [species: string]: {
      meanNearestNeighborDistance: number,
      clusterCount: number,
      dispersionIndex: number
    }
  },

  // Reproduction
  reproduction: {
    [species: string]: {
      readyToMate: number,
      seekingMate: number,
      mating: number
    }
  },

  // Age distribution
  age: {
    [species: string]: {
      young: number,
      mature: number,
      elder: number
    }
  },

  // Stances
  stances: {
    [species: string]: {
      [stance: string]: number
    }
  },

  // Interactions
  interactions: {
    catches: { [species: string]: number },
    escapes: { [species: string]: number },
    chaseDistances: { [species: string]: number }
  },

  // Environment
  environment: {
    foodSources: {
      prey: { count: number, totalEnergy: number, meanEnergy: number },
      predator: { count: number, totalEnergy: number, meanEnergy: number }
    }
  },

  // Atmosphere
  atmosphere: {
    event: string,
    intensity: number
  }
}
```

## Genetics Sampling

Genetics data may be **sampled** (not present in every snapshot) to reduce file size:

- **Full genetics** (interval=1): Every snapshot includes genetics (~1.2 MB for 5 min)
- **Sampled genetics** (interval=5): Every 5th snapshot includes genetics (~360 KB for 5 min)

Missing genetics data is **forward-filled** when loading, so you always have access to the most recent genetics state.

## Usage

### Loading JSONL Data

```python
from src.ml.jsonl_loader import load_evolution_jsonl

# Load with auto-detect format
df, config, metadata = load_evolution_jsonl('evolution.jsonl', format='csv')

# Load with flat format (nested structures flattened)
df, config, metadata = load_evolution_jsonl('evolution.jsonl', format='flat')

# Load with raw format (keep nested structures)
df, config, metadata = load_evolution_jsonl('evolution.jsonl', format='raw')
```

### Auto-Detect CSV or JSONL

```python
from src.ml.data_loader import load_evolution_data

# Auto-detect format based on file extension
df, config, metadata = load_evolution_data('evolution.jsonl')
df, config, metadata = load_evolution_data('evolution.csv')
```

### Using Evolution Analyzer

```python
from src.analyzer.evolution_analyzer import generate_full_report

# Works with both CSV and JSONL
generate_full_report('evolution.jsonl', output_dir='./analysis')
generate_full_report('evolution.csv', output_dir='./analysis')
```

## Multi-File Support (Future)

The JSONL loader is designed to support **multi-file exports** in the future:

```python
from src.ml.jsonl_loader import load_multiple_jsonl_files

# Load and merge multiple files
snapshots, config, metadata = load_multiple_jsonl_files([
    'core.jsonl',        # Populations, events (20 KB)
    'behavior.jsonl',    # Energy, stances (200 KB)
    'genetics.jsonl',    # Traits, evolution (140 KB)
])
```

### Proposed Multi-File Structure

**core.jsonl** - Essential metrics (always loaded)

```jsonl
{"tick":3,"populations":{...},"births":{...},"deaths":{...}}
```

**behavior.jsonl** - Behavioral data

```jsonl
{"tick":3,"energy":{...},"stances":{...},"reproduction":{...}}
```

**genetics.jsonl** - Evolution data (optional, large)

```jsonl
{"tick":3,"genetics":{...}}
```

**spatial.jsonl** - Spatial patterns (optional)

```jsonl
{"tick":3,"spatial":{...},"interactions":{...}}
```

**config.json** - Static configuration

```json
{
  "perceptionRadius": 50,
  "speciesConfigs": { ... }
}
```

### Benefits of Multi-File Format

1. **Selective Loading**: Load only the data you need
2. **Parallel Processing**: Process different aspects independently
3. **Smaller Files**: Easier to manage and version control
4. **Faster Analysis**: Skip large genetics data for quick population analysis
5. **Modular**: Add new data dimensions without breaking existing files

## Comparison: CSV vs JSONL

| Feature              | CSV (Legacy)        | JSONL (New)                 |
| -------------------- | ------------------- | --------------------------- |
| **Data Coverage**    | ~10% (40 columns)   | 100% (100+ dimensions)      |
| **File Size**        | 500 KB (5 min)      | 1.2 MB → 360 KB (optimized) |
| **Genetics Data**    | ❌ None             | ✅ Full trait evolution     |
| **Spatial Patterns** | ❌ None             | ✅ Clustering, dispersion   |
| **Interactions**     | ❌ None             | ✅ Catches, escapes, chases |
| **Reproduction**     | ❌ None             | ✅ Mating dynamics          |
| **Nested Data**      | ❌ Flattened only   | ✅ Preserves structure      |
| **Streaming**        | ❌ Load entire file | ✅ Line-by-line processing  |
| **Token Efficiency** | ❌ Repeated headers | ✅ No repeated headers      |
| **LLM-Friendly**     | ⚠️ Moderate         | ✅ Very readable            |

## Migration Guide

### From CSV to JSONL

Old code:

```python
from src.analyzer.evolution_analyzer import load_evolution_data

df = load_evolution_data('evolution.csv')
```

New code (no changes needed!):

```python
from src.analyzer.evolution_analyzer import load_evolution_data

# Auto-detects format
df = load_evolution_data('evolution.jsonl')
```

### Accessing New Data

JSONL provides access to data not available in CSV:

```python
df, config, metadata = load_evolution_jsonl('evolution.jsonl', format='flat')

# Genetics data (NEW!)
print(df['genetics_cautious_traits_fearResponse_mean'])
print(df['genetics_cautious_traits_maturityRate_mean'])
print(df['genetics_cautious_traits_longevity_mean'])

# Spatial patterns (NEW!)
print(df['spatial_cautious_meanNearestNeighborDistance'])
print(df['spatial_cautious_clusterCount'])

# Reproduction dynamics (NEW!)
print(df['reproduction_cautious_readyToMate'])
print(df['reproduction_cautious_seekingMate'])

# Interactions (NEW!)
print(df['interactions_catches_predator'])
print(df['interactions_escapes_cautious'])
```

## Best Practices

1. **Use JSONL for new projects** - Full data coverage, better format
2. **Keep CSV for compatibility** - If you need to support old tools
3. **Sample genetics data** - Use interval=5 for long simulations (30+ min)
4. **Stream large files** - Process line-by-line instead of loading all at once
5. **Compress for storage** - gzip reduces JSONL size by 60-70%

## File Size Optimization

### Current Optimizations

1. **Config stored once** (saves ~13%)

   - Static parameters in header
   - Not repeated in every snapshot

2. **Genetics sampling** (saves ~55% with interval=5)
   - Genetics changes slowly
   - Sample every 5 snapshots
   - Forward-fill missing data

### Future Optimizations

1. **Compression** (gzip)

   - 60-70% additional reduction
   - 360 KB → ~120 KB

2. **Multi-file export**

   - Separate concerns
   - Load only what you need

3. **Delta encoding**

   - Store only changes
   - Efficient for slow-changing data

4. **Binary format** (MessagePack)
   - 50-60% smaller than JSON
   - Less human-readable

## Technical Details

### Parsing Performance

- **Line-by-line**: O(n) memory, constant per-line processing
- **Streaming**: Can process files larger than RAM
- **Parallel**: Each line is independent, can be processed in parallel

### Forward-Fill Algorithm

For sampled genetics data:

```python
# Genetics present in snapshots 0, 5, 10, 15...
# Forward-fill to snapshots 1-4, 6-9, 11-14...

df['genetics_*'] = df['genetics_*'].ffill()
```

This ensures you always have access to the most recent genetics state, even when it's not in the current snapshot.

### Config Extraction

Config block is extracted from header comments:

```python
# CONFIG_START
# { "key": "value" }
# CONFIG_END

# Parsed as:
config = {"key": "value"}
```

## Examples

See `example_usage.py` for complete examples of:

- Loading JSONL data
- Analyzing evolution metrics
- Generating plots
- Comparing time ranges
- Species-specific analysis

## Support

For issues or questions:

1. Check this documentation
2. Review `src/ml/jsonl_loader.py` for implementation details
3. Run `python src/ml/jsonl_loader.py datasets/evolution.jsonl` to test

---

**Last Updated**: December 29, 2025  
**Format Version**: 1.0  
**Compatibility**: Python 3.11+, pandas 2.3+
