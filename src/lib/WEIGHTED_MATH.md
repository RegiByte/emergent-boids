# Weighted Math Utilities

**Location:** `src/lib/weightedMath.ts`

Pure functions for weighted calculations, scoring, and comparisons. Perfect for stable sorting, priority systems, and multi-factor decisions.

---

## Philosophy

**Simple rules compose.** Weight different factors to create emergent behavior without complex conditionals.

Instead of:

```typescript
// Complex conditional sorting
if (a.priority === b.priority) {
  if (a.timestamp === b.timestamp) {
    return a.count - b.count;
  }
  return b.timestamp - a.timestamp;
}
return b.priority - a.priority;
```

Use:

```typescript
// Weighted composition
createWeightedComparator([
  { getValue: (x) => x.priority, weight: 10.0 },
  { getValue: (x) => x.timestamp, weight: 1.0 },
  { getValue: (x) => x.count, weight: 0.1 },
]);
```

---

## Core Functions

### `weightedSum(factors)`

Calculate a weighted sum of values.

```typescript
weightedSum([
  { value: 100, weight: 1.0 }, // Primary factor
  { value: 50, weight: 0.5 }, // Secondary factor
  { value: 10, weight: 0.1 }, // Tertiary factor
]);
// → 100*1.0 + 50*0.5 + 10*0.1 = 126
```

### `weightedDifference(factorsA, factorsB)`

Calculate weighted difference between two sets of factors.

```typescript
weightedDifference(
  [
    { value: 150, weight: 1.0 },
    { value: 20, weight: 0.1 },
  ],
  [
    { value: 100, weight: 1.0 },
    { value: 10, weight: 0.1 },
  ],
);
// → (150*1.0 + 20*0.1) - (100*1.0 + 10*0.1) = 51
```

---

## Sorting & Comparison

### `createWeightedComparator(factors)`

Create a comparator function for stable, multi-factor sorting.

```typescript
const comparator = createWeightedComparator([
  { getValue: (item) => item.priority, weight: 10.0, order: "desc" },
  { getValue: (item) => item.timestamp, weight: 1.0, order: "desc" },
  { getValue: (item) => item.count, weight: 0.1, order: "desc" },
]);

items.sort(comparator);
```

**Use Case: EventsPanel Stable Sorting**

```typescript
// Sort by tick (primary) and count (tie-breaker)
const comparator = createWeightedComparator<AggregatedEvent>([
  { getValue: (item) => item.firstTick, weight: 1.0, order: "desc" },
  { getValue: (item) => item.count, weight: 0.01, order: "desc" },
]);

aggregated.sort(comparator);
```

**Benefits:**

- Stable ordering within time windows
- No layout thrashing
- Smooth animations
- Predictable behavior

---

## Averaging & Normalization

### `weightedAverage(factors)`

Calculate weighted average.

```typescript
weightedAverage([
  { value: 100, weight: 2 },
  { value: 50, weight: 1 },
]);
// → (100*2 + 50*1) / (2+1) = 83.33
```

### `normalizeWeights(factors)`

Normalize weights to sum to 1.0.

```typescript
normalizeWeights([
  { value: 100, weight: 10 },
  { value: 50, weight: 5 },
]);
// → [
//   { value: 100, weight: 0.667 },
//   { value: 50, weight: 0.333 },
// ]
```

### `weightedScoreNormalized(factors)`

Calculate weighted score with min/max normalization.

```typescript
weightedScoreNormalized([
  { value: 150, weight: 1.0, min: 100, max: 200 }, // → 0.5 * 1.0
  { value: 75, weight: 0.5, min: 0, max: 100 }, // → 0.75 * 0.5
]);
// → 0.5 + 0.375 = 0.875
```

---

## Time-Based Functions

### `decayWeight(initialWeight, timePassed, decayRate)`

Apply exponential decay to a weight.

```typescript
decayWeight(1.0, 100, 0.01);
// → 1.0 * e^(-0.01 * 100) ≈ 0.368
```

**Use Case: Priority Decay**

```typescript
// Older tasks lose priority over time
const priority = baseUrgency * decayWeight(1.0, age, 0.001);
```

### `createPriorityComparator(currentTime, factors, decayRate)`

Create a priority queue comparator with time decay.

```typescript
const comparator = createPriorityComparator(
  currentTick,
  [
    { getValue: (task) => task.urgency, weight: 10.0 },
    { getValue: (task) => task.importance, weight: 5.0 },
  ],
  0.01, // Decay rate
);

tasks.sort(comparator);
```

---

## Distance Functions

### `weightedManhattanDistance(pointA, pointB, weights)`

Calculate weighted Manhattan distance.

```typescript
weightedManhattanDistance([100, 50, 10], [90, 45, 12], [1.0, 0.5, 0.1]);
// → |100-90|*1.0 + |50-45|*0.5 + |10-12|*0.1 = 12.7
```

### `weightedEuclideanDistance(pointA, pointB, weights)`

Calculate weighted Euclidean distance.

```typescript
weightedEuclideanDistance([100, 50], [90, 45], [1.0, 0.5]);
// → sqrt((100-90)^2*1.0 + (50-45)^2*0.5) = 10.61
```

**Use Case: Similarity Scoring**

```typescript
// Find most similar boid based on multiple attributes
const distance = weightedEuclideanDistance(
  [boid.energy, boid.age, boid.speed],
  [target.energy, target.age, target.speed],
  [1.0, 0.5, 0.3], // Energy matters most
);
```

---

## Interpolation Functions

### `lerp(start, end, weight)`

Linear interpolation between two values.

```typescript
lerp(0, 100, 0.5); // → 50
lerp(0, 100, 0.25); // → 25
lerp(0, 100, 0.75); // → 75
```

### `inverseLerp(start, end, value, clamp?)`

Find weight for a value (inverse of lerp).

```typescript
inverseLerp(0, 100, 50); // → 0.5
inverseLerp(0, 100, 25); // → 0.25
inverseLerp(0, 100, 150); // → 1.5 (or 1.0 if clamped)
```

### `remap(value, fromMin, fromMax, toMin, toMax, clamp?)`

Remap a value from one range to another.

```typescript
remap(50, 0, 100, 0, 1); // → 0.5
remap(75, 0, 100, 0, 10); // → 7.5
remap(150, 0, 100, 0, 1); // → 1.5 (or 1.0 if clamped)
```

**Use Case: Energy to Color**

```typescript
// Map energy [0, 100] to opacity [0.3, 1.0]
const opacity = remap(boid.energy, 0, 100, 0.3, 1.0, true);
```

---

## Use Cases

### 1. Stable Event Sorting (EventsPanel)

```typescript
const comparator = createWeightedComparator<AggregatedEvent>([
  { getValue: (item) => item.firstTick, weight: 1.0, order: "desc" },
  { getValue: (item) => item.count, weight: 0.01, order: "desc" },
]);
```

**Why:** Tick is primary, count is tie-breaker. Stable order = smooth animations.

### 2. Boid Priority Selection

```typescript
// Select which boid to hunt based on multiple factors
const targetScore = weightedSum([
  { value: proximity, weight: 2.0 }, // Closer = better
  { value: energyValue, weight: 1.0 }, // More energy = better
  { value: vulnerability, weight: 0.5 }, // Weaker = better
]);
```

### 3. Food Source Scoring

```typescript
// Score food sources for foraging
const foodScore = weightedScoreNormalized([
  { value: distance, weight: 2.0, min: 0, max: 500 },
  { value: energy, weight: 1.0, min: 0, max: 100 },
  { value: competition, weight: 0.5, min: 0, max: 10 },
]);
```

### 4. Mate Selection

```typescript
// Choose mate based on multiple traits
const mateScore = weightedSum([
  { value: geneticDistance, weight: 1.0 }, // Diversity
  { value: health, weight: 0.8 }, // Fitness
  { value: proximity, weight: 0.5 }, // Convenience
]);
```

### 5. Task Scheduling

```typescript
// Schedule simulation tasks by priority
const comparator = createPriorityComparator(
  currentTick,
  [
    { getValue: (task) => task.urgency, weight: 10.0 },
    { getValue: (task) => task.cost, weight: -1.0 }, // Negative = prefer lower
  ],
  0.001, // Slight decay over time
);
```

### 6. Clustering Analysis

```typescript
// Group boids by similarity
const distance = weightedEuclideanDistance(
  [boid1.x, boid1.y, boid1.energy],
  [boid2.x, boid2.y, boid2.energy],
  [1.0, 1.0, 0.3], // Position matters more than energy
);
```

---

## Weight Selection Guidelines

### **Order of Magnitude Rule**

Use powers of 10 for clear priority levels:

```typescript
{
  primary: 10.0,    // Dominant factor
  secondary: 1.0,   // Important but less so
  tertiary: 0.1,    // Tie-breaker
  minor: 0.01,      // Fine-tuning
}
```

### **Normalization Strategy**

When factors have different scales:

```typescript
// Option 1: Use weightedScoreNormalized
weightedScoreNormalized([
  { value: distance, weight: 1.0, min: 0, max: 500 },
  { value: energy, weight: 1.0, min: 0, max: 100 },
]);

// Option 2: Pre-normalize and use weightedSum
weightedSum([
  { value: distance / 500, weight: 1.0 },
  { value: energy / 100, weight: 1.0 },
]);
```

### **Negative Weights**

Use negative weights to invert preference:

```typescript
createWeightedComparator([
  { getValue: (x) => x.benefit, weight: 1.0 }, // Higher = better
  { getValue: (x) => x.cost, weight: -0.5 }, // Higher = worse
]);
```

---

## Performance

All functions are O(n) or better:

- `weightedSum`: O(n)
- `weightedDifference`: O(n)
- `createWeightedComparator`: O(1) creation, O(n log n) when used with sort
- Distance functions: O(n) where n = dimensions

No allocations in hot paths. Pure functions = easy to optimize.

---

## Testing

```typescript
import { weightedSum, createWeightedComparator } from "@/lib/weightedMath";

// Test weighted sum
expect(
  weightedSum([
    { value: 100, weight: 1.0 },
    { value: 50, weight: 0.5 },
  ]),
).toBe(125);

// Test comparator
const items = [
  { priority: 5, count: 10 },
  { priority: 5, count: 20 },
  { priority: 10, count: 5 },
];

const comparator = createWeightedComparator([
  { getValue: (x) => x.priority, weight: 1.0 },
  { getValue: (x) => x.count, weight: 0.1 },
]);

items.sort(comparator);
expect(items[0].priority).toBe(10);
```

---

## Future Extensions

Potential additions:

- `weightedMedian()` - Weighted median calculation
- `weightedVariance()` - Weighted variance/stddev
- `sigmoidWeight()` - Sigmoid-based soft weighting
- `exponentialWeight()` - Exponential weighting curves
- `adaptiveWeights()` - Self-adjusting weights based on feedback

---

**Philosophy:** Everything is information processing. Simple rules compose. Emergence is reliable.
