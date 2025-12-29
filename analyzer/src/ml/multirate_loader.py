"""
Multi-Rate Evolution Data Loader

Utilities for loading multi-rate JSONL exports from ZIP archives or folders.
Enables loading different sampling rates for different model training needs.

Philosophy: Everything is information processing. Simple rules compose.
Emergence is reliable. No central governor needed.

Usage:
    from src.ml.multirate_loader import load_multirate_export, load_rate

    # Load from ZIP file
    data = load_multirate_export('evolution_1234567890.zip')
    
    # Load from folder
    data = load_multirate_export('datasets/evolution_1767034099147/')
    
    df_1x = data['1x']   # Highest resolution
    df_10x = data['10x'] # Medium resolution
    
    # Load specific rate
    df = load_rate('evolution_1234567890.zip', rate=3)
    df = load_rate('datasets/evolution_1767034099147/', rate=10)
    
    # Load metadata
    meta = load_metadata('evolution_1234567890.zip')
    meta = load_metadata('datasets/evolution_1767034099147/')
"""

import json
import zipfile
from pathlib import Path
from typing import Dict, Optional, Any, List
import pandas as pd

from .jsonl_loader import (
    load_jsonl_file,
    snapshots_to_dataframe,
    detect_species_from_snapshots,
)


def _is_folder_export(path: Path) -> bool:
    """Check if path is a folder-based export (vs ZIP file)"""
    return path.is_dir()


def _load_json_from_source(source_path: Path, filename: str) -> Dict[str, Any]:
    """Load JSON file from either folder or ZIP"""
    if _is_folder_export(source_path):
        # Load from folder
        json_path = source_path / filename
        if not json_path.exists():
            raise FileNotFoundError(f"{filename} not found in folder: {source_path}")
        with open(json_path, 'r') as f:
            return json.load(f)
    else:
        # Load from ZIP
        with zipfile.ZipFile(source_path, 'r') as zf:
            if filename not in zf.namelist():
                raise FileNotFoundError(f"{filename} not found in ZIP: {source_path}")
            with zf.open(filename) as f:
                return json.load(f)


def _load_text_from_source(source_path: Path, filename: str) -> str:
    """Load text file from either folder or ZIP"""
    if _is_folder_export(source_path):
        # Load from folder
        file_path = source_path / filename
        if not file_path.exists():
            raise FileNotFoundError(f"{filename} not found in folder: {source_path}")
        with open(file_path, 'r') as f:
            return f.read()
    else:
        # Load from ZIP
        with zipfile.ZipFile(source_path, 'r') as zf:
            if filename not in zf.namelist():
                raise FileNotFoundError(f"{filename} not found in ZIP: {source_path}")
            with zf.open(filename) as f:
                return f.read().decode('utf-8')


def _list_files_in_source(source_path: Path) -> List[str]:
    """List files in either folder or ZIP"""
    if _is_folder_export(source_path):
        # List files in folder
        return [f.name for f in source_path.iterdir() if f.is_file()]
    else:
        # List files in ZIP
        with zipfile.ZipFile(source_path, 'r') as zf:
            return zf.namelist()


def load_metadata(source_path: str | Path) -> Dict[str, Any]:
    """
    Load metadata.json from multi-rate export (ZIP or folder)
    
    Args:
        source_path: Path to ZIP file or folder
        
    Returns:
        Dictionary containing export metadata
        
    Example:
        >>> meta = load_metadata('evolution_1234567890.zip')
        >>> meta = load_metadata('datasets/evolution_1767034099147/')
        >>> print(f"Total snapshots: {meta['totalSnapshots']}")
        >>> print(f"Species: {', '.join(meta['species'])}")
    """
    source_path = Path(source_path)
    
    if not source_path.exists():
        raise FileNotFoundError(f"Source not found: {source_path}")
    
    return _load_json_from_source(source_path, 'metadata.json')


def load_current_stats(source_path: str | Path) -> Optional[Dict[str, Any]]:
    """
    Load stats_current.json from multi-rate export (ZIP or folder, if present)
    
    Args:
        source_path: Path to ZIP file or folder
        
    Returns:
        Dictionary containing current stats, or None if not present
        
    Example:
        >>> stats = load_current_stats('evolution_1234567890.zip')
        >>> stats = load_current_stats('datasets/evolution_1767034099147/')
        >>> if stats:
        ...     print(f"Current population: {stats['populations']['total']}")
    """
    source_path = Path(source_path)
    
    if not source_path.exists():
        raise FileNotFoundError(f"Source not found: {source_path}")
    
    try:
        return _load_json_from_source(source_path, 'stats_current.json')
    except FileNotFoundError:
        return None


def list_available_rates(source_path: str | Path) -> List[int]:
    """
    List all available sampling rates in the export (ZIP or folder)
    
    Args:
        source_path: Path to ZIP file or folder
        
    Returns:
        List of available sampling rates (e.g., [1, 3, 10, 50, 100])
        
    Example:
        >>> rates = list_available_rates('evolution_1234567890.zip')
        >>> rates = list_available_rates('datasets/evolution_1767034099147/')
        >>> print(f"Available rates: {rates}")
        [1, 3, 10, 50, 100]
    """
    source_path = Path(source_path)
    
    if not source_path.exists():
        raise FileNotFoundError(f"Source not found: {source_path}")
    
    rates = []
    filenames = _list_files_in_source(source_path)
    
    for filename in filenames:
        if filename.startswith('snapshots_') and filename.endswith('.jsonl'):
            # Extract rate from filename (e.g., "snapshots_10x.jsonl" -> 10)
            rate_str = filename.replace('snapshots_', '').replace('x.jsonl', '')
            try:
                rates.append(int(rate_str))
            except ValueError:
                continue
    
    return sorted(rates)


def load_rate(
    source_path: str | Path,
    rate: int,
    return_metadata: bool = False
) -> pd.DataFrame | tuple[pd.DataFrame, Dict[str, Any], Dict[str, Any]]:
    """
    Load evolution data at a specific sampling rate from export (ZIP or folder)
    
    Args:
        source_path: Path to ZIP file or folder
        rate: Sampling rate to load (e.g., 1, 3, 10, 50, 100)
        return_metadata: If True, return (df, metadata, config) tuple
        
    Returns:
        DataFrame with evolution data, or tuple if return_metadata=True
        
    Example:
        >>> # Load medium-resolution data (every 10th snapshot)
        >>> df = load_rate('evolution_1234567890.zip', rate=10)
        >>> df = load_rate('datasets/evolution_1767034099147/', rate=10)
        >>> print(f"Loaded {len(df)} snapshots")
        
        >>> # Load with metadata
        >>> df, meta, config = load_rate('evolution_1234567890.zip', rate=1, return_metadata=True)
        >>> print(f"Species: {', '.join(meta['species'])}")
    """
    source_path = Path(source_path)
    
    if not source_path.exists():
        raise FileNotFoundError(f"Source not found: {source_path}")
    
    filename = f'snapshots_{rate}x.jsonl'
    
    # Check if rate exists
    available = list_available_rates(source_path)
    if rate not in available:
        raise ValueError(
            f"Rate {rate}x not found. Available rates: {available}"
        )
    
    # Load JSONL content
    content = _load_text_from_source(source_path, filename)
    
    # Parse JSONL content
    snapshots, metadata, config = load_jsonl_file(content, is_string=True)
    
    # Convert to DataFrame
    df = snapshots_to_dataframe(snapshots)
    
    if return_metadata:
        return df, metadata, config
    return df


def load_multirate_export(
    source_path: str | Path,
    rates: Optional[List[int]] = None
) -> Dict[str, pd.DataFrame]:
    """
    Load all (or selected) sampling rates from multi-rate export (ZIP or folder)
    
    Args:
        source_path: Path to ZIP file or folder
        rates: List of rates to load (None = load all available)
        
    Returns:
        Dictionary mapping rate names to DataFrames
        Keys are strings like '1x', '3x', '10x', etc.
        
    Example:
        >>> # Load all rates from ZIP
        >>> data = load_multirate_export('evolution_1234567890.zip')
        >>> # Load all rates from folder
        >>> data = load_multirate_export('datasets/evolution_1767034099147/')
        >>> print(f"Loaded rates: {list(data.keys())}")
        ['1x', '3x', '10x', '50x', '100x']
        
        >>> # Load specific rates only
        >>> data = load_multirate_export('evolution_1234567890.zip', rates=[1, 10])
        >>> df_fine = data['1x']    # Fine-grained (every snapshot)
        >>> df_coarse = data['10x']  # Coarse (every 10th snapshot)
        
        >>> # Use for multi-resolution model training
        >>> # Train fast model on coarse data
        >>> model_fast = train_model(data['100x'])
        >>> # Train precise model on fine data
        >>> model_precise = train_model(data['1x'])
    """
    source_path = Path(source_path)
    
    if not source_path.exists():
        raise FileNotFoundError(f"Source not found: {source_path}")
    
    # Determine which rates to load
    available_rates = list_available_rates(source_path)
    
    if rates is None:
        rates_to_load = available_rates
    else:
        # Validate requested rates
        invalid_rates = [r for r in rates if r not in available_rates]
        if invalid_rates:
            raise ValueError(
                f"Rates {invalid_rates} not found. "
                f"Available rates: {available_rates}"
            )
        rates_to_load = rates
    
    # Load each rate
    result = {}
    for rate in rates_to_load:
        df = load_rate(source_path, rate)
        result[f'{rate}x'] = df
        print(f"✅ Loaded {rate}x: {len(df)} snapshots")
    
    return result


def load_jsonl_file(content: str, is_string: bool = False) -> tuple:
    """
    Helper to parse JSONL content (either from file or string)
    
    This is a wrapper around the existing jsonl_loader.load_jsonl_file
    that handles both file paths and string content.
    
    Args:
        content: File path or JSONL string content
        is_string: If True, content is treated as string data
        
    Returns:
        Tuple of (snapshots, metadata, config)
    """
    if is_string:
        # Parse JSONL string content
        from .jsonl_loader import parse_jsonl_line, extract_config_block, extract_metadata
        
        lines = content.strip().split('\n')
        
        # Extract config and metadata from header
        config = extract_config_block(lines)
        metadata = extract_metadata(lines)
        
        # Parse snapshot lines (skip comments)
        snapshots = []
        for line in lines:
            if line.strip() and not line.strip().startswith('#'):
                snapshot = parse_jsonl_line(line)
                if snapshot:
                    snapshots.append(snapshot)
        
        return snapshots, metadata, config
    else:
        # Load from file path
        from .jsonl_loader import load_jsonl_file as load_from_file
        return load_from_file(content)


def get_export_summary(source_path: str | Path) -> str:
    """
    Get a human-readable summary of the multi-rate export (ZIP or folder)
    
    Args:
        source_path: Path to ZIP file or folder
        
    Returns:
        Formatted string with export summary
        
    Example:
        >>> print(get_export_summary('evolution_1234567890.zip'))
        >>> print(get_export_summary('datasets/evolution_1767034099147/'))
        📦 Evolution Export Summary
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        Export Date: 2025-12-29T18:21:31.093Z
        Total Snapshots: 1000
        Time Range: tick 4578 → 7575 (26.5 minutes)
        Species: predator, independent, cautious, explorer
        
        Available Sampling Rates:
        • 1x   - 1000 snapshots (every snapshot)
        • 3x   - 334 snapshots (every 3rd snapshot)
        • 10x  - 100 snapshots (every 10th snapshot)
        • 50x  - 20 snapshots (every 50th snapshot)
        • 100x - 10 snapshots (every 100th snapshot)
    """
    meta = load_metadata(source_path)
    rates = list_available_rates(source_path)
    
    # Build summary
    lines = [
        "📦 Evolution Export Summary",
        "━" * 80,
        f"Export Date: {meta['exportDate']}",
        f"Total Snapshots: {meta['totalSnapshots']}",
        f"Time Range: tick {meta['timeRange']['start']['tick']} → {meta['timeRange']['end']['tick']} "
        f"({meta['duration']['minutes']:.1f} minutes)",
        f"Species: {', '.join(meta['species'])}",
        "",
        "Available Sampling Rates:",
    ]
    
    for rate_info in meta['samplingRates']:
        rate = rate_info['rate']
        count = rate_info['snapshotCount']
        lines.append(f"• {rate}x   - {count} snapshots (every {rate}{'' if rate == 1 else 'th'} snapshot)")
    
    return '\n'.join(lines)


# Example usage
if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python multirate_loader.py <path_to_zip_or_folder>")
        print()
        print("Examples:")
        print("  python multirate_loader.py evolution_1234567890.zip")
        print("  python multirate_loader.py datasets/evolution_1767034099147/")
        sys.exit(1)
    
    source_path = sys.argv[1]
    
    # Print summary
    print(get_export_summary(source_path))
    print()
    
    # Load all rates
    print("Loading all rates...")
    data = load_multirate_export(source_path)
    
    print()
    print("✅ Data loaded successfully!")
    print()
    print("Example usage:")
    print("  df_1x = data['1x']    # Highest resolution")
    print("  df_10x = data['10x']  # Medium resolution")
    print("  df_100x = data['100x'] # Coarse resolution")

