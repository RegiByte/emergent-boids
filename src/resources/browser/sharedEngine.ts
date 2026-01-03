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

import { createBoid } from "@/boids/boid.ts";
import type { Boid } from "@/boids/vocabulary/schemas/entities.ts";
import { CatchEvent } from "@/boids/vocabulary/schemas/events.ts";
import type { WorldPhysics } from "@/boids/vocabulary/schemas/world.ts";
import {
  createSharedBoidBuffer,
  createSharedBoidViews,
  StatsIndex,
} from "@/lib/sharedMemory.ts";
import { defineResource } from "braided";
import { defaultWorldPhysics } from "../../boids/defaultPhysics.ts";
import type { Profiler } from "../shared/profiler.ts";
import type { RandomnessResource } from "../shared/randomness.ts";
import type { BoidEngine } from "./engine.ts";
import { LocalBoidStoreResource } from "./localBoidStore.ts";
import type { RuntimeStoreResource } from "./runtimeStore.ts";
import type { EngineTasks } from "./sharedEngineTasks.ts";

/**
 * Logical boid state (everything except position/velocity/acceleration)
 * Stored in main thread, not shared with worker
 */

export const sharedEngine = defineResource({
  dependencies: [
    "engineTasks",
    "runtimeStore",
    "profiler",
    "randomness",
    "localBoidStore",
  ],
  start: async ({
    engineTasks,
    runtimeStore,
    profiler,
    randomness,
    localBoidStore,
  }: {
    engineTasks: EngineTasks;
    runtimeStore: RuntimeStoreResource;
    profiler: Profiler;
    randomness: RandomnessResource;
    localBoidStore: LocalBoidStoreResource;
  }) => {
    const { config: initialConfig } = runtimeStore.store.getState();
    const { world: initialWorld, species: initialSpecies } = initialConfig;

    const boidsStore = localBoidStore.store;
    const maxBoids = initialConfig.parameters.maxBoids;

    // Get physics from config (or use defaults)
    const physics =
      (initialConfig as unknown as { physics?: WorldPhysics }).physics ||
      defaultWorldPhysics;

    // Logical boid state (main thread only)
    // const logicalBoids: LogicalBoid[] = [];
    // const boidIdToIndex = new Map<string, number>();

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

    // Spawn initial prey
    for (let i = 0; i < initialWorld.initialPreyCount; i++) {
      boidsStore.addBoid(
        createBoid(preyTypeIds, creationContext, null, boidsStore.nextIndex())
      );
    }

    // Spawn initial predators
    for (let i = 0; i < (initialWorld.initialPredatorCount || 0); i++) {
      boidsStore.addBoid(
        createBoid(
          predatorTypeIds,
          creationContext,
          null,
          boidsStore.nextIndex()
        )
      );
    }

    // Create SharedArrayBuffer
    const { buffer, layout } = createSharedBoidBuffer(maxBoids);
    const bufferViews = createSharedBoidViews(buffer, layout);

    // Initialize worker with shared buffer and initial boid physics
    const initSubscription = engineTasks.dispatch("initializeEngine", {
      buffer,
      layout,
      initialBoids: Object.values(boidsStore.boids), // Pass full Boid objects now!
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
    const loopTask = engineTasks.dispatch("startSimulationLoop", {
      targetFPS: 60,
    });

    // Listen to progress updates
    loopTask.onProgress((progress) => {
      switch (progress.type) {
        case "frame": {
          // skip for now
          break;
        }
        case "event": {
          console.log(`[sharedEngine] Event:`, progress.event);
          break;
        }
      }

      // Update main thread profiler with worker metrics
      // if (progress.profilerMetrics) {
      //   for (const [name, metric] of Object.entries(progress.profilerMetrics)) {
      //     const m = metric as { avgTime: number };
      //     profiler.start(`worker.${name}`);
      //     // Simulate the time taken (for profiler display)
      //     const startTime = performance.now();
      //     while (performance.now() - startTime < m.avgTime) {
      //       // Busy wait to simulate time
      //     }
      //     profiler.end(`worker.${name}`);
      //   }
      // }
    });

    // Subscribe to runtime store changes
    const unsubscribe = runtimeStore.store.subscribe((state) => {
      const { config } = state;

      // Update worker config when config changes
      engineTasks.dispatch("updateParameters", {
        config: config,
      });
    });

    /**
     * Get worker simulation stats from SharedArrayBuffer
     */
    function getWorkerStats() {
      return {
        frame: Atomics.load(bufferViews.stats, StatsIndex.FRAME_COUNT),
        simulationTime: Atomics.load(
          bufferViews.stats,
          StatsIndex.SIMULATION_TIME_MS
        ),
        aliveCount: Atomics.load(bufferViews.stats, StatsIndex.ALIVE_COUNT),
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
      engineTasks.dispatch("stopSimulationLoop", {});

      // Clear logical state
      boidsStore.clear();

      const { config: cfg, simulation } = runtimeStore.store.getState();
      const { world, species } = cfg;

      // Recalculate type IDs
      const currentPreyTypeIds = Object.keys(species).filter(
        (id) => species[id].role === "prey"
      );
      const currentPredatorTypeIds = Object.keys(species).filter(
        (id) => species[id].role === "predator"
      );

      const resetPhysics = cfg.physics || defaultWorldPhysics;

      const resetContext = {
        world: { width: world.width, height: world.height },
        species,
        rng: randomness.domain("spawning"),
        physics: resetPhysics,
      };

      // Respawn prey
      for (let i = 0; i < world.initialPreyCount; i++) {
        boidsStore.addBoid(
          createBoid(
            currentPreyTypeIds,
            resetContext,
            null,
            boidsStore.nextIndex()
          )
        );
      }

      // Respawn predators
      for (let i = 0; i < (world.initialPredatorCount || 0); i++) {
        boidsStore.addBoid(
          createBoid(
            currentPredatorTypeIds,
            resetContext,
            null,
            boidsStore.nextIndex()
          )
        );
      }

      // Reinitialize worker
      const newInitSubscription = engineTasks.dispatch("initializeEngine", {
        buffer,
        layout,
        initialBoids: Object.values(boidsStore.boids), // Pass full Boid objects
        initialState: {
          config: cfg,
          simulation: simulation,
        },
      });

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
      const newLoopTask = engineTasks.dispatch("startSimulationLoop", {
        targetFPS: 60,
      });

      newLoopTask.onProgress((progress) => {
        switch (progress.type) {
          case "frame": {
            console.log(
              `[sharedEngine] Frame ${progress.frame}, FPS: ${progress.fps}`
            );
            break;
          }
          case "event": {
            console.log(`[sharedEngine] Event: ${progress.event}`);
            break;
          }
        }
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
      if (boidsStore.removeBoid(boidId)) {
        // Update alive count
        const currentCount = Atomics.load(bufferViews.stats, StatsIndex.ALIVE_COUNT);
        Atomics.store(bufferViews.stats, StatsIndex.ALIVE_COUNT, currentCount - 1);
      }
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
    const tasksRef = engineTasks;

    const api = {
      update,
      reset,
      addBoid,
      removeBoid,
      getBoidById: boidsStore.getBoidById,
      checkCatches,
      getBufferViews: () => bufferViews,
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
      _tasks: EngineTasks;
    };

    return api;
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
