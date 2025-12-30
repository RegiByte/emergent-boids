#!/usr/bin/env python3
"""
Comprehensive bottleneck analyzer for Chrome trace
"""

import json
import sys
from collections import defaultdict

def analyze_bottleneck(trace_path: str):
    """Find the performance bottleneck"""
    
    print(f"Loading trace file: {trace_path}")
    with open(trace_path, 'r') as f:
        trace_data = json.load(f)
    
    events = trace_data.get('traceEvents', [])
    print(f"Loaded {len(events)} events\n")
    
    # Build complete call frame database from all ProfileChunk events
    call_frames = {}
    all_samples = []
    
    print("Building call frame database from ProfileChunk events...")
    for event in events:
        if event.get('name') == 'ProfileChunk':
            args = event.get('args', {})
            data = args.get('data', {})
            
            if 'cpuProfile' in data:
                cpu_profile = data['cpuProfile']
                nodes = cpu_profile.get('nodes', [])
                samples = cpu_profile.get('samples', [])
                time_deltas = data.get('timeDeltas', [])
                
                # Add nodes to call frame database
                for node in nodes:
                    node_id = node.get('id')
                    call_frame = node.get('callFrame', {})
                    parent = node.get('parent')
                    
                    call_frames[node_id] = {
                        'functionName': call_frame.get('functionName', '(anonymous)'),
                        'url': call_frame.get('url', ''),
                        'scriptId': call_frame.get('scriptId', 0),
                        'lineNumber': call_frame.get('lineNumber', -1),
                        'columnNumber': call_frame.get('columnNumber', -1),
                        'codeType': call_frame.get('codeType', ''),
                        'parent': parent
                    }
                
                # Record samples
                for i, sample_id in enumerate(samples):
                    delta = time_deltas[i] if i < len(time_deltas) else 0
                    all_samples.append({
                        'nodeId': sample_id,
                        'timeDelta': delta
                    })
    
    print(f"Found {len(call_frames)} unique call frames")
    print(f"Found {len(all_samples)} samples\n")
    
    if not all_samples:
        print("No samples found!")
        return
    
    # Calculate self time for each function
    function_time = defaultdict(lambda: {'self_time': 0, 'samples': 0, 'urls': set()})
    
    for sample in all_samples:
        node_id = sample['nodeId']
        time_delta = sample['timeDelta']
        
        if node_id in call_frames:
            frame = call_frames[node_id]
            func_name = frame['functionName']
            url = frame['url']
            
            # Create readable key
            if url and 'http' in url:
                # Extract filename
                filename = url.split('/')[-1].split('?')[0]
                key = f"{func_name}"
                function_time[key]['urls'].add(filename)
            else:
                key = func_name
            
            function_time[key]['self_time'] += time_delta
            function_time[key]['samples'] += 1
    
    # Sort by self time
    sorted_functions = sorted(
        function_time.items(),
        key=lambda x: x[1]['self_time'],
        reverse=True
    )
    
    total_time = sum(stats['self_time'] for _, stats in sorted_functions)
    
    print("=" * 110)
    print("CPU PROFILE - TOP 50 FUNCTIONS BY SELF TIME")
    print("=" * 110)
    print(f"Total profiled time: {total_time/1000:.2f}ms")
    print(f"{'Function Name':<60} {'Samples':>10} {'Time(µs)':>12} {'%':>8} {'Avg(µs)':>10}")
    print("-" * 110)
    
    for func_name, stats in sorted_functions[:50]:
        avg_time = stats['self_time'] / stats['samples'] if stats['samples'] > 0 else 0
        percent = (stats['self_time'] / total_time * 100) if total_time > 0 else 0
        
        # Truncate long names
        display_name = func_name[:58] if len(func_name) > 58 else func_name
        
        print(f"{display_name:<60} {stats['samples']:>10} {stats['self_time']:>12.0f} {percent:>7.2f}% {avg_time:>10.2f}")
    
    # Analyze our code specifically
    print("\n" + "=" * 110)
    print("FUNCTIONS FROM OUR CODE")
    print("=" * 110)
    
    keywords = ['update', 'render', 'query', 'apply', 'rule', 'boid', 'spatial', 
                'engine', 'lifecycle', 'phenotype', 'separation', 'cohesion', 
                'alignment', 'seek', 'avoid', 'crowd']
    
    our_functions = []
    for func_name, stats in sorted_functions:
        func_lower = func_name.lower()
        if any(keyword in func_lower for keyword in keywords):
            our_functions.append((func_name, stats))
    
    if our_functions:
        print(f"{'Function Name':<60} {'Samples':>10} {'Time(µs)':>12} {'%':>8} {'Avg(µs)':>10}")
        print("-" * 110)
        
        for func_name, stats in our_functions[:30]:
            avg_time = stats['self_time'] / stats['samples'] if stats['samples'] > 0 else 0
            percent = (stats['self_time'] / total_time * 100) if total_time > 0 else 0
            display_name = func_name[:58] if len(func_name) > 58 else func_name
            print(f"{display_name:<60} {stats['samples']:>10} {stats['self_time']:>12.0f} {percent:>7.2f}% {avg_time:>10.2f}")
    else:
        print("No functions from our code found (might be minified or inlined)")
    
    # Look for property access patterns
    print("\n" + "=" * 110)
    print("PROPERTY ACCESS PATTERNS")
    print("=" * 110)
    
    property_access = []
    for func_name, stats in sorted_functions:
        if 'get ' in func_name or 'set ' in func_name or func_name.startswith('get') or func_name.startswith('set'):
            property_access.append((func_name, stats))
    
    if property_access:
        print(f"{'Function Name':<60} {'Samples':>10} {'Time(µs)':>12} {'%':>8}")
        print("-" * 110)
        
        for func_name, stats in property_access[:20]:
            percent = (stats['self_time'] / total_time * 100) if total_time > 0 else 0
            display_name = func_name[:58] if len(func_name) > 58 else func_name
            print(f"{display_name:<60} {stats['samples']:>10} {stats['self_time']:>12.0f} {percent:>7.2f}%")
    else:
        print("No obvious property access patterns found")
    
    print("\n" + "=" * 110)
    print("END OF ANALYSIS")
    print("=" * 110)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python analyze_bottleneck.py <trace_file.json>")
        sys.exit(1)
    
    trace_path = sys.argv[1]
    analyze_bottleneck(trace_path)

