# 📓 Jupyter Notebooks

**Interactive analysis and ML training for Emergent Boids ecosystem data**

---

## 🎯 Notebooks

### **00-env-check.ipynb** ✅

Quick environment validation notebook.

**Purpose:** Verify Python environment, packages, and ML modules are working.

**Run this first** to ensure everything is set up correctly!

### **01-data-analysis.ipynb** 📊

Comprehensive exploratory data analysis.

**Contents:**

1. Setup & Data Loading
2. Dataset Overview
3. Population Dynamics
4. Energy Analysis
5. Birth & Death Patterns
6. Death Causes Breakdown
7. Stability Metrics
8. Predator-Prey Dynamics
9. Summary & Insights

**Outputs:**

- Population trend plots
- Energy level charts
- Birth/death rate analysis
- Death cause breakdowns (stacked bar charts)
- Stability metrics (CV, biodiversity)
- Predator-prey ratio analysis
- Comprehensive summary report

### **02-model-training.ipynb** 🤖

ML model training and evaluation (single species).

**Contents:**

1. Setup & Data Loading
2. Feature Engineering
3. Population Prediction (Regression)
4. Stability Classification
5. Death Cause Prediction
6. Feature Importance Analysis
7. Model Comparison
8. Predictions & Validation

**Outputs:**

- Trained regression models (Linear, Decision Tree, Random Forest)
- Trained classification models (Logistic, Decision Tree, Random Forest)
- Feature importance rankings
- Model comparison tables
- Prediction vs actual plots
- Performance metrics (R², RMSE, MAE, Accuracy, F1)

### **03-multi-species-training.ipynb** 🦌🐺

Multi-species ecosystem-level ML training.

**Purpose:** Build on notebook 02 by training models on **ecosystem-level features** instead of single species.

**Contents:**

1. Setup & Data Loading
2. Ecosystem-Level Feature Engineering
3. Total Population Prediction
4. Per-Species Population Prediction
5. Predator-Prey Dynamics Prediction
6. Feature Importance Analysis
7. Model Comparison Summary
8. Summary & Insights

**Outputs:**

- Ecosystem aggregate features (total, prey, predator populations)
- Biodiversity and stability metrics
- Total population prediction models
- Per-species prediction models (compare predictability)
- Prey vs predator dynamics models
- Feature importance comparison (what drives prey vs predator changes)
- Comprehensive model performance comparison

**Key Insight:** Discover which species are more predictable and what ecosystem features drive population changes.

### **04-death-cause-prediction.ipynb** 💀

Death cause classification and risk assessment.

**Purpose:** Build on notebook 03 by predicting **HOW boids will die** instead of just population changes.

**Contents:**

1. Setup & Data Loading
2. Death Cause Data Extraction
3. Feature Engineering for Death Prediction
4. Overall Death Cause Classification
5. Per-Species Death Cause Models
6. Risk Assessment Framework
7. Feature Importance Analysis
8. Summary & Insights

**Outputs:**

- Death cause classifiers (old_age, starvation, predation)
- Per-species death vulnerability analysis
- Risk probability predictions
- Confusion matrices
- Feature importance (what predicts each death cause)
- Real-time risk assessment framework

**Key Insight:** Predict death risk probabilities for real-time UI indicators (e.g., "60% predation risk - red glow!").

### **05-time-series-prediction.ipynb** ⏰

Multi-step ahead prediction and early warning systems.

**Purpose:** Build on notebook 04 by predicting **future states** instead of just current state.

**Contents:**

1. Setup & Data Loading
2. Temporal Feature Engineering
3. Single-Step Prediction (Baseline)
4. Multi-Step Prediction
5. Trend Detection
6. Stability Forecasting
7. Early Warning System
8. Summary & Insights

**Outputs:**

- Lag features (t-1, t-2, t-3)
- Rolling statistics (10, 50, 100 tick windows)
- Multi-step predictions (1, 5, 10 ticks ahead)
- Accuracy degradation analysis
- Trend classification (growing/stable/declining)
- Stability forecasting
- Early warning alert system

**Key Insight:** Predict instability 10+ ticks before it happens - enable proactive intervention!

---

## 🚀 Quick Start

### 1. Start JupyterLab

```bash
cd analyzer
uv run jupyter lab
```

### 2. Select Kernel

In each notebook:

1. Click kernel selector (top right)
2. Choose **"Python (analyzer)"**
3. Run cells!

### 3. Run Notebooks in Order

1. **00-env-check.ipynb** - Verify setup (2 minutes)
2. **01-data-analysis.ipynb** - Explore data (5-10 minutes)
3. **02-model-training.ipynb** - Train single-species models (3-5 minutes)
4. **03-multi-species-training.ipynb** - Train ecosystem models (5-10 minutes)
5. **04-death-cause-prediction.ipynb** - Predict death causes (5-10 minutes)
6. **05-time-series-prediction.ipynb** - Multi-step prediction (5-10 minutes)

---

## 📊 Data Requirements

Notebooks expect data in:

```
analyzer/datasets/
├── evolution.csv    # Evolution snapshots
└── stats.json       # Current stats (optional)
```

**Minimum requirements:**

- At least 50 snapshots for meaningful analysis
- At least 100 snapshots for reliable ML training
- Recommended: 300+ snapshots (800+ ticks)

---

## 🎨 Customization

### Change Species to Analyze

In **02-model-training.ipynb**, cell 3:

```python
# Change this line:
test_species = species[0]  # First species

# To analyze a different species:
test_species = 'explorer'  # Specific species
```

### Adjust Rolling Windows

For stability metrics:

```python
# Default: 10-tick window
df['rolling_cv'] = calculate_rolling_cv(df[pop_col], window=10)

# Longer window (smoother):
df['rolling_cv'] = calculate_rolling_cv(df[pop_col], window=50)
```

### Change Train/Test Split

```python
# Default: 80/20 split
pipeline = create_regression_pipeline(X, y, test_size=0.2)

# More training data: 90/10 split
pipeline = create_regression_pipeline(X, y, test_size=0.1)
```

---

## 📈 Expected Results

### Data Analysis (01)

**With 300 snapshots (800 ticks):**

- Clear population trends
- Visible birth/death patterns
- Death cause distributions
- Stability convergence
- Predator-prey oscillations

**Typical metrics:**

- Ecosystem CV: 0.15-0.30
- Biodiversity: 1.4-1.6
- Prey:Predator ratio: 15-30:1

### Model Training (02)

**With 300 snapshots:**

- **Regression R²:** 0.95-0.99 (excellent!)
- **Regression RMSE:** 5-15 boids
- **Classification Accuracy:** 0.90-1.00
- **Classification F1:** 0.85-1.00

**Top features (typical):**

1. growth_rate (200-300)
2. death_rate (150-250)
3. birth_rate (30-50)
4. rolling_cv (10-30)
5. current_population (1-5)

---

## 🔧 Troubleshooting

### Kernel Not Found?

```bash
cd analyzer
uv run python -m ipykernel install --user --name=analyzer --display-name="Python (analyzer)"
```

### Import Errors?

Make sure you're in the analyzer directory:

```bash
cd analyzer
uv run jupyter lab
```

### File Not Found?

Check data path in cell 2:

```python
# Should point to datasets folder
df = load_evolution_csv('../../datasets/evolution.csv')
```

### Plots Not Showing?

Add this to first code cell:

```python
%matplotlib inline
```

---

## 💡 Tips

### Save Figures

Add to any plotting cell:

```python
plt.savefig('../../analysis/my_plot.png', dpi=300, bbox_inches='tight')
```

### Export Data

Save processed data:

```python
# Save engineered features
df.to_csv('../../datasets/features.csv', index=False)

# Save predictions
predictions = pd.DataFrame({'actual': y_true, 'predicted': y_pred})
predictions.to_csv('../../analysis/predictions.csv', index=False)
```

### Run All Cells

**Keyboard shortcut:** `Shift + Enter` (run cell and move to next)

**Run all:** Cell menu → Run All Cells

---

## 🎓 Learning Resources

### Understanding the Data

- **tick**: Simulation time step
- **deltaSeconds**: Time between snapshots
- **population**: Current boid count
- **births/deaths**: Events since last snapshot
- **energy_mean**: Average energy per species
- **deaths_X**: Death cause breakdown (old_age, starvation, predation)

### Understanding the Models

**Regression (Population Prediction):**

- Predicts next tick population
- Uses birth rate, death rate, growth rate
- R² = 1.0 means perfect prediction
- RMSE = average error in boids

**Classification (Stability State):**

- Classifies as growing/stable/declining
- Uses same features as regression
- Accuracy = % correct predictions
- F1 = balance of precision and recall

---

## 📚 Next Steps

After running these notebooks:

1. **Collect more data** - Run longer simulations (2000+ ticks)
2. **Try different configs** - Test various parameter settings
3. **Build custom models** - Add your own features and algorithms
4. **Create visualizations** - Export plots for presentations
5. **Share insights** - Document interesting patterns

---

**Philosophy:** Everything is information processing. Simple rules compose. Emergence is reliable.

🚀 **Happy analyzing, Sir RegiByte!**
