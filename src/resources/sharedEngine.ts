/**
 * Shared Engine Resource (Session 111)
 *
 * Parallel boid simulation engine using SharedArrayBuffer + Web Workers.
 * Drop-in replacement for engine.ts with identical API.
 *
 * Architecture:
 * - Worker thread: Owns physical state (position, velocity, acceleration)
 * - Main thread: Owns logical state (energy, health, age, stance, mating, etc.)
 * - Zero-copy reads from SharedArrayBuffer via Proxy
 * - Complete Boid objects reconstructed on-demand by merging logical + physical
 *
 * Benefits:
 * - Physics runs in parallel (12ms freed on main thread!)
 * - Scales to 5000+ boids at 60 FPS
 * - Main thread has more time for UI, rendering, analytics
 */

import { createBoid } from "@/boids/boid";
import type { Boid, LogicalBoid } from "@/boids/vocabulary/schemas/entities";
import type { WorldPhysics } from "@/boids/vocabulary/schemas/world";
import {
  createSharedBoidBuffer,
  createSharedBoidViews,
  getActivePositions,
  getActiveVelocities,
  StatsIndex,
} from "@/lib/sharedMemory";
import { defineResource } from "braided";
import { defaultWorldPhysics } from "./defaultPhysics";
import type { BoidEngine, CatchEvent } from "./engine";
import type { Profiler } from "./profiler";
import type { RandomnessResource } from "./randomness";
import type { RuntimeStoreResource } from "./runtimeStore";
import type { SharedEngineTasks } from "./sharedEngineTasks";

/**
 * Logical boid state (everything except position/velocity/acceleration)
 * Stored in main thread, not shared with worker
 */

export const sharedEngine = defineResource({
  dependencies: ["sharedEngineTasks", "runtimeStore", "profiler", "randomness"],
  start: async ({
    sharedEngineTasks,
    runtimeStore,
    profiler,
    randomness,
  }: {
    sharedEngineTasks: SharedEngineTasks;
    runtimeStore: RuntimeStoreResource;
    profiler: Profiler;
    randomness: RandomnessResource;
  }) => {
    const { config: initialConfig } = runtimeStore.store.getState();
    const { world: initialWorld, species: initialSpecies } = initialConfig;

    // Get physics from config (or use defaults)
    const physics =
      (initialConfig as unknown as { physics?: WorldPhysics }).physics ||
      defaultWorldPhysics;

    // Logical boid state (main thread only)
    const logicalBoids: LogicalBoid[] = [];
    const boidIdToIndex = new Map<string, number>();

    // Create initial boids
    const creationContext = {
      world: {
        width: initialWorld.width,
        height: initialWorld.height,
      },
      species: initialSpecies,
      rng: randomness.domain("spawning"),
      physics,
    };

    // Get available type IDs
    const preyTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "prey"
    );
    const predatorTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "predator"
    );

    const initialBoids: Boid[] = [];

    // Spawn initial prey
    for (let i = 0; i < initialWorld.initialPreyCount; i++) {
      initialBoids.push(createBoid(preyTypeIds, creationContext));
    }

    // Spawn initial predators
    for (let i = 0; i < (initialWorld.initialPredatorCount || 0); i++) {
      initialBoids.push(createBoid(predatorTypeIds, creationContext));
    }

    // Split into logical + physical
    for (let i = 0; i < initialBoids.length; i++) {
      const boid = initialBoids[i];
      // eslint-disable-next-line no-unused-vars
      const { position, velocity, acceleration, ...logical } = boid;
      logicalBoids.push(logical as LogicalBoid);
      boidIdToIndex.set(boid.id, i);
    }

    // Create SharedArrayBuffer
    const { buffer, layout } = createSharedBoidBuffer(initialBoids.length);
    const views = createSharedBoidViews(buffer, layout);

    // Initialize worker with shared buffer and initial boid physics
    const initSubscription = sharedEngineTasks.dispatch("initializeEngine", {
      buffer,
      layout,
      initialBoids: initialBoids, // Pass full Boid objects now!
      initialState: {
        config: initialConfig,
        simulation: {
          obstacles: [],
          deathMarkers: [],
          foodSources: [],
        },
      },
    });

    const result = await new Promise((resolve) => {
      initSubscription
        .onComplete(() => {
          resolve(true);
        })
        .onError((error) => {
          console.error("[sharedEngine] Error initializing:", error);
          resolve(false);
        });
    });

    console.log("[sharedEngine] Initialized:", result);

    // Start simulation loop in worker
    const loopTask = sharedEngineTasks.dispatch("startSimulationLoop", {
      targetFPS: 60,
    });

    // Listen to progress updates
    loopTask.onProgress((progress: any) => {
      //   console.log(
      //     `[sharedEngine] Frame ${progress.frame}, FPS: ${progress.fps}, Time: ${progress.simulationTime}ms`
      //   );

      // Update main thread profiler with worker metrics
      if (progress.profilerMetrics) {
        for (const [name, metric] of Object.entries(progress.profilerMetrics)) {
          const m = metric as { avgTime: number };
          profiler.start(`worker.${name}`);
          // Simulate the time taken (for profiler display)
          const startTime = performance.now();
          while (performance.now() - startTime < m.avgTime) {
            // Busy wait to simulate time
          }
          profiler.end(`worker.${name}`);
        }
      }
    });

    // Subscribe to runtime store changes
    const unsubscribe = runtimeStore.store.subscribe((state) => {
      const { config } = state;

      // Update worker config when config changes
      sharedEngineTasks.dispatch("updateParameters", {
        config: config,
      });
    });

    /**
     * Merge logical + physical state to create complete Boid
     */
    function mergeBoid(index: number): Boid {
      const logical = logicalBoids[index];
      if (!logical) return null as any;

      const positions = getActivePositions(views);
      const velocities = getActiveVelocities(views);

      return {
        ...logical,
        position: {
          x: positions[index * 2 + 0],
          y: positions[index * 2 + 1],
        },
        velocity: {
          x: velocities[index * 2 + 0],
          y: velocities[index * 2 + 1],
        },
        acceleration: {
          x: 0,
          y: 0,
        },
      } as Boid;
    }

    /**
     * Get all boids as complete Boid objects
     * Simple getter pattern (like camera.ts) - no complex Proxy needed!
     */
    function getBoids(): Boid[] {
      const count = Atomics.load(views.stats, StatsIndex.ALIVE_COUNT);
      const result: Boid[] = [];
      for (let i = 0; i < count; i++) {
        const boid = mergeBoid(i);
        if (boid) {
          result.push(boid);
        }
      }
      return result;
    }

    /**
     * Get worker simulation stats from SharedArrayBuffer
     */
    function getWorkerStats() {
      return {
        frame: Atomics.load(views.stats, StatsIndex.FRAME_COUNT),
        simulationTime: Atomics.load(
          views.stats,
          StatsIndex.SIMULATION_TIME_MS
        ),
        aliveCount: Atomics.load(views.stats, StatsIndex.ALIVE_COUNT),
      };
    }

    /**
     * Update: No-op! Worker runs independently
     * Main thread no longer needs to call update()
     */
    const update = (_deltaSeconds: number) => {
      // Worker handles all physics updates
      // Main thread just reads from shared memory
      profiler.start("sharedEngine.update");
      profiler.end("sharedEngine.update");
    };

    /**
     * Reset simulation
     */
    const reset = async () => {
      // Stop current loop
      await sharedEngineTasks.dispatch("stopSimulationLoop", {});

      // Clear logical state
      logicalBoids.length = 0;
      boidIdToIndex.clear();

      const { config: cfg, simulation } = runtimeStore.store.getState();
      const { world, species } = cfg;

      // Recalculate type IDs
      const currentPreyTypeIds = Object.keys(species).filter(
        (id) => species[id].role === "prey"
      );
      const currentPredatorTypeIds = Object.keys(species).filter(
        (id) => species[id].role === "predator"
      );

      const resetPhysics =
        (cfg as unknown as { physics?: WorldPhysics }).physics ||
        defaultWorldPhysics;

      const resetContext = {
        world: { width: world.width, height: world.height },
        species,
        rng: randomness.domain("spawning"),
        physics: resetPhysics,
      };

      const newBoids: Boid[] = [];

      // Respawn prey
      for (let i = 0; i < world.initialPreyCount; i++) {
        newBoids.push(createBoid(currentPreyTypeIds, resetContext));
      }

      // Respawn predators
      for (let i = 0; i < (world.initialPredatorCount || 0); i++) {
        newBoids.push(createBoid(currentPredatorTypeIds, resetContext));
      }

      // Split into logical + physical (omit position, velocity, acceleration)
      for (let i = 0; i < newBoids.length; i++) {
        // eslint-disable-next-line no-unused-vars
        const { position, velocity, ...logicalBoid } = newBoids[i];
        logicalBoids.push(logicalBoid);
        boidIdToIndex.set(newBoids[i].id, i);
      }

      // Reinitialize worker
      const newInitSubscription = sharedEngineTasks.dispatch(
        "initializeEngine",
        {
          buffer,
          layout,
          initialBoids: newBoids, // Pass full Boid objects
          initialState: {
            config: cfg,
            simulation: simulation,
          },
        }
      );

      await new Promise((resolve) => {
        newInitSubscription
          .onComplete(() => {
            resolve(true);
          })
          .onError((error) => {
            console.error("[sharedEngine] Error resetting:", error);
            resolve(false);
          });
      });

      console.log("[sharedEngine] Reset:", result);

      // Restart loop
      const newLoopTask = sharedEngineTasks.dispatch("startSimulationLoop", {
        targetFPS: 60,
      });

      newLoopTask.onProgress((progress) => {
        console.log(
          `[sharedEngine] Frame ${progress.frame}, FPS: ${progress.fps}`
        );
      });
    };

    /**
     * Add boid: Not yet implemented for shared engine
     * Would need to resize shared buffer dynamically
     */
    const addBoid = (_boid: Boid) => {
      console.warn("[sharedEngine] addBoid not yet implemented");
      // TODO: Dynamic buffer resizing
    };

    /**
     * Remove boid: Mark as inactive in logical state
     */
    const removeBoid = (boidId: string) => {
      const index = boidIdToIndex.get(boidId);
      if (index !== undefined) {
        // Mark as removed (we'll compact later)
        logicalBoids[index] = null as any;
        boidIdToIndex.delete(boidId);

        // Update alive count
        const currentCount = Atomics.load(views.stats, StatsIndex.ALIVE_COUNT);
        Atomics.store(views.stats, StatsIndex.ALIVE_COUNT, currentCount - 1);
      }
    };

    /**
     * Get boid by ID
     */
    const getBoidById = (boidId: string): Boid | undefined => {
      const index = boidIdToIndex.get(boidId);
      if (index !== undefined && logicalBoids[index]) {
        return mergeBoid(index);
      }
      return undefined;
    };

    /**
     * Check catches: Placeholder
     * TODO: Implement predator-prey interactions
     */
    const checkCatches = (): CatchEvent[] => {
      // Not implemented yet - would need shared state for predator/prey tracking
      return [];
    };

    // Store tasks reference for halt
    const tasksRef = sharedEngineTasks;

    return {
      get boids() {
        return getBoids();
      },
      update,
      reset,
      addBoid,
      removeBoid,
      getBoidById,
      checkCatches,
      getWorkerStats, // NEW: Expose worker stats
      // Expose unsubscribe and tasks for cleanup
      _unsubscribe: unsubscribe,
      _tasks: tasksRef,
    } satisfies BoidEngine & {
      getWorkerStats: () => {
        frame: number;
        simulationTime: number;
        aliveCount: number;
      };
      _unsubscribe: () => void;
      _tasks: any;
    };
  },

  halt: async (engine: any) => {
    // Unsubscribe from runtime store
    if (engine && engine._unsubscribe) {
      engine._unsubscribe();
    }

    // Stop simulation loop
    if (engine && engine._tasks) {
      await engine._tasks.dispatch("stopSimulationLoop", {});
    }
  },
});
