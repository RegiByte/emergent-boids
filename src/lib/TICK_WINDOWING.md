# Tick Windowing Utilities

**Location:** `src/lib/tickWindowing.ts`

Pure functions for grouping events/data by simulation tick windows. Speed-independent aggregation that works at any simulation speed.

---

## Philosophy

**Simulation time (ticks) > Wall-clock time (milliseconds)**

When simulation speed changes, wall-clock time becomes unreliable. Ticks represent true simulation time and remain consistent regardless of speed.

---

## Core Functions

### `getTickWindow(tick, windowSize)`

Calculate which tick window a given tick belongs to.

```typescript
getTickWindow(123, 10) // → { start: 120, end: 130 }
getTickWindow(127, 10) // → { start: 120, end: 130 } // Same window!
getTickWindow(130, 10) // → { start: 130, end: 140 } // New window
```

### `getTickWindowKey(category, tick, windowSize)`

Generate a stable key for a tick window.

```typescript
getTickWindowKey('reproduced', 123, 10) // → "reproduced-120-130"
getTickWindowKey('caught', 127, 10) // → "caught-120-130"
```

### `areInSameWindow(tick1, tick2, windowSize)`

Check if two ticks are in the same window.

```typescript
areInSameWindow(123, 127, 10) // → true
areInSameWindow(123, 130, 10) // → false
```

---

## Grouping Functions

### `groupByTickWindow(items, getCategoryFn, getTickFn, windowSize)`

Group items by tick window and category. Returns a Map for O(1) lookups.

```typescript
const events = [
  { tick: 123, type: "reproduced", data: {...} },
  { tick: 127, type: "caught", data: {...} },
  { tick: 125, type: "reproduced", data: {...} },
];

const grouped = groupByTickWindow(
  events,
  (e) => e.type,      // Category extractor
  (e) => e.tick,      // Tick extractor
  10                  // Window size
);

// Result:
// Map {
//   "reproduced-120-130" → [event1, event3],
//   "caught-120-130" → [event2]
// }
```

### `aggregateByTickWindow(items, getCategoryFn, getTickFn, windowSize, reducerFn, initialValueFn)`

Aggregate items by tick window with custom reducer.

```typescript
const events = [
  { tick: 123, type: 'reproduced', offspring: 2 },
  { tick: 125, type: 'reproduced', offspring: 1 },
]

const aggregated = aggregateByTickWindow(
  events,
  (e) => e.type,
  (e) => e.tick,
  10,
  (acc, event) => ({
    count: acc.count + 1,
    totalOffspring: acc.totalOffspring + event.offspring,
  }),
  () => ({ count: 0, totalOffspring: 0 })
)

// Result:
// Map {
//   "reproduced-120-130" → { count: 2, totalOffspring: 3 }
// }
```

---

## Utility Functions

### `getCurrentTickWindow(currentTick, windowSize)`

Get the current tick window for "now".

```typescript
getCurrentTickWindow(127, 10) // → { start: 120, end: 130 }
```

### `ticksUntilNextWindow(currentTick, windowSize)`

Calculate how many ticks until the next window.

```typescript
ticksUntilNextWindow(123, 10) // → 7  (130 - 123)
ticksUntilNextWindow(129, 10) // → 1  (130 - 129)
ticksUntilNextWindow(130, 10) // → 10 (140 - 130)
```

### `getOverlappingWindows(startTick, endTick, windowSize)`

Get all tick windows that overlap with a tick range.

```typescript
getOverlappingWindows(123, 145, 10)
// → [
//     { start: 120, end: 130 },
//     { start: 130, end: 140 },
//     { start: 140, end: 150 }
//   ]
```

### `formatTickWindow(window, format?)`

Format a tick window for display.

```typescript
formatTickWindow({ start: 120, end: 130 }) // → "T120-T130"
formatTickWindow({ start: 120, end: 130 }, 'compact') // → "120-130"
```

---

## Use Cases

### 1. Event Aggregation (EventsPanel)

Group events by type and time window for display:

```typescript
import { getTickWindowKey } from '@/lib/tickWindowing'

const windowKey = `agg-${getTickWindowKey(eventType, event.tick, 10)}`
```

### 2. Performance Metrics

Track FPS/performance over tick windows:

```typescript
const perfMetrics = aggregateByTickWindow(
  frames,
  () => 'fps',
  (f) => f.tick,
  60, // 60-tick windows
  (acc, frame) => ({
    totalFrames: acc.totalFrames + 1,
    totalTime: acc.totalTime + frame.duration,
  }),
  () => ({ totalFrames: 0, totalTime: 0 })
)
```

### 3. Population Snapshots

Group population data by time windows:

```typescript
const populationWindows = groupByTickWindow(
  snapshots,
  (s) => s.species,
  (s) => s.tick,
  100 // 100-tick windows
)
```

### 4. Event Rate Calculation

Calculate events per window:

```typescript
const birthRates = aggregateByTickWindow(
  birthEvents,
  (e) => e.species,
  (e) => e.tick,
  10,
  (acc) => acc + 1,
  () => 0
)
```

### 5. Stable React Keys

Generate stable keys for animated lists:

```typescript
const key = getTickWindowKey(item.category, item.tick, windowSize)
// Same key for all items in the same window
// → Smooth animations, no layout thrashing
```

---

## Benefits

1. **Speed-Independent** - Works at any simulation speed
2. **Reproducible** - Same ticks = same windows
3. **Efficient** - O(1) lookups with Map
4. **Type-Safe** - Full TypeScript support
5. **Pure Functions** - No side effects, easy to test
6. **Reusable** - Works with any data type

---

## Performance

All functions are O(n) or better:

- `getTickWindow`: O(1)
- `getTickWindowKey`: O(1)
- `areInSameWindow`: O(1)
- `groupByTickWindow`: O(n)
- `aggregateByTickWindow`: O(n)

Map-based grouping ensures O(1) lookups and no duplicate keys.

---

## Testing

```typescript
import { getTickWindow, areInSameWindow } from '@/lib/tickWindowing'

// Test window calculation
expect(getTickWindow(123, 10)).toEqual({ start: 120, end: 130 })
expect(getTickWindow(130, 10)).toEqual({ start: 130, end: 140 })

// Test window membership
expect(areInSameWindow(123, 127, 10)).toBe(true)
expect(areInSameWindow(123, 130, 10)).toBe(false)
```

---

## Future Extensions

Potential additions:

- `getWindowProgress(tick, windowSize)` - % through current window
- `getWindowsInRange(start, end, windowSize)` - Count windows in range
- `alignToWindowBoundary(tick, windowSize)` - Round to nearest window start
- `getAdjacentWindows(tick, windowSize)` - Get prev/next windows

---
