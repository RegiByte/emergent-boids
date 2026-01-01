# Multi-Rate Evolution Export

**Export evolution data at multiple sampling rates for flexible model training**

Philosophy: Everything is information processing. Simple rules compose. Emergence is reliable.

---

## Overview

The multi-rate export system allows you to export evolution data at different temporal resolutions in a single ZIP file. This enables:

- **Flexible model training** - Train models at different resolutions
- **Speed/accuracy trade-offs** - Choose the right resolution for your use case
- **Multi-resolution ensembles** - Combine models trained at different rates
- **Efficient storage** - Only export what you need

---

## File Structure

```
evolution_export_[timestamp].zip
├── metadata.json          # Export info, config, species list
├── stats_current.json     # Current snapshot (optional)
├── snapshots_1x.jsonl     # Every snapshot (highest resolution)
├── snapshots_3x.jsonl     # Every 3rd snapshot
├── snapshots_10x.jsonl    # Every 10th snapshot
├── snapshots_50x.jsonl    # Every 50th snapshot
└── snapshots_100x.jsonl   # Every 100th snapshot (coarse)
```

---

## Sampling Rates

### 1x - Highest Resolution
- **Every snapshot captured**
- **Best for:** Fine-grained pattern detection, short-term predictions, anomaly detection
- **Trade-offs:** Large dataset, slower training, may overfit to noise
- **Use when:** You need maximum detail and accuracy

### 3x - High Resolution
- **Every 3rd snapshot**
- **Best for:** Detailed analysis with reduced noise
- **Trade-offs:** Still large dataset, but 3x faster than 1x
- **Use when:** You want high detail but faster processing

### 10x - Medium Resolution (Recommended)
- **Every 10th snapshot**
- **Best for:** Production models, balanced analysis, medium-term predictions
- **Trade-offs:** Good balance of speed and accuracy
- **Use when:** You want the best of both worlds (most common choice)

### 50x - Coarse Resolution
- **Every 50th snapshot**
- **Best for:** Long-term trend analysis, rapid prototyping
- **Trade-offs:** Misses some details, but very fast
- **Use when:** You want quick insights or long-term patterns

### 100x - Ultra Coarse
- **Every 100th snapshot**
- **Best for:** Epoch-level patterns, exploration, very long simulations
- **Trade-offs:** Misses fine details, may miss important events
- **Use when:** You want ultra-fast processing or very long-term trends

---

## Usage

### 1. Export from UI

1. Run your simulation
2. Let it collect data (at least 100+ snapshots recommended)
3. Open the Controls Sidebar
4. Click **"📦 Download Multi-Rate ZIP"**
5. Save the ZIP file to `analyzer/datasets/`

### 2. Load in Python

```python
from src.ml.multirate_loader import load_multirate_export, get_export_summary

# Load all rates
data = load_multirate_export('evolution_export.zip')

# Access different resolutions
df_1x = data['1x']      # Highest resolution (every snapshot)
df_10x = data['10x']    # Medium resolution (every 10th)
df_100x = data['100x']  # Coarse resolution (every 100th)

# Print summary
print(get_export_summary('evolution_export.zip'))
```

### 3. Load Specific Rate

```python
from src.ml.multirate_loader import load_rate

# Load only 10x rate (faster, less memory)
df = load_rate('evolution_export.zip', rate=10)
```

### 4. Load Metadata

```python
from src.ml.multirate_loader import load_metadata

meta = load_metadata('evolution_export.zip')
print(f"Species: {', '.join(meta['species'])}")
print(f"Duration: {meta['duration']['minutes']:.1f} minutes")
```

---

## Recommended Workflow

### 1. Quick Exploration (100x)
```python
# Start with coarse data for rapid exploration
df = load_rate('evolution_export.zip', rate=100)

# Understand major trends
plot_population_trends(df)
identify_extinction_events(df)
```

### 2. Production Models (10x)
```python
# Train production models on balanced data
df = load_rate('evolution_export.zip', rate=10)

# Good balance of speed and accuracy
model = train_population_predictor(df)
```

### 3. Fine-Tuning (1x)
```python
# Use highest resolution for critical predictions
df = load_rate('evolution_export.zip', rate=1)

# Maximum accuracy (but slower)
model_precise = train_precise_predictor(df)
```

### 4. Multi-Resolution Ensemble
```python
# Combine models at different resolutions
data = load_multirate_export('evolution_export.zip')

model_fast = train_model(data['100x'])    # Fast predictions
model_accurate = train_model(data['1x'])  # Accurate predictions

# Ensemble: use fast model first, accurate for critical decisions
prediction = ensemble_predict(model_fast, model_accurate, input_data)
```

---

## Performance Comparison

Based on typical 1000-snapshot export:

| Rate | Snapshots | Memory | Training Time | Accuracy | Use Case |
|------|-----------|--------|---------------|----------|----------|
| 1x   | 1000      | 100%   | 100%          | Highest  | Fine-grained analysis |
| 3x   | 334       | 33%    | 33%           | High     | Detailed with less noise |
| 10x  | 100       | 10%    | 10%           | Good     | **Production (recommended)** |
| 50x  | 20        | 2%     | 2%            | Fair     | Rapid prototyping |
| 100x | 10        | 1%     | 1%            | Basic    | Exploration only |

---

## Examples

### Example 1: Compare Resolutions

```python
import matplotlib.pyplot as plt

data = load_multirate_export('evolution_export.zip')

fig, axes = plt.subplots(1, 3, figsize=(18, 5))

for idx, rate in enumerate(['1x', '10x', '100x']):
    df = data[rate]
    ax = axes[idx]
    
    ax.plot(df['tick'], df['population_predator'])
    ax.set_title(f'Rate: {rate} ({len(df)} snapshots)')
    ax.set_xlabel('Tick')
    ax.set_ylabel('Predator Population')

plt.tight_layout()
plt.show()
```

### Example 2: Train at Different Resolutions

```python
from sklearn.metrics import mean_absolute_error

results = {}

for rate in ['1x', '10x', '100x']:
    df = load_rate('evolution_export.zip', rate=int(rate.replace('x', '')))
    
    # Train model
    model = train_model(df)
    
    # Evaluate
    mae = evaluate_model(model, df)
    
    results[rate] = {
        'mae': mae,
        'n_samples': len(df),
    }

# Compare
for rate, metrics in results.items():
    print(f"{rate}: MAE={metrics['mae']:.2f}, Samples={metrics['n_samples']}")
```

### Example 3: Adaptive Resolution

```python
def adaptive_predict(zip_path, input_data, confidence_threshold=0.8):
    """
    Use coarse model first, fall back to fine model if confidence is low
    """
    # Try fast model first
    df_coarse = load_rate(zip_path, rate=100)
    model_fast = train_model(df_coarse)
    prediction, confidence = model_fast.predict_with_confidence(input_data)
    
    if confidence >= confidence_threshold:
        return prediction  # Fast prediction is confident
    
    # Fall back to accurate model
    df_fine = load_rate(zip_path, rate=1)
    model_accurate = train_model(df_fine)
    return model_accurate.predict(input_data)
```

---

## Best Practices

### ✅ DO

- **Start with 100x** for quick exploration
- **Use 10x** for production models (best balance)
- **Use 1x** only when you need maximum accuracy
- **Combine rates** for ensemble models
- **Check metadata** before loading to understand the data

### ❌ DON'T

- **Don't use 1x** for rapid prototyping (too slow)
- **Don't use 100x** for production (too coarse)
- **Don't load all rates** if you only need one (wastes memory)
- **Don't assume** higher rate is always better (may overfit)

---

## Troubleshooting

### Issue: ZIP file not found
```python
# Check if file exists
from pathlib import Path
if not Path('evolution_export.zip').exists():
    print("File not found! Export from UI first.")
```

### Issue: Rate not available
```python
# List available rates
from src.ml.multirate_loader import list_available_rates
rates = list_available_rates('evolution_export.zip')
print(f"Available rates: {rates}")
```

### Issue: Out of memory
```python
# Load only the rate you need (don't load all)
df = load_rate('evolution_export.zip', rate=10)  # Good
# data = load_multirate_export('evolution_export.zip')  # Bad (loads all)
```

### Issue: Model not accurate enough
```python
# Try a finer resolution
df = load_rate('evolution_export.zip', rate=3)  # Finer than 10x
```

---

## Technical Details

### File Format

Each JSONL file contains:
- **Header:** Comments with metadata and config
- **Data:** One JSON object per line (snapshot)
- **Compression:** ZIP compression (typically 60-80% reduction)

### Metadata Schema

```json
{
  "exportDate": "2025-12-29T18:21:31.093Z",
  "totalSnapshots": 1000,
  "timeRange": {
    "start": {"tick": 4578, "timestamp": 1767030907352},
    "end": {"tick": 7575, "timestamp": 1767032490141}
  },
  "duration": {
    "ticks": 2997,
    "seconds": 1582.789,
    "minutes": 26.38
  },
  "samplingRates": [
    {"rate": 1, "filename": "snapshots_1x.jsonl", "snapshotCount": 1000},
    {"rate": 10, "filename": "snapshots_10x.jsonl", "snapshotCount": 100}
  ],
  "species": ["predator", "independent", "cautious", "explorer"],
  "config": {...}
}
```

---

## See Also

- **[JSONL_FORMAT.md](./JSONL_FORMAT.md)** - JSONL format specification
- **[README.md](./README.md)** - Main analyzer documentation
- **[Notebook 06](./src/notebooks/06-multirate-analysis.ipynb)** - Multi-rate analysis examples

---

**Philosophy:** "Everything is information processing. Simple rules compose. Emergence is reliable. No central governor needed."

**Multi-rate exports give you the flexibility to choose the right temporal resolution for your analysis. Start coarse, refine as needed!** 📊✨🔬


