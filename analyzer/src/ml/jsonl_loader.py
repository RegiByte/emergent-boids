"""
JSONL Data Loading Module - Pure functional JSONL parsing

Philosophy: Simple functions compose. Each loader is a pure function.
Designed to handle both single-file and multi-file JSONL formats.

JSONL Format:
- Comments start with '#' (metadata, config)
- Config block: # CONFIG_START ... # CONFIG_END
- Data lines: One JSON object per line
- Genetics may be sampled (not present in every snapshot)
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import json
import pandas as pd
import re


# ============================================
# JSONL Parsing - Core Functions
# ============================================


def parse_jsonl_line(line: str) -> Optional[Dict]:
    """
    Parse a single JSONL line

    Returns None for comments/empty lines, Dict for valid JSON.
    Pure function - no side effects.
    """
    line = line.strip()

    # Skip empty lines and comments
    if not line or line.startswith("#"):
        return None

    try:
        return json.loads(line)
    except json.JSONDecodeError as e:
        print(f"⚠️  Warning: Failed to parse line: {line[:50]}... Error: {e}")
        return None


def extract_config_block(lines: List[str]) -> Optional[Dict]:
    """
    Extract configuration from JSONL header

    Looks for # CONFIG_START ... # CONFIG_END block.
    Returns parsed config dict or None if not found.
    """
    in_config = False
    config_lines = []

    for line in lines:
        line = line.strip()

        if line == "# CONFIG_START":
            in_config = True
            continue
        elif line == "# CONFIG_END":
            break
        elif in_config and line.startswith("# "):
            # Remove leading '# ' from config lines
            config_lines.append(line[2:])

    if not config_lines:
        return None

    # Join and parse as JSON
    config_json = "\n".join(config_lines)
    try:
        return json.loads(config_json)
    except json.JSONDecodeError as e:
        print(f"⚠️  Warning: Failed to parse config block: {e}")
        return None


def extract_metadata(lines: List[str]) -> Dict[str, Any]:
    """
    Extract metadata from JSONL header comments

    Looks for patterns like:
    - # Generated: <timestamp>
    - # Snapshots: <count>
    - # Time Range: <start> to <end>

    Returns dict with extracted metadata.
    """
    metadata = {}

    for line in lines[:20]:  # Only check first 20 lines
        line = line.strip()

        if not line.startswith("#"):
            continue

        # Remove leading '# '
        content = line[2:].strip()

        # Parse key: value patterns
        if ":" in content:
            key, value = content.split(":", 1)
            key = key.strip().lower().replace(" ", "_")
            value = value.strip()
            metadata[key] = value

    return metadata


# ============================================
# JSONL File Loading
# ============================================


def load_jsonl_file(file_path: str) -> Tuple[List[Dict], Optional[Dict], Dict]:
    """
    Load JSONL file with config and metadata extraction

    Returns tuple of:
    - snapshots: List of snapshot dicts
    - config: Config dict (or None)
    - metadata: Metadata dict

    Pure function - reads file, returns data structures.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"JSONL file not found: {file_path}")

    with open(path, "r") as f:
        lines = f.readlines()

    # Extract config and metadata
    config = extract_config_block(lines)
    metadata = extract_metadata(lines)

    # Parse data lines
    snapshots = []
    for line in lines:
        data = parse_jsonl_line(line)
        if data is not None:
            snapshots.append(data)

    return snapshots, config, metadata


def load_multiple_jsonl_files(
    file_paths: List[str],
) -> Tuple[List[Dict], Optional[Dict], Dict]:
    """
    Load multiple JSONL files and merge snapshots

    Useful for multi-file exports (e.g., core.jsonl, genetics.jsonl, behavior.jsonl).
    Config and metadata from first file take precedence.

    Returns merged tuple of (snapshots, config, metadata).
    """
    all_snapshots = []
    merged_config = None
    merged_metadata = {}

    for file_path in file_paths:
        snapshots, config, metadata = load_jsonl_file(file_path)

        # Use first config
        if merged_config is None and config is not None:
            merged_config = config

        # Merge metadata
        merged_metadata.update(metadata)

        # Merge snapshots by tick
        all_snapshots.extend(snapshots)

    # Sort by tick
    all_snapshots.sort(key=lambda s: s.get("tick", 0))

    return all_snapshots, merged_config, merged_metadata


# ============================================
# Data Structure Flattening
# ============================================


def flatten_snapshot(snapshot: Dict, prefix: str = "") -> Dict:
    """
    Flatten nested snapshot dict into flat structure

    Converts nested dicts like:
      {'populations': {'cautious': 58, 'explorer': 69}}
    Into:
      {'populations_cautious': 58, 'populations_explorer': 69}

    Pure function - returns new dict.
    """
    flat = {}

    for key, value in snapshot.items():
        new_key = f"{prefix}{key}" if prefix else key

        if isinstance(value, dict):
            # Recursively flatten nested dicts
            flat.update(flatten_snapshot(value, f"{new_key}_"))
        elif isinstance(value, (list, tuple)):
            # Convert lists to JSON strings (for now)
            flat[new_key] = json.dumps(value)
        else:
            flat[new_key] = value

    return flat


def flatten_snapshots(snapshots: List[Dict]) -> List[Dict]:
    """
    Flatten all snapshots in list

    Returns list of flattened dicts.
    """
    return [flatten_snapshot(s) for s in snapshots]


# ============================================
# Species Detection (from JSONL)
# ============================================


def detect_species_from_snapshots(snapshots: List[Dict]) -> List[str]:
    """
    Detect species from snapshot data

    Looks in populations, genetics, energy, etc.
    Returns sorted list of unique species names.
    """
    species = set()

    for snapshot in snapshots:
        # Check populations
        if "populations" in snapshot and isinstance(snapshot["populations"], dict):
            species.update(snapshot["populations"].keys())

        # Check genetics
        if "genetics" in snapshot and isinstance(snapshot["genetics"], dict):
            species.update(snapshot["genetics"].keys())

        # Check energy
        if "energy" in snapshot and isinstance(snapshot["energy"], dict):
            species.update(snapshot["energy"].keys())

    return sorted(species)


def detect_species_from_config(config: Optional[Dict]) -> List[str]:
    """
    Detect species from config block

    Looks in speciesConfigs section.
    Returns sorted list of species names.
    """
    if config is None:
        return []

    if "speciesConfigs" in config:
        return sorted(config["speciesConfigs"].keys())

    return []


# ============================================
# DataFrame Conversion
# ============================================


def snapshots_to_dataframe(
    snapshots: List[Dict], flatten: bool = True, fill_missing_genetics: bool = True
) -> pd.DataFrame:
    """
    Convert snapshots to pandas DataFrame

    Args:
        snapshots: List of snapshot dicts
        flatten: If True, flatten nested structures
        fill_missing_genetics: If True, forward-fill missing genetics data

    Returns DataFrame with one row per snapshot.
    """
    if flatten:
        data = flatten_snapshots(snapshots)
    else:
        data = snapshots

    df = pd.DataFrame(data)

    # Convert timestamp to datetime if present
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")

    # Forward-fill genetics columns (they may be sampled)
    if fill_missing_genetics:
        genetics_cols = [col for col in df.columns if col.startswith("genetics_")]
        if genetics_cols:
            df[genetics_cols] = df[genetics_cols].ffill()

    return df


# ============================================
# Legacy CSV Compatibility
# ============================================


def convert_jsonl_to_csv_format(
    snapshots: List[Dict], species: List[str]
) -> pd.DataFrame:
    """
    Convert JSONL snapshots to legacy CSV format

    Creates columns matching old CSV schema:
    - tick, timestamp, deltaSeconds
    - {species}_population
    - {species}_births, {species}_deaths
    - {species}_energy_mean, {species}_energy_min, {species}_energy_max
    - {species}_deaths_{cause}
    - prey_food_count, predator_food_count
    - atmosphere_event

    Returns DataFrame compatible with old analyzer code.
    """
    rows = []

    for snapshot in snapshots:
        row = {
            "tick": snapshot.get("tick", 0),
            "timestamp": snapshot.get("timestamp", 0),
            "deltaSeconds": snapshot.get("deltaSeconds", 0),
        }

        # Populations
        populations = snapshot.get("populations", {})
        for sp in species:
            row[f"{sp}_population"] = populations.get(sp, 0)

        # Births and deaths
        births = snapshot.get("births", {})
        deaths = snapshot.get("deaths", {})
        for sp in species:
            row[f"{sp}_births"] = births.get(sp, 0)
            row[f"{sp}_deaths"] = deaths.get(sp, 0)

        # Death causes
        death_causes = snapshot.get("deathsByCause", {})
        for sp in species:
            sp_causes = death_causes.get(sp, {})
            for cause in ["old_age", "starvation", "predation"]:
                row[f"{sp}_deaths_{cause}"] = sp_causes.get(cause, 0)

        # Energy
        energy = snapshot.get("energy", {})
        for sp in species:
            sp_energy = energy.get(sp, {})
            row[f"{sp}_energy_mean"] = sp_energy.get("mean", 0)
            row[f"{sp}_energy_min"] = sp_energy.get("min", 0)
            row[f"{sp}_energy_max"] = sp_energy.get("max", 0)

        # Food sources
        food = snapshot.get("environment", {}).get("foodSources", {})
        row["prey_food_count"] = food.get("prey", 0)
        row["predator_food_count"] = food.get("predator", 0)

        # Atmosphere
        atmosphere = snapshot.get("atmosphere", {})
        row["atmosphere_event"] = atmosphere.get("event", "none")

        rows.append(row)

    df = pd.DataFrame(rows)

    # Convert timestamp to datetime
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        df.rename(columns={"timestamp": "date"}, inplace=True)

    return df


# ============================================
# High-Level Loaders (Convenience Functions)
# ============================================


def load_evolution_jsonl(
    file_path: str, format: str = "flat"
) -> Tuple[pd.DataFrame, Optional[Dict], Dict]:
    """
    Load evolution JSONL file and return DataFrame

    Args:
        file_path: Path to JSONL file
        format: Output format - 'flat', 'csv', or 'raw'
            - 'flat': Flattened nested structures (default)
            - 'csv': Legacy CSV-compatible format
            - 'raw': Keep nested structures

    Returns tuple of (DataFrame, config, metadata).
    """
    snapshots, config, metadata = load_jsonl_file(file_path)

    if format == "csv":
        # Convert to legacy CSV format
        species = detect_species_from_snapshots(snapshots)
        df = convert_jsonl_to_csv_format(snapshots, species)
    elif format == "raw":
        # Keep nested structures
        df = snapshots_to_dataframe(
            snapshots, flatten=False, fill_missing_genetics=True
        )
    else:  # 'flat'
        # Flatten nested structures
        df = snapshots_to_dataframe(snapshots, flatten=True, fill_missing_genetics=True)

    return df, config, metadata


def load_evolution_data(
    file_path: str, format: str = "auto"
) -> Tuple[pd.DataFrame, Optional[Dict], Dict]:
    """
    Load evolution data from CSV or JSONL (auto-detect)

    Args:
        file_path: Path to data file (.csv or .jsonl)
        format: Output format - 'auto', 'flat', 'csv', or 'raw'

    Returns tuple of (DataFrame, config, metadata).
    For CSV files, config and metadata will be None and {}.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"Data file not found: {file_path}")

    # Auto-detect format
    if path.suffix == ".jsonl":
        return load_evolution_jsonl(
            file_path, format="csv" if format == "auto" else format
        )
    elif path.suffix == ".csv":
        # Load CSV (legacy format)
        import pandas as pd

        df = pd.read_csv(file_path)
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"])
        return df, None, {}
    else:
        raise ValueError(f"Unsupported file format: {path.suffix}. Use .csv or .jsonl")


# ============================================
# Genetics Data Extraction
# ============================================


def extract_genetics_timeseries(
    snapshots: List[Dict], species: str, trait: str
) -> pd.DataFrame:
    """
    Extract genetics time series for specific species and trait

    Returns DataFrame with columns: tick, mean, min, max, stdDev
    Handles missing genetics data (sampled snapshots).
    """
    rows = []

    for snapshot in snapshots:
        genetics = snapshot.get("genetics", {})
        sp_genetics = genetics.get(species, {})
        traits = sp_genetics.get("traits", {})
        trait_data = traits.get(trait, {})

        if trait_data:
            rows.append(
                {
                    "tick": snapshot.get("tick", 0),
                    "mean": trait_data.get("mean", None),
                    "min": trait_data.get("min", None),
                    "max": trait_data.get("max", None),
                    "stdDev": trait_data.get("stdDev", None),
                }
            )

    df = pd.DataFrame(rows)

    # Forward-fill missing values
    df = df.set_index("tick").ffill().reset_index()

    return df


def extract_all_genetics(snapshots: List[Dict]) -> Dict[str, pd.DataFrame]:
    """
    Extract all genetics data for all species

    Returns dict mapping species -> DataFrame with all traits.
    """
    species_list = detect_species_from_snapshots(snapshots)

    # Detect available traits from first snapshot with genetics
    traits = []
    for snapshot in snapshots:
        genetics = snapshot.get("genetics", {})
        if genetics:
            first_species = list(genetics.keys())[0]
            traits = list(genetics[first_species].get("traits", {}).keys())
            break

    result = {}

    for species in species_list:
        # Extract all traits for this species
        species_data = {}

        for trait in traits:
            trait_df = extract_genetics_timeseries(snapshots, species, trait)
            # Add columns with trait prefix
            for col in ["mean", "min", "max", "stdDev"]:
                if col in trait_df.columns:
                    species_data[f"{trait}_{col}"] = trait_df[col]

        if species_data:
            result[species] = pd.DataFrame(species_data)

    return result


# ============================================
# Main Entry Point for Testing
# ============================================

if __name__ == "__main__":
    import sys

    # Test with actual data
    if len(sys.argv) > 1:
        jsonl_path = sys.argv[1]
    else:
        # Default path when running from src/ml/
        jsonl_path = "../../datasets/evolution.jsonl"

    if not Path(jsonl_path).exists():
        print(f"❌ {jsonl_path} not found")
        print("Usage: python jsonl_loader.py [path/to/evolution.jsonl]")
        sys.exit(1)

    print("🧪 Testing JSONL loader...")
    print(f"📂 Loading: {jsonl_path}\n")

    # Load JSONL
    snapshots, config, metadata = load_jsonl_file(jsonl_path)
    print(f"✅ Loaded {len(snapshots)} snapshots")

    # Print metadata
    print(f"\n📋 Metadata:")
    for key, value in metadata.items():
        print(f"  {key}: {value}")

    # Print config summary
    if config:
        print(f"\n⚙️  Config:")
        print(f"  Perception radius: {config.get('perceptionRadius', 'N/A')}")
        print(f"  Fear radius: {config.get('fearRadius', 'N/A')}")
        species_configs = config.get("speciesConfigs", {})
        print(f"  Species count: {len(species_configs)}")

    # Detect species
    species = detect_species_from_snapshots(snapshots)
    print(f"\n🦠 Detected {len(species)} species: {', '.join(species)}")

    # Convert to DataFrame (CSV format for compatibility)
    print(f"\n📊 Converting to DataFrame (CSV format)...")
    df, _, _ = load_evolution_jsonl(jsonl_path, format="csv")
    print(f"✅ DataFrame shape: {df.shape}")
    print(f"   Columns: {len(df.columns)}")
    print(f"   Rows: {len(df)}")

    # Show sample
    print(f"\n📋 Sample data (first 3 rows):")
    print(df.head(3).to_string())

    # Extract genetics
    print(f"\n🧬 Extracting genetics data...")
    genetics_data = extract_all_genetics(snapshots)
    for sp, sp_df in genetics_data.items():
        print(f"  {sp}: {sp_df.shape[1]} trait metrics")

    print("\n✅ All tests passed!")
