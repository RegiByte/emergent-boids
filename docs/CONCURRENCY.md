# Concurrency Models

This document explains the two execution modes in Emergent Boids and when to use each.

## Overview

Emergent Boids includes two engine implementations:

1. **Browser Engine** - Single-threaded, runs entirely on main thread
2. **Worker Engine** - Multi-threaded, offloads physics to Web Worker

Both engines use identical simulation logic from `src/boids/engine/core.ts`. The only differences are environmental: where they run and how they communicate.

## Why Two Implementations?

Different use cases require different trade-offs, during the development of this project we found that running everything in the main browser thread was our primary bottleneck when we reached 1500+ boids, and thus we decided to offload all physics to another thread.

**Browser Engine:**
- Simpler architecture
- Easier to debug (all code in one thread)
- Direct event dispatching
- Good for up to ~500 boids at 60 FPS
- Default mode

**Worker Engine:**
- More complex architecture
- Physics runs in parallel
- SharedArrayBuffer for zero-copy state sync
- Scales to 5000+ boids at 60 FPS
- Frees main thread for UI and rendering

## Browser Engine Architecture

### Overview

The browser engine runs the complete simulation on the main thread.

```
Main Thread:
  ├─ Simulation Logic (boid updates, lifecycle, combat)
  ├─ Event Dispatching (births, deaths, reproductions)
  ├─ State Management (Zustand store)
  ├─ Rendering (WebGL)
  └─ UI (React components)
```

### Information Flow

```
User Input / Time
      ↓
Engine Update (main thread)
      ↓
Core Functions (pure)
  - evaluateBoidBehaviorCore()
  - processPredatorAttack()
  - applyLifecycleEventsCore()
  - updateBoidCooldowns()
      ↓
State Changes
      ↓
Event Dispatch
      ↓
Observers (analytics, atmosphere)
      ↓
React Re-render
      ↓
WebGL Rendering
```

### Implementation

```typescript
export const engine = defineResource({
  dependencies: [
    'runtimeStore',
    'profiler',
    'randomness',
    'time',
    'localBoidStore',
    'sharedMemoryManager',
    'frameRater',
  ],
  start: ({ runtimeStore, profiler, randomness, ... }) => {
    const boidsStore = localBoidStore.store;
    const engineEventSubscription = createSubscription<AllEvents>();
    
    // Update loop
    const update = (deltaTime: number) => {
      // Call core functions
      evaluateBoidBehaviorCore(boid, context, config, ...);
      processPredatorAttack(predator, nearbyPrey, config, ...);
      
      // Apply changes
      const result = applyLifecycleEventsCore(events, context);
      for (const boid of result.boidsToAdd) {
        addBoid(boid);
      }
      
      // Dispatch events
      engineEventSubscription.notify({
        type: 'boids/reproduced',
        payload: { ... }
      });
    };
    
    return { update, reset, addBoid, removeBoid };
  }
});
```

### Advantages

- **Simplicity** - All code in one place, easy to understand
- **Debugging** - Breakpoints work normally, no cross-thread complexity
- **Direct access** - No serialization, direct object references
- **Event system** - Native event dispatching, no message passing

### Limitations

- **Main thread blocking** - Simulation competes with UI and rendering
- **Scalability** - Limited to ~500 boids before frame rate drops
- **No parallelism** - Cannot utilize multiple CPU cores

### When to Use

- Development and debugging
- Smaller simulations (< 1000 boids)
- When simplicity is more important than performance
- When profiling simulation logic

## Worker Engine Architecture

### Overview

The worker engine splits simulation across two threads:

```
Main Thread:                    Worker Thread:
  ├─ UI (React)                   ├─ Physics (positions, velocities)
  ├─ Rendering (WebGL)            ├─ Flocking behavior
  ├─ Logical State                ├─ Spatial hashing
  │  (energy, health,             ├─ Combat calculations
  │   age, stance, mating)        └─ Food detection
  ├─ Event Dispatching
  └─ Message Passing
        ↕
  SharedArrayBuffer
  (zero-copy state sync)
```

### Information Flow

```
Main Thread                        Worker Thread

User Input / Time
      ↓
Send Command ──────────────────→ Receive Command
                                       ↓
                                 Engine Update
                                       ↓
                                 Core Functions (pure)
                                   - evaluateBoidBehaviorCore()
                                   - processPredatorAttack()
                                   - applyLifecycleEventsCore()
                                       ↓
                                 Write to SharedArrayBuffer
                                       ↓
Receive Event ←────────────────  Send Event
      ↓
Event Dispatch
      ↓
Observers
      ↓
React Re-render
      ↓
WebGL Rendering
(reads from SharedArrayBuffer)
```

### SharedArrayBuffer Strategy

Physical state (positions, velocities) lives in SharedArrayBuffer for zero-copy reads:

```typescript
// Worker thread writes
physicsViews.positions[boidIndex * 2] = boid.position.x;
physicsViews.positions[boidIndex * 2 + 1] = boid.position.y;
physicsViews.velocities[boidIndex * 2] = boid.velocity.x;
physicsViews.velocities[boidIndex * 2 + 1] = boid.velocity.y;

// Main thread reads (zero-copy)
const x = physicsViews.positions[boidIndex * 2];
const y = physicsViews.positions[boidIndex * 2 + 1];
```

Logical state (energy, health, age, stance) stays on main thread and syncs via messages.

### Implementation

**Main Thread (src/resources/browser/sharedEngine.ts):**

```typescript
export const sharedEngine = defineResource({
  dependencies: [
    'workerTasks',
    'runtimeStore',
    'profiler',
    'randomness',
    'localBoidStore',
    'sharedMemoryManager',
    'frameRater',
    'time',
  ],
  start: ({ workerTasks, runtimeStore, ... }) => {
    const engineChannel = createChannel<EngineCommand, EngineEvent>();
    let simulationChannel: Channel<SimulationCommand, SimulationEvent> | null = null;
    
    // Initialize worker
    const initWorker = async () => {
      const result = await workerTasks.execute('initSharedSimulation', {
        config: runtimeStore.store.getState().config,
        sharedMemory: sharedMemoryManager.getMemory('boidsPhysics'),
      });
      
      simulationChannel = result.channel;
    };
    
    // Send commands to worker
    const update = (deltaTime: number) => {
      simulationChannel?.in.send({
        type: 'step',
        payload: { deltaTime }
      });
    };
    
    // Receive events from worker
    simulationChannel?.out.subscribe((event) => {
      if (event.type === 'boids/reproduced') {
        engineEventSubscription.notify(event);
      }
    });
    
    return { update, reset, addBoid, removeBoid };
  }
});
```

**Worker Thread (src/resources/worker/workerEngine.ts):**

```typescript
export const workerEngine = defineResource({
  dependencies: [
    'workerStore',
    'workerProfiler',
    'workerTime',
    'workerRandomness',
    'workerFrameRater',
  ],
  start: ({ workerStore, workerProfiler, ... }) => {
    const boidsStore = workerStore.boids;
    let simulationChannel: Channel<SimulationCommand, SimulationEvent> | null = null;
    
    // Receive commands from main thread
    const handleCommand = (command: SimulationCommand) => {
      if (command.type === 'step') {
        update(command.payload.deltaTime);
      }
    };
    
    // Update loop
    const update = (deltaTime: number) => {
      // Call same core functions as browser engine
      evaluateBoidBehaviorCore(boid, context, config, ...);
      processPredatorAttack(predator, nearbyPrey, config, ...);
      
      // Apply changes
      const result = applyLifecycleEventsCore(events, context);
      for (const boid of result.boidsToAdd) {
        addBoid(boid);
      }
      
      // Sync to SharedArrayBuffer
      syncBoidsToSharedMemory(physicsViews, boidsStore.boids);
      
      // Send events to main thread
      simulationChannel?.out.notify({
        type: 'boids/reproduced',
        payload: { ... }
      });
    };
    
    return { update, reset, addBoid, removeBoid };
  }
});
```

### Advantages

- **Parallelism** - Physics runs on separate CPU core
- **Main thread freed** - More time for UI and rendering
- **Scalability** - Handles 5000+ boids at 60 FPS
- **Zero-copy reads** - SharedArrayBuffer avoids serialization overhead

### Limitations

- **Complexity** - Two threads, message passing, SharedArrayBuffer
- **Debugging** - Harder to debug across thread boundary
- **Serialization** - Messages must be serializable (no functions, no circular refs)
- **Browser support** - Requires SharedArrayBuffer support

### When to Use

- Production deployments
- Large simulations (> 500 boids)
- When performance is critical
- When main thread is saturated

## Core Module: Single Source of Truth

Both engines use identical simulation logic from `src/boids/engine/core.ts`.

### Core Functions

```typescript
// Behavior evaluation
export const evaluateBoidBehaviorCore = (
  boid: Boid,
  context: BoidUpdateContext,
  config: ConfigContext,
  behaviorRuleset: BehaviorRuleset,
  currentFrame: number,
  boidsCount: number,
  profiler?: Profiler
): void => { /* ... */ }

// Combat system
export const processPredatorAttack = (
  predator: Boid,
  nearbyPrey: ItemWithDistance<Boid>[],
  config: ConfigContext,
  lifecycleCollector: LifecycleCollector
): void => { /* ... */ }

// Cooldown management
export const updateBoidCooldowns = (
  boid: Boid,
  config: ConfigContext
): void => { /* ... */ }

// Lifecycle event application
export const applyLifecycleEventsCore = (
  events: LifecycleEvent[],
  context: { /* ... */ }
): LifecycleApplicationResult => { /* ... */ }

// Food management
export const generatePreyFoodBatch = (
  currentFood: FoodSource[],
  world: WorldConfig,
  currentFrame: number,
  rng: DomainRNG,
  timestamp: number
): FoodSource[] => { /* ... */ }
```

### Benefits

- **Zero duplication** - Write logic once, use in both engines
- **Zero drift** - Impossible for engines to diverge
- **Single place to fix bugs** - Fix once, both benefit
- **Single place to optimize** - Optimize once, both benefit
- **Easier testing** - Test core functions once

## Performance Comparison

### Browser Engine

**Configuration:** 500 boids, 60 FPS target

```
Frame Budget: 16.67ms
  - Simulation: ~8ms
  - Rendering: ~6ms
  - UI/React: ~2ms
  - Margin: ~0.67ms
```

**Bottleneck:** Simulation competes with rendering and UI on main thread.

### Worker Engine

**Configuration:** 5000 boids, 60 FPS target

```
Main Thread Frame Budget: 16.67ms
  - Rendering: ~10ms
  - UI/React: ~4ms
  - Message passing: ~1ms
  - Margin: ~1.67ms

Worker Thread (parallel):
  - Simulation: ~14ms
  - Spatial hashing: ~2ms
  - SharedArrayBuffer sync: ~0.5ms
```

**Benefit:** Simulation runs in parallel, freeing 12ms on main thread.

### Scaling

| Boids | Browser Engine | Worker Engine |
|-------|---------------|---------------|
| 100   | 60 FPS        | 60 FPS        |
| 500   | 60 FPS        | 60 FPS        |
| 1000  | ~45 FPS       | 60 FPS        |
| 2000  | ~25 FPS       | 60 FPS        |
| 5000  | ~10 FPS       | 60 FPS        |

## Switching Between Engines

The system composition determines which engine is used:

**Browser Engine (default):**

```typescript
// src/systems/browser.ts
export const browserSystemConfig = () => ({
  config,
  runtimeStore,
  runtimeController,
  profiler,
  randomness,
  time,
  localBoidStore,
  sharedMemoryManager,
  frameRater,
  engine,  // Single-threaded engine
  lifecycleManager,
  canvas,
  renderer,
  // ... other resources
});
```

**Worker Engine:**

```typescript
// src/systems/worker.ts
export const workerSystemConfig = () => ({
  config,
  runtimeStore,
  runtimeController,
  profiler,
  randomness,
  time,
  localBoidStore,
  sharedMemoryManager,
  frameRater,
  workerTasks,
  sharedEngine,  // Multi-threaded engine
  lifecycleManager,
  canvas,
  renderer,
  // ... other resources
});
```

## Technical Details

### Message Passing

Worker engine uses channels for bidirectional communication:

```typescript
// Command types (main → worker)
type SimulationCommand = 
  | { type: 'step', payload: { deltaTime: number } }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'addBoid', payload: { boid: Boid } }
  | { type: 'removeBoid', payload: { boidId: string } };

// Event types (worker → main)
type SimulationEvent =
  | { type: 'boids/reproduced', payload: { ... } }
  | { type: 'boids/died', payload: { ... } }
  | { type: 'boids/caught', payload: { ... } }
  | { type: 'stats/updated', payload: { ... } };
```

### SharedArrayBuffer Layout

Physical state is packed into typed arrays:

```typescript
interface SharedBoidViews {
  positions: Float32Array;      // [x0, y0, x1, y1, ...]
  velocities: Float32Array;     // [vx0, vy0, vx1, vy1, ...]
  accelerations: Float32Array;  // [ax0, ay0, ax1, ay1, ...]
  stats: Uint32Array;           // [aliveCount, frameCount, ...]
}
```

**Memory Layout:**

```
Positions:      [x0][y0][x1][y1]...[xN][yN]
Velocities:     [vx0][vy0][vx1][vy1]...[vxN][vyN]
Accelerations:  [ax0][ay0][ax1][ay1]...[axN][ayN]
Stats:          [aliveCount][frameCount][simulationTimeMs]
```

### Synchronization

Worker writes to SharedArrayBuffer after each update:

```typescript
function syncBoidsToSharedMemory(
  views: SharedBoidViews,
  boids: Boid[]
): void {
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    views.positions[i * 2] = boid.position.x;
    views.positions[i * 2 + 1] = boid.position.y;
    views.velocities[i * 2] = boid.velocity.x;
    views.velocities[i * 2 + 1] = boid.velocity.y;
  }
}
```

Main thread reads from SharedArrayBuffer during rendering (zero-copy).

## Debugging

### Browser Engine

Standard debugging works:

```javascript
// Set breakpoints in engine.ts
const update = (deltaTime: number) => {
  debugger;  // Works normally
  evaluateBoidBehaviorCore(boid, context, config, ...);
};
```

### Worker Engine

Debugging requires worker-specific tools:

```javascript
// In worker thread
console.log('[Worker]', 'Update', deltaTime);

// In main thread
simulationChannel?.out.subscribe((event) => {
  console.log('[Main] Received event:', event);
});
```

Chrome DevTools supports worker debugging:

1. Open DevTools
2. Go to Sources tab
3. Find worker thread in thread list
4. Set breakpoints in worker code

## Further Reading

- [Architecture](ARCHITECTURE.md) - System design and patterns
- [Genetics System](GENETICS.md) - How evolution works
- [Boids Algorithm](BOIDS_ALGORITHM.md) - Reynolds' work and extensions

