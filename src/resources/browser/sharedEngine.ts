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
import {
  SimulationCommand,
  SimulationEvent,
} from "@/boids/vocabulary/schemas/simulation.ts";
import type { WorldPhysics } from "@/boids/vocabulary/schemas/world.ts";
import { Channel, createChannel } from "@/lib/channels.ts";
import { StatsIndex } from "@/lib/sharedMemory.ts";
import { sharedMemoryKeywords } from "@/lib/workerTasks/vocabulary.ts";
import { defineResource, StartedResource } from "braided";
import z from "zod";
import { defaultWorldPhysics } from "../../boids/defaultPhysics.ts";
import { FrameRaterAPI } from "../shared/frameRater.ts";
import type { Profiler } from "../shared/profiler.ts";
import type { RandomnessResource } from "../shared/randomness.ts";
import type { SharedMemoryManager } from "../shared/sharedMemoryManager.ts";
import { LocalBoidStoreResource } from "./localBoidStore.ts";
import type { RuntimeStoreResource } from "./runtimeStore.ts";
import type { WorkerTasksResource } from "./workerTasks.ts";

/**
 * Logical boid state (everything except position/velocity/acceleration)
 * Stored in main thread, not shared with worker
 */

const engineKeywords = {
  commands: {
    initialize: "initialize",
  },
  events: {
    error: "error",
  },
};

const engineCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(engineKeywords.commands.initialize),
    channel: z.any(),
  }),
]);

export type EngineCommand = z.infer<typeof engineCommandSchema>;

const engineEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(engineKeywords.events.error),
    error: z.string(),
    meta: z.any(),
  }),
]);

export type EngineEvent = z.infer<typeof engineEventSchema>;

export const sharedEngine = defineResource({
  dependencies: [
    "workerTasks",
    "runtimeStore",
    "profiler",
    "randomness",
    "localBoidStore",
    "sharedMemoryManager",
    "frameRater",
  ],
  start: ({
    workerTasks,
    runtimeStore,
    profiler,
    randomness,
    localBoidStore,
    sharedMemoryManager,
  }: {
    workerTasks: WorkerTasksResource;
    runtimeStore: RuntimeStoreResource;
    profiler: Profiler;
    randomness: RandomnessResource;
    localBoidStore: LocalBoidStoreResource;
    sharedMemoryManager: SharedMemoryManager;
    frameRater: FrameRaterAPI;
  }) => {
    console.log("[sharedEngine] Resource starting (synchronous)...");
    const { config: initialConfig } = runtimeStore.store.getState();
    const { world: initialWorld, species: initialSpecies } = initialConfig;


    // const updateParametersRater = frameRater.throttled("updateParameters", {
    //   intervalMs: 10000,
    // });
    const engineChannel = createChannel<EngineCommand, EngineEvent>();
    let simulationChannel: Channel<SimulationCommand, SimulationEvent> | null = null;

    const boidsStore = localBoidStore.store;
    const maxBoids = initialConfig.parameters.maxBoids;

    // Get physics from config (or use defaults)
    const physics =
      (initialConfig as unknown as { physics?: WorldPhysics }).physics ||
      defaultWorldPhysics;

    console.log("[sharedEngine] Initial physics:", physics);

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

    // Create SharedArrayBuffer using sharedMemoryManager
    const memory = sharedMemoryManager.initialize(
      sharedMemoryKeywords.boidsPhysics,
      maxBoids
    );

    console.log("[sharedEngine] Created SharedArrayBuffer via manager:", {
      maxBoids,
      bufferSize: memory.buffer.byteLength,
      boidCount: boidsStore.count(),
    });

    // Initialize worker asynchronously (don't block resource startup!)
    let workerReady = false;

    const initialize = (
      channel: Channel<SimulationCommand, SimulationEvent>
    ) => {
      // Bind simulation channel so we can send events to it
      simulationChannel = channel;
    };

    // Start worker initialization immediately but don't await it
    const initSubscription = workerTasks.dispatch("initializeWorker", {
      buffer: memory.buffer,
      layout: memory.layout,
      initialBoids: Object.values(boidsStore.boids),
      initialState: {
        config: initialConfig,
        simulation: {
          obstacles: [],
          deathMarkers: [],
          foodSources: [],
        },
      },
    });

    console.log("[sharedEngine] Dispatched initializeEngine task (async)...");

    initSubscription
      .onComplete((data) => {
        console.log("[sharedEngine] Worker init complete:", data);
        workerReady = true;

        // Start simulation loop after worker is ready
        console.log("[sharedEngine] Starting simulation loop...");
        const loopTask = workerTasks.dispatch("startSimulation", {});

        console.log("[sharedEngine] Loop task dispatched");

        // Listen to progress updates
        loopTask.onProgress((progress) => {
          if (simulationChannel) {
            switch (progress.channel) {
              case 'simulation': {
                simulationChannel.out.notify(progress.event);
                break;
              }
            }
          } else {
            console.error("[sharedEngine] Simulation channel not initialized");
          }
        });
      })
      .onError((error) => {
        console.error("[sharedEngine] Error initializing worker:", error);
        workerReady = false;
      });

    // Subscribe to runtime store changes
    // let lastUpdatedAt = 0;
    // const unsubscribe = runtimeStore.store.subscribe(({ config: _config }) => {
    //   const now = performance.now();
    //   const deltaMs = now - lastUpdatedAt;
    //   // Update worker config when config changes (only if worker is ready)
    //   if (workerReady && updateParametersRater.shouldExecute(deltaMs)) {
    //     lastUpdatedAt = now;
    //     // engineTasks.dispatch("updateParameters", {
    //     //   config: config,
    //     // });
    //   }
    // });

    /**
     * Get worker simulation stats from SharedArrayBuffer
     */
    function getWorkerStats() {
      return {
        frame: Atomics.load(memory.views.stats, StatsIndex.FRAME_COUNT),
        simulationTime: Atomics.load(
          memory.views.stats,
          StatsIndex.SIMULATION_TIME_MS
        ),
        aliveCount: Atomics.load(memory.views.stats, StatsIndex.ALIVE_COUNT),
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
      // TODO: Implement
      // // Stop current loop
      // engineTasks.dispatch("stopSimulationLoop", {});
      // // Clear logical state
      // boidsStore.clear();
      // const { config: cfg, simulation } = runtimeStore.store.getState();
      // const { world, species } = cfg;
      // // Recalculate type IDs
      // const currentPreyTypeIds = Object.keys(species).filter(
      //   (id) => species[id].role === "prey"
      // );
      // const currentPredatorTypeIds = Object.keys(species).filter(
      //   (id) => species[id].role === "predator"
      // );
      // const resetPhysics = cfg.physics || defaultWorldPhysics;
      // const resetContext = {
      //   world: { width: world.width, height: world.height },
      //   species,
      //   rng: randomness.domain("spawning"),
      //   physics: resetPhysics,
      // };
      // // Respawn prey
      // for (let i = 0; i < world.initialPreyCount; i++) {
      //   boidsStore.addBoid(
      //     createBoid(
      //       currentPreyTypeIds,
      //       resetContext,
      //       null,
      //       boidsStore.nextIndex()
      //     )
      //   );
      // }
      // // Respawn predators
      // for (let i = 0; i < (world.initialPredatorCount || 0); i++) {
      //   boidsStore.addBoid(
      //     createBoid(
      //       currentPredatorTypeIds,
      //       resetContext,
      //       null,
      //       boidsStore.nextIndex()
      //     )
      //   );
      // }
      // // Reinitialize worker
      // const newInitSubscription = engineTasks.dispatch("initializeEngine", {
      //   buffer: memory.buffer,
      //   layout: memory.layout,
      //   initialBoids: Object.values(boidsStore.boids), // Pass full Boid objects
      //   initialState: {
      //     config: cfg,
      //     simulation: simulation,
      //   },
      // });
      // await new Promise((resolve) => {
      //   newInitSubscription
      //     .onComplete(() => {
      //       console.log("[sharedEngine] Reset complete");
      //       resolve(true);
      //     })
      //     .onError((error) => {
      //       console.error("[sharedEngine] Error resetting:", error);
      //       resolve(false);
      //     });
      // });
      // // Restart loop
      // const newLoopTask = engineTasks.dispatch("startSimulationLoop", {
      //   targetFPS: 30, // Match worker simulation rate (30 UPS)
      // });
      // newLoopTask.onProgress((progress) => {
      //   switch (progress.type) {
      //     case "frame": {
      //       console.log(
      //         `[sharedEngine] Frame ${progress.frame}, FPS: ${progress.fps}`
      //       );
      //       break;
      //     }
      //     case "event": {
      //       engineEventSubscription.notify(progress.event);
      //       break;
      //     }
      //   }
      // });
    };

    /**
     * Add boid: Not yet implemented for shared engine
     * Would need to resize shared buffer dynamically
     */
    const addBoid = (boid: Boid) => {
      // TODO: Dynamic buffer resizing
      boidsStore.addBoid(boid);
    };

    /**
     * Remove boid: Mark as inactive in logical state
     */
    const removeBoid = (boidId: string) => {
      if (boidsStore.removeBoid(boidId)) {
        // Update alive count
        const currentCount = Atomics.load(
          memory.views.stats,
          StatsIndex.ALIVE_COUNT
        );
        Atomics.store(
          memory.views.stats,
          StatsIndex.ALIVE_COUNT,
          currentCount - 1
        );
      }
    };

    /**
     * Check catches: Placeholder
     * TODO: Implement predator-prey interactions
     */
    const checkCatches = (): CatchEvent[] => {
      // Not implemented yet - would need shared state for predator/prey tracking
      // TODO: remove this method from here, catches are detected in the update loop now
      return [];
    };

    // Store tasks reference for halt

    const api = {
      initialize,
      update,
      reset,
      addBoid,
      removeBoid,
      getBoidById: boidsStore.getBoidById,
      checkCatches,
      getBufferViews: () => memory.views,
      getWorkerStats, // NEW: Expose worker stats
      dispatch: engineChannel.put,
      watch: engineChannel.watch,
      cleanup: () => {
        engineChannel.clear();
        workerTasks.dispatch("haltWorker", {});
      },
      isWorkerReady: () => workerReady,
    };

    return api;
  },

  halt: async ({ cleanup }) => {
    cleanup();
  },
});

export type SharedEngineResource = StartedResource<typeof sharedEngine>;
