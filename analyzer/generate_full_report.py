#!/usr/bin/env python3
"""
Full Evolution Report Generator

Generates a comprehensive analysis report from an evolution dataset folder.
This script aggregates insights from all analysis angles and exports:
- Markdown report with key findings
- PNG graphs for all visualizations
- Summary statistics and metrics

Usage:
    python generate_full_report.py <evolution_folder>
    python generate_full_report.py datasets/evolution_1767040734262

Output:
    <evolution_folder>/analysis/
        - report.md (comprehensive findings)
        - graphs/ (all visualizations as PNG)
        - metrics.json (quantified metrics)
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Tuple

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Import our multirate loader
from src.ml.multirate_loader import load_multirate_export

# Set style for all plots
sns.set_style("darkgrid")
plt.rcParams['figure.figsize'] = (12, 6)
plt.rcParams['font.size'] = 10


class EvolutionReportGenerator:
    """Generates comprehensive evolution analysis reports."""
    
    def __init__(self, evolution_folder: Path):
        self.folder = evolution_folder
        self.output_dir = evolution_folder / "analysis"
        self.graphs_dir = self.output_dir / "graphs"
        
        # Create output directories
        self.output_dir.mkdir(exist_ok=True)
        self.graphs_dir.mkdir(exist_ok=True)
        
        # Load data
        print(f"📂 Loading data from: {evolution_folder}")
        self.data = load_multirate_export(str(evolution_folder))
        self.metadata = self._load_metadata()
        self.final_stats = self._load_final_stats()
        
        # Analysis results storage
        self.findings = {
            'population': {},
            'evolution': {},
            'selection': {},
            'extinction': {},
            'performance': {}
        }
        
    def _load_metadata(self) -> Dict:
        """Load metadata.json"""
        with open(self.folder / "metadata.json") as f:
            return json.load(f)
    
    def _load_final_stats(self) -> Dict:
        """Load stats_current.json"""
        with open(self.folder / "stats_current.json") as f:
            return json.load(f)
    
    def generate_report(self):
        """Generate full analysis report."""
        print("\n🔬 Generating comprehensive analysis...")
        
        # Run all analyses
        self.analyze_population_dynamics()
        self.analyze_trait_evolution()
        self.analyze_selection_pressures()
        self.analyze_extinction_events()
        self.analyze_generation_depth()
        self.analyze_genetic_diversity()
        self.analyze_reproduction_strategies()
        
        # Generate outputs
        self.export_report()
        self.export_metrics()
        
        print(f"\n✅ Report generated: {self.output_dir / 'report.md'}")
        print(f"📊 Graphs exported: {self.graphs_dir}")
        print(f"📈 Metrics saved: {self.output_dir / 'metrics.json'}")
    
    def analyze_population_dynamics(self):
        """Analyze population changes over time."""
        print("  📊 Analyzing population dynamics...")
        
        # Use 10x sampling rate for good balance
        df = self.data['10x']
        
        # Get species list
        species = [s for s in self.metadata['species'] if s != 'predator']
        all_species = self.metadata['species']
        
        # Population over time
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
        
        # Prey populations
        for sp in species:
            pop_col = f'populations_{sp}'
            if pop_col in df.columns:
                ax1.plot(df['tick'], df[pop_col], label=sp.capitalize(), linewidth=2)
        ax1.set_xlabel('Tick')
        ax1.set_ylabel('Population')
        ax1.set_title('Prey Population Dynamics')
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        # Predator population
        if 'populations_predator' in df.columns:
            ax2.plot(df['tick'], df['populations_predator'], 
                    label='Predator', color='red', linewidth=2)
        ax2.set_xlabel('Tick')
        ax2.set_ylabel('Population')
        ax2.set_title('Predator Population Dynamics')
        ax2.legend()
        ax2.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.savefig(self.graphs_dir / 'population_dynamics.png', dpi=150, bbox_inches='tight')
        plt.close()
        
        # Calculate growth rates
        final_pops = self.final_stats['populations']['byType']
        
        # Get initial populations from first snapshot
        first_snap = df.iloc[0]
        growth_rates = {}
        
        for sp in all_species:
            pop_col = f'populations_{sp}'
            if pop_col in df.columns:
                initial = first_snap[pop_col]
                final = final_pops.get(sp, 0)
                if initial > 0:
                    growth = ((final - initial) / initial) * 100
                    growth_rates[sp] = {
                        'initial': int(initial),
                        'final': int(final),
                        'growth_pct': round(growth, 1)
                    }
        
        self.findings['population'] = {
            'growth_rates': growth_rates,
            'final_total': self.final_stats['populations']['total'],
            'prey_predator_ratio': float(self.final_stats['populations']['preyToPredatorRatio']),
            'duration_minutes': round(self.metadata['duration']['minutes'], 2)
        }
    
    def analyze_trait_evolution(self):
        """Analyze how traits evolved over time."""
        print("  🧬 Analyzing trait evolution...")
        
        df = self.data['10x']
        species = self.metadata['species']
        
        # Key traits to track
        traits = ['speed', 'size', 'fearResponse', 'sociability']
        
        # Create subplot for each trait
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        axes = axes.flatten()
        
        for idx, trait in enumerate(traits):
            ax = axes[idx]
            for sp in species:
                col = f'genetics_{sp}_traits_{trait}_mean'
                if col in df.columns:
                    # Filter out NaN values
                    valid_data = df[['tick', col]].dropna()
                    if len(valid_data) > 0:
                        ax.plot(valid_data['tick'], valid_data[col], 
                               label=sp.capitalize(), linewidth=2, alpha=0.8)
            
            ax.set_xlabel('Tick')
            ax.set_ylabel(f'{trait.capitalize()} (mean)')
            ax.set_title(f'{trait.capitalize()} Evolution Over Time')
            ax.legend()
            ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.savefig(self.graphs_dir / 'trait_evolution.png', dpi=150, bbox_inches='tight')
        plt.close()
        
        # Calculate trait changes
        trait_changes = {}
        genetics = self.final_stats['genetics']
        
        for sp in species:
            if sp in genetics:
                sp_traits = genetics[sp]['traits']
                trait_changes[sp] = {}
                
                for trait in traits:
                    if trait in sp_traits:
                        mean_val = sp_traits[trait]['mean']
                        stddev = sp_traits[trait]['stdDev']
                        trait_changes[sp][trait] = {
                            'mean': round(mean_val, 4),
                            'stdDev': round(stddev, 4),
                            'range': [round(sp_traits[trait]['min'], 4), 
                                     round(sp_traits[trait]['max'], 4)]
                        }
        
        self.findings['evolution'] = {
            'trait_changes': trait_changes
        }
    
    def analyze_selection_pressures(self):
        """Identify selection pressures from trait variance."""
        print("  🎯 Analyzing selection pressures...")
        
        genetics = self.final_stats['genetics']
        species = self.metadata['species']
        
        # High stdDev indicates active selection
        selection_threshold = 0.02  # 2% variation indicates selection
        
        pressures = {}
        
        for sp in species:
            if sp not in genetics:
                continue
            
            sp_traits = genetics[sp]['traits']
            pressures[sp] = []
            
            for trait, values in sp_traits.items():
                stddev = values['stdDev']
                mean = values['mean']
                
                # Calculate coefficient of variation
                if mean > 0:
                    cv = stddev / mean
                    if stddev > selection_threshold or cv > 0.05:
                        pressures[sp].append({
                            'trait': trait,
                            'stdDev': round(stddev, 4),
                            'cv': round(cv, 4),
                            'interpretation': 'Active selection' if cv > 0.05 else 'Moderate selection'
                        })
        
        self.findings['selection'] = {
            'pressures': pressures
        }
    
    def analyze_extinction_events(self):
        """Detect extinction events."""
        print("  ⚠️  Analyzing extinction events...")
        
        df = self.data['10x']
        species = self.metadata['species']
        
        extinctions = []
        
        for sp in species:
            pop_col = f'populations_{sp}'
            if pop_col not in df.columns:
                continue
            
            # Check if population went to zero
            pop_series = df[pop_col].dropna()
            if len(pop_series) > 0:
                final_pop = pop_series.iloc[-1]
                max_pop = pop_series.max()
                
                if final_pop == 0 and max_pop > 0:
                    # Find when extinction occurred
                    extinction_idx = pop_series[pop_series == 0].index[0]
                    extinction_tick = df.loc[extinction_idx, 'tick']
                    
                    extinctions.append({
                        'species': sp,
                        'tick': int(extinction_tick),
                        'max_population': int(max_pop)
                    })
        
        self.findings['extinction'] = {
            'events': extinctions,
            'count': len(extinctions)
        }
    
    def analyze_generation_depth(self):
        """Analyze generation depth as indicator of selection pressure."""
        print("  🔢 Analyzing generation depth...")
        
        genetics = self.final_stats['genetics']
        species = self.metadata['species']
        
        # Generation depth chart
        fig, ax = plt.subplots(figsize=(10, 6))
        
        gen_data = []
        labels = []
        
        for sp in species:
            if sp in genetics:
                max_gen = genetics[sp]['maxGeneration']
                avg_gen = genetics[sp]['avgGeneration']
                gen_data.append({
                    'species': sp,
                    'max': max_gen,
                    'avg': round(avg_gen, 2)
                })
                labels.append(sp.capitalize())
        
        # Create grouped bar chart
        x = np.arange(len(gen_data))
        width = 0.35
        
        max_gens = [d['max'] for d in gen_data]
        avg_gens = [d['avg'] for d in gen_data]
        
        ax.bar(x - width/2, max_gens, width, label='Max Generation', alpha=0.8)
        ax.bar(x + width/2, avg_gens, width, label='Avg Generation', alpha=0.8)
        
        ax.set_xlabel('Species')
        ax.set_ylabel('Generation')
        ax.set_title('Generation Depth by Species')
        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.legend()
        ax.grid(True, alpha=0.3, axis='y')
        
        plt.tight_layout()
        plt.savefig(self.graphs_dir / 'generation_depth.png', dpi=150, bbox_inches='tight')
        plt.close()
        
        self.findings['evolution']['generation_depth'] = gen_data
    
    def analyze_genetic_diversity(self):
        """Analyze genetic diversity metrics."""
        print("  🌈 Analyzing genetic diversity...")
        
        genetics = self.final_stats['genetics']
        species = self.metadata['species']
        
        diversity_data = []
        
        for sp in species:
            if sp in genetics:
                color_div = genetics[sp]['colorDiversity']
                unique_colors = genetics[sp]['uniqueColors']
                
                diversity_data.append({
                    'species': sp,
                    'color_diversity': round(color_div, 4),
                    'unique_colors': unique_colors
                })
        
        # Create diversity chart
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
        
        species_names = [d['species'].capitalize() for d in diversity_data]
        color_divs = [d['color_diversity'] for d in diversity_data]
        unique_cols = [d['unique_colors'] for d in diversity_data]
        
        ax1.bar(species_names, color_divs, alpha=0.8)
        ax1.set_ylabel('Color Diversity Index')
        ax1.set_title('Genetic Diversity (Color Proxy)')
        ax1.grid(True, alpha=0.3, axis='y')
        
        ax2.bar(species_names, unique_cols, alpha=0.8, color='orange')
        ax2.set_ylabel('Unique Colors')
        ax2.set_title('Unique Genetic Variants')
        ax2.grid(True, alpha=0.3, axis='y')
        
        plt.tight_layout()
        plt.savefig(self.graphs_dir / 'genetic_diversity.png', dpi=150, bbox_inches='tight')
        plt.close()
        
        self.findings['evolution']['genetic_diversity'] = diversity_data
    
    def analyze_reproduction_strategies(self):
        """Compare reproduction strategies."""
        print("  👶 Analyzing reproduction strategies...")
        
        genetics = self.final_stats['genetics']
        config = self.metadata['config']['speciesConfigs']
        
        strategies = []
        
        for sp, sp_config in config.items():
            if sp in genetics:
                repro_type = sp_config['reproductionType']
                max_gen = genetics[sp]['maxGeneration']
                avg_gen = genetics[sp]['avgGeneration']
                
                strategies.append({
                    'species': sp,
                    'type': repro_type,
                    'max_generation': max_gen,
                    'avg_generation': round(avg_gen, 2)
                })
        
        self.findings['evolution']['reproduction_strategies'] = strategies
    
    def export_report(self):
        """Export markdown report."""
        print("  📝 Generating markdown report...")
        
        report_path = self.output_dir / 'report.md'
        
        with open(report_path, 'w') as f:
            f.write(self._generate_markdown())
    
    def _generate_markdown(self) -> str:
        """Generate markdown report content."""
        duration = self.metadata['duration']
        
        md = f"""# Evolution Analysis Report

**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  
**Dataset:** {self.folder.name}  
**Duration:** {duration['minutes']:.2f} minutes ({duration['ticks']} ticks)

---

## 📊 Population Dynamics

### Final Populations

"""
        
        # Population table
        growth = self.findings['population']['growth_rates']
        md += "| Species | Initial | Final | Growth |\n"
        md += "|---------|---------|-------|--------|\n"
        
        for sp, data in growth.items():
            growth_pct = data['growth_pct']
            growth_str = f"+{growth_pct}%" if growth_pct > 0 else f"{growth_pct}%"
            md += f"| {sp.capitalize()} | {data['initial']} | {data['final']} | {growth_str} |\n"
        
        md += f"\n**Total Population:** {self.findings['population']['final_total']}  \n"
        md += f"**Prey:Predator Ratio:** {self.findings['population']['prey_predator_ratio']:.2f}:1\n\n"
        
        md += "![Population Dynamics](graphs/population_dynamics.png)\n\n"
        
        # Extinction events
        extinctions = self.findings['extinction']['events']
        if extinctions:
            md += "### ⚠️ Extinction Events\n\n"
            for ext in extinctions:
                md += f"- **{ext['species'].capitalize()}**: Extinct at tick {ext['tick']} (max pop: {ext['max_population']})\n"
            md += "\n"
        
        md += "---\n\n## 🧬 Trait Evolution\n\n"
        md += "![Trait Evolution](graphs/trait_evolution.png)\n\n"
        
        # Trait changes summary
        md += "### Key Trait Changes\n\n"
        trait_changes = self.findings['evolution']['trait_changes']
        
        for sp, traits in trait_changes.items():
            md += f"#### {sp.capitalize()}\n\n"
            md += "| Trait | Mean | StdDev | Range |\n"
            md += "|-------|------|--------|-------|\n"
            
            for trait_name, values in traits.items():
                range_str = f"{values['range'][0]:.3f} - {values['range'][1]:.3f}"
                md += f"| {trait_name} | {values['mean']:.3f} | {values['stdDev']:.3f} | {range_str} |\n"
            md += "\n"
        
        md += "---\n\n## 🎯 Selection Pressures\n\n"
        
        pressures = self.findings['selection']['pressures']
        for sp, sp_pressures in pressures.items():
            if sp_pressures:
                md += f"### {sp.capitalize()}\n\n"
                for p in sp_pressures:
                    md += f"- **{p['trait']}**: {p['interpretation']} (CV: {p['cv']:.3f}, σ: {p['stdDev']:.4f})\n"
                md += "\n"
        
        md += "---\n\n## 🔢 Generation Depth\n\n"
        md += "![Generation Depth](graphs/generation_depth.png)\n\n"
        
        gen_data = self.findings['evolution']['generation_depth']
        md += "| Species | Max Gen | Avg Gen | Interpretation |\n"
        md += "|---------|---------|---------|----------------|\n"
        
        for data in gen_data:
            if data['max'] > 15:
                interp = "Deep evolution"
            elif data['max'] > 8:
                interp = "Active evolution"
            else:
                interp = "Shallow evolution"
            
            md += f"| {data['species'].capitalize()} | {data['max']} | {data['avg']:.2f} | {interp} |\n"
        
        md += "\n---\n\n## 🌈 Genetic Diversity\n\n"
        md += "![Genetic Diversity](graphs/genetic_diversity.png)\n\n"
        
        diversity = self.findings['evolution']['genetic_diversity']
        md += "| Species | Color Diversity | Unique Colors |\n"
        md += "|---------|-----------------|---------------|\n"
        
        for data in diversity:
            md += f"| {data['species'].capitalize()} | {data['color_diversity']:.3f} | {data['unique_colors']} |\n"
        
        md += "\n---\n\n## 👶 Reproduction Strategies\n\n"
        
        strategies = self.findings['evolution']['reproduction_strategies']
        md += "| Species | Type | Max Gen | Avg Gen |\n"
        md += "|---------|------|---------|----------|\n"
        
        for strat in strategies:
            md += f"| {strat['species'].capitalize()} | {strat['type'].capitalize()} | {strat['max_generation']} | {strat['avg_generation']:.2f} |\n"
        
        md += "\n---\n\n## 💡 Key Insights\n\n"
        
        # Auto-generate insights
        insights = self._generate_insights()
        for insight in insights:
            md += f"- {insight}\n"
        
        md += "\n---\n\n"
        md += f"*Report generated by Evolution Report Generator v1.0*  \n"
        md += f"*Data: {self.folder.name}*\n"
        
        return md
    
    def _generate_insights(self) -> List[str]:
        """Auto-generate key insights from data."""
        insights = []
        
        # Population insights
        growth = self.findings['population']['growth_rates']
        for sp, data in growth.items():
            if data['growth_pct'] > 100:
                insights.append(f"**{sp.capitalize()} population exploded** (+{data['growth_pct']:.1f}%)")
            elif data['growth_pct'] < -50:
                insights.append(f"**{sp.capitalize()} population collapsed** ({data['growth_pct']:.1f}%)")
        
        # Extinction insights
        if self.findings['extinction']['count'] > 0:
            extinct = [e['species'] for e in self.findings['extinction']['events']]
            insights.append(f"**Extinction event**: {', '.join(extinct)} went extinct")
        
        # Generation depth insights
        gen_data = self.findings['evolution']['generation_depth']
        deepest = max(gen_data, key=lambda x: x['max'])
        insights.append(f"**Deepest evolution**: {deepest['species'].capitalize()} reached Gen {deepest['max']}")
        
        # Diversity insights
        diversity = self.findings['evolution']['genetic_diversity']
        most_diverse = max(diversity, key=lambda x: x['color_diversity'])
        insights.append(f"**Highest genetic diversity**: {most_diverse['species'].capitalize()} ({most_diverse['color_diversity']:.3f})")
        
        return insights
    
    def export_metrics(self):
        """Export metrics as JSON."""
        metrics_path = self.output_dir / 'metrics.json'
        
        with open(metrics_path, 'w') as f:
            json.dump(self.findings, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description='Generate comprehensive evolution analysis report')
    parser.add_argument('evolution_folder', type=str, 
                       help='Path to evolution dataset folder')
    
    args = parser.parse_args()
    
    folder = Path(args.evolution_folder)
    
    if not folder.exists():
        print(f"❌ Error: Folder not found: {folder}")
        sys.exit(1)
    
    if not (folder / "metadata.json").exists():
        print(f"❌ Error: Not a valid evolution dataset (missing metadata.json)")
        sys.exit(1)
    
    print("=" * 60)
    print("  🔬 EVOLUTION ANALYSIS REPORT GENERATOR")
    print("=" * 60)
    
    generator = EvolutionReportGenerator(folder)
    generator.generate_report()
    
    print("\n" + "=" * 60)
    print("  ✅ ANALYSIS COMPLETE")
    print("=" * 60)
    print(f"\n📄 View report: {generator.output_dir / 'report.md'}")
    print(f"📊 View graphs: {generator.graphs_dir}")
    print()


if __name__ == "__main__":
    main()

