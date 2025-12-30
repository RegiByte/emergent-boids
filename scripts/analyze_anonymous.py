#!/usr/bin/env python3
"""
Analyze anonymous functions in trace
"""

import json
import sys
from collections import defaultdict

def analyze_anonymous(trace_path: str):
    """Find anonymous functions"""
    
    print(f"Loading trace file: {trace_path}")
    with open(trace_path, 'r') as f:
        trace_data = json.load(f)
    
    events = trace_data.get('traceEvents', [])
    print(f"Loaded {len(events)} events\n")
    
    # Build call frame database
    call_frames = {}
    all_samples = []
    
    print("Building call frame database...")
    for event in events:
        if event.get('name') == 'ProfileChunk':
            args = event.get('args', {})
            data = args.get('data', {})
            
            if 'cpuProfile' in data:
                cpu_profile = data['cpuProfile']
                nodes = cpu_profile.get('nodes', [])
                samples = cpu_profile.get('samples', [])
                time_deltas = data.get('timeDeltas', [])
                
                # Add nodes
                for node in nodes:
                    node_id = node.get('id')
                    call_frame = node.get('callFrame', {})
                    parent = node.get('parent')
                    
                    call_frames[node_id] = {
                        'functionName': call_frame.get('functionName', ''),
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
    
    print(f"Found {len(call_frames)} call frames")
    print(f"Found {len(all_samples)} samples\n")
    
    # Find anonymous functions and their parents
    anonymous_time = defaultdict(lambda: {'self_time': 0, 'samples': 0, 'urls': set(), 'parents': set()})
    
    for sample in all_samples:
        node_id = sample['nodeId']
        time_delta = sample['timeDelta']
        
        if node_id in call_frames:
            frame = call_frames[node_id]
            func_name = frame['functionName']
            
            # Look for anonymous or empty function names
            if not func_name or func_name in ['(anonymous)', '']:
                url = frame['url']
                line = frame['lineNumber']
                col = frame['columnNumber']
                parent_id = frame['parent']
                
                # Get parent function name
                parent_name = '(no parent)'
                if parent_id and parent_id in call_frames:
                    parent_name = call_frames[parent_id]['functionName'] or '(anonymous parent)'
                
                # Create key with location info
                if url:
                    filename = url.split('/')[-1].split('?')[0]
                    key = f"{filename}:{line}:{col}"
                else:
                    key = f"unknown:{line}:{col}"
                
                anonymous_time[key]['self_time'] += time_delta
                anonymous_time[key]['samples'] += 1
                anonymous_time[key]['urls'].add(url if url else 'unknown')
                anonymous_time[key]['parents'].add(parent_name)
    
    # Sort by time
    sorted_anon = sorted(
        anonymous_time.items(),
        key=lambda x: x[1]['self_time'],
        reverse=True
    )
    
    total_anon_time = sum(stats['self_time'] for _, stats in sorted_anon)
    
    print("=" * 120)
    print("ANONYMOUS FUNCTIONS BY LOCATION")
    print("=" * 120)
    print(f"Total anonymous function time: {total_anon_time/1000:.2f}ms")
    print(f"{'Location':<40} {'Samples':>10} {'Time(µs)':>12} {'%':>8} {'Parent Functions':<40}")
    print("-" * 120)
    
    for location, stats in sorted_anon[:30]:
        percent = (stats['self_time'] / total_anon_time * 100) if total_anon_time > 0 else 0
        parents = ', '.join(list(stats['parents'])[:3])
        if len(stats['parents']) > 3:
            parents += f" (+{len(stats['parents'])-3} more)"
        
        print(f"{location:<40} {stats['samples']:>10} {stats['self_time']:>12.0f} {percent:>7.2f}% {parents:<40}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python analyze_anonymous.py <trace_file.json>")
        sys.exit(1)
    
    trace_path = sys.argv[1]
    analyze_anonymous(trace_path)

