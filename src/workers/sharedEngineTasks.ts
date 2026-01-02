/**
 * Shared Engine Worker Tasks (Session 111)
 *
 * Worker-side simulation tasks for parallel boid physics.
 * Handles pure physics computation (positions, velocities, flocking)
 * while main thread manages logical state (lifecycle, mating, etc.)
 *
 * Core Philosophy:
 * - Worker owns physical state (position, velocity, acceleration)
 * - Main thread owns logical state (energy, health, age, stance, etc.)
 * - Zero-copy communication via SharedArrayBuffer
 * - Supports pause/resume and manual stepping for debugging
 */

import { z } from "zod";
import { defineTask } from "@/lib/workerTasks/core";
import type {
  SharedBoidBufferLayout,
  SharedBoidViews,
} from "@/lib/sharedMemory";
import {
  createSharedBoidViews,
  swapBuffers,
  getInactivePositions,
  getInactiveVelocities,
  StatsIndex,
} from "@/lib/sharedMemory";
import {
  defineResource,
  haltSystem,
  StartedResource,
  StartedSystem,
  startSystem,
} from "braided";
import { boidSchema, type Boid } from "@/boids/vocabulary/schemas/entities";
import { time } from "@/resources/time";
import { profiler } from "@/resources/profiler";
import { randomness } from "@/resources/randomness";
import {
  createAtom,
  createSubscription,
  SubscriptionCallback,
} from "@/lib/state";
import { updateBoid } from "@/boids/boid";
import type { BoidUpdateContext } from "@/boids/context";
import {
  createSpatialHash,
  getNearbyBoids,
  insertBoids,
} from "@/boids/spatialHash";

import {
  RuntimeStore,
  runtimeStoreSchema,
} from "../boids/vocabulary/schemas/state.ts";

export type CatchEvent = {
  predatorId: string;
  preyId: string;
  preyTypeId: string; // Type of prey that was caught
  preyEnergy: number;
  preyPosition: { x: number; y: number };
};

type WorkerStoreState = Pick<RuntimeStore, "config" | "simulation">;

const createWorkerStore = (initialState: WorkerStoreState) =>
  defineResource({
    start: () => {
      const state = createAtom<WorkerStoreState>(initialState);

      const storeApi = {
        getState: () => state.get(),
        setState: (newState: WorkerStoreState) => state.set(newState),
        updateState: (updater: (state: WorkerStoreState) => WorkerStoreState) =>
          state.update(updater),
      };

      const api = {
        store: storeApi,
        setState: storeApi.setState,
        getState: storeApi.getState,
      };

      return api;
    },
    halt: () => {},
  });

export type WorkerStoreResource = StartedResource<
  ReturnType<typeof createWorkerStore>
>;

/**
 * Worker Engine Resource
 *
 * Mirrors the main engine.ts but runs in worker thread.
 * Maintains full Boid[] array and syncs positions/velocities to SharedArrayBuffer.
 *
 * Philosophy: Reuse existing boid behavior code, don't reimplement physics!
 */
const workerEngine = defineResource({
  dependencies: ["workerStore", "workerProfiler", "workerTime"],
  start: ({ workerStore, workerProfiler, workerTime }) => {
    // Boid array (full Boid objects, like main engine)
    const boids: Boid[] = [];

    // SharedArrayBuffer state (set during initialization)
    let sharedBuffer: SharedArrayBuffer | null = null;
    let layout: SharedBoidBufferLayout | null = null;
    let views: SharedBoidViews | null = null;

    // Spatial hash for efficient neighbor queries
    let spatialHash: ReturnType<typeof createSpatialHash> | null = null;

    /**
     * Initialize engine with boids and SharedArrayBuffer
     */
    const initialize = (input: {
      buffer: SharedArrayBuffer;
      layout: SharedBoidBufferLayout;
      initialBoids: Boid[];
    }) => {
      // Store SharedArrayBuffer references
      sharedBuffer = input.buffer;
      layout = input.layout;
      views = createSharedBoidViews(sharedBuffer, layout);

      // Store boids
      boids.length = 0;
      boids.push(...input.initialBoids);

      // Create spatial hash
      const state = workerStore.getState();
      const config = state.config;
      spatialHash = createSpatialHash(
        config.world.width,
        config.world.height,
        config.parameters.perceptionRadius
      );

      // Sync initial positions/velocities to SharedArrayBuffer
      syncBoidsToSharedMemory();

      // Initialize stats
      Atomics.store(views.stats, StatsIndex.ALIVE_COUNT, boids.length);
      Atomics.store(views.stats, StatsIndex.FRAME_COUNT, 0);
      Atomics.store(views.stats, StatsIndex.SIMULATION_TIME_MS, 0);

      // Start with buffer 0 active
      Atomics.store(views.bufferIndex, 0, 0);

      console.log(`[WorkerEngine] Initialized with ${boids.length} boids`);
    };

    /**
     * Sync boid positions/velocities to SharedArrayBuffer
     * Called after each physics update
     */
    const syncBoidsToSharedMemory = () => {
      if (!views) return;

      const writePositions = getInactivePositions(views);
      const writeVelocities = getInactiveVelocities(views);

      for (let i = 0; i < boids.length; i++) {
        const boid = boids[i];
        writePositions[i * 2 + 0] = boid.position.x;
        writePositions[i * 2 + 1] = boid.position.y;
        writeVelocities[i * 2 + 0] = boid.velocity.x;
        writeVelocities[i * 2 + 1] = boid.velocity.y;
      }
    };

    /**
     * Update physics using existing boid behavior code
     * This is the main update loop - mirrors engine.ts
     */
    const update = (deltaSeconds: number) => {
      if (!spatialHash || !views) return;

      workerProfiler.start("engine.update");

      // Get current config from store
      const state = workerStore.getState();
      const config = state.config;
      const simulation = state.simulation;

      // Build update context (same as main engine)
      const context: BoidUpdateContext = {
        simulation: {
          obstacles: simulation.obstacles,
          deathMarkers: simulation.deathMarkers,
          foodSources: simulation.foodSources,
          tick: 0, // Worker doesn't track lifecycle ticks
          frame: workerTime.getFrame(),
        },
        config: {
          parameters: config.parameters,
          world: config.world,
          species: config.species,
        },
        deltaSeconds,
        profiler: workerProfiler,
        frame: workerTime.getFrame(),
      };

      // Insert boids into spatial hash
      workerProfiler.start("spatial.insert");
      insertBoids(spatialHash, boids);
      workerProfiler.end("spatial.insert");

      // Update each boid using existing behavior code
      workerProfiler.start("boids.update.loop");
      for (let i = 0; i < boids.length; i++) {
        const boid = boids[i];

        // Get nearby boids from spatial hash
        workerProfiler.start("boid.spatial.query");
        const nearbyBoids = getNearbyBoids(
          spatialHash,
          boid.position,
          50, // maxNeighbors
          config.parameters.perceptionRadius
        );
        workerProfiler.end("boid.spatial.query");

        // Update boid using existing rules (separation, alignment, cohesion, etc.)
        workerProfiler.start("boid.rules.apply");
        updateBoid(boid, nearbyBoids, context);
        workerProfiler.end("boid.rules.apply");
      }
      workerProfiler.end("boids.update.loop");

      // Sync updated positions/velocities to SharedArrayBuffer
      workerProfiler.start("sync.toSharedMemory");
      syncBoidsToSharedMemory();
      workerProfiler.end("sync.toSharedMemory");

      // Swap buffers so main thread sees updated data
      swapBuffers(views);

      // Update stats
      const frame = Atomics.load(views.stats, StatsIndex.FRAME_COUNT) + 1;
      Atomics.store(views.stats, StatsIndex.FRAME_COUNT, frame);

      workerProfiler.end("engine.update");
    };

    const api = {
      boids, // Expose boids array (like main engine)
      initialize,
      update,
      reset: () => {
        boids.length = 0;
        if (views) {
          Atomics.store(views.stats, StatsIndex.ALIVE_COUNT, 0);
          Atomics.store(views.stats, StatsIndex.FRAME_COUNT, 0);
        }
      },
      addBoid: (boid: Boid) => {
        boids.push(boid);
        if (views) {
          Atomics.store(views.stats, StatsIndex.ALIVE_COUNT, boids.length);
        }
      },
      removeBoid: (boidId: string) => {
        const index = boids.findIndex((b) => b.id === boidId);
        if (index !== -1) {
          boids.splice(index, 1);
          if (views) {
            Atomics.store(views.stats, StatsIndex.ALIVE_COUNT, boids.length);
          }
        }
      },
      getBoidById: (boidId: string): Boid | undefined => {
        return boids.find((b) => b.id === boidId);
      },
      checkCatches: (): CatchEvent[] => {
        // TODO: Implement predator-prey catch detection
        return [];
      },
    };

    return api;
  },
  halt: () => {},
});

/**
 * Worker Update Loop Resource
 *
 * Equivalent to renderer.ts on main thread.
 * Manages the RAF animation loop and delegates to workerEngine.
 */
const workerUpdateLoop = defineResource({
  dependencies: ["workerEngine", "workerTime"],
  start: ({ workerEngine, workerTime }) => {
    let animationId: number | null = null;
    let isRunning = false;
    let isPaused = false;
    let lastFrameTime = performance.now();
    let targetFps = 60;
    let fps = targetFps;

    const FIXED_UPDATE_RATE = 30; // Updates per second (30 UPS)
    const FIXED_TIMESTEP = 1 / FIXED_UPDATE_RATE; // ~33ms
    const MAX_ACCUMULATED_TIME = FIXED_TIMESTEP * 5; // Prevent spiral of death
    let accumulator = 0;

    const updateSubscription = createSubscription<{
      frame: number;
      fps: number;
      simulationTime: number;
    }>();

    const animate = (timestamp: number) => {
      if (!isRunning) return;

      const currentTime = timestamp;
      const realDeltaMs = currentTime - lastFrameTime;
      lastFrameTime = currentTime;

      const timeState = workerTime.getState();
      fps = fps * 0.9 + (1000 / realDeltaMs) * 0.1;

      if (!isPaused) {
        // Apply time scale
        const scaledDeltaSeconds = (realDeltaMs / 1000) * timeState.timeScale;
        accumulator += scaledDeltaSeconds;

        // Clamp accumulator to prevent spiral of death
        if (accumulator > MAX_ACCUMULATED_TIME) {
          accumulator = MAX_ACCUMULATED_TIME;
        }

        // Update simulation at fixed rate (may run 0, 1, or multiple times per frame)
        while (accumulator >= FIXED_TIMESTEP) {
          workerEngine.update(FIXED_TIMESTEP);
          workerTime.tick();
          updateSubscription.notify({
            frame: workerTime.getFrame(),
            fps: Math.round(fps),
            simulationTime: workerTime.getSimulationTime(),
          });
          accumulator -= FIXED_TIMESTEP;
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    const start = (
      newTargetFps: number,
      onUpdate: SubscriptionCallback<typeof updateSubscription>
    ) => {
      targetFps = newTargetFps;
      if (!isRunning) {
        isRunning = true;
        isPaused = false;
        lastFrameTime = performance.now();
        animationId = requestAnimationFrame(animate);
        console.log("[WorkerUpdateLoop] Started");
      }
      updateSubscription.subscribe(onUpdate);
    };

    const stop = () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      isRunning = false;
      updateSubscription.clear();
      console.log("[WorkerUpdateLoop] Stopped");
    };

    const pause = () => {
      isPaused = true;
      console.log("[WorkerUpdateLoop] Paused");
    };

    const resume = () => {
      isPaused = false;
      console.log("[WorkerUpdateLoop] Resumed");
    };

    const step = (deltaTime: number = FIXED_TIMESTEP) => {
      workerEngine.update(deltaTime);
    };

    return {
      start,
      stop,
      pause,
      resume,
      step,
      isRunning: () => isRunning,
      isPaused: () => isPaused,
    };
  },
  halt: ({ stop }) => {
    stop();
  },
});

const createWorkerSystemConfig = (initialState: WorkerStoreState) => {
  return {
    workerStore: createWorkerStore(initialState),
    workerProfiler: profiler,
    workerRandomness: randomness,
    workerTime: time,
    workerEngine: workerEngine,
    workerUpdateLoop: workerUpdateLoop,
    // Compatibility resource to replace runtimeStore for randomness
    runtimeStore: defineResource({
      dependencies: ["workerStore"],
      start: ({ workerStore }: { workerStore: WorkerStoreResource }) => {
        return workerStore;
      },
      halt: () => {
        // nothing to do, worker store will be halted by the worker system
      },
    }),
  };
};

type StartedWorkerSystem = StartedSystem<
  ReturnType<typeof createWorkerSystemConfig>
>;

/**
 * Worker-side state
 * Persists across task invocations
 */
// Worker system (braided resources)
// Type will be inferred from startSystem result
let workerSystem: StartedWorkerSystem | null = null;

/**
 * Initialize the shared simulation
 * Creates full Boid objects and initializes worker braided system
 */
export const initializeEngine = defineTask({
  input: z.object({
    buffer: z.instanceof(SharedArrayBuffer),
    layout: z.object({
      totalBytes: z.number(),
      boidCount: z.number(),
      bufferIndexOffset: z.number(),
      positions0Offset: z.number(),
      positions1Offset: z.number(),
      velocities0Offset: z.number(),
      velocities1Offset: z.number(),
      statsOffset: z.number(),
    }),
    initialBoids: z.array(boidSchema), // Full Boid objects (can't parse complex objects with Zod)
    initialState: runtimeStoreSchema.pick({
      config: true,
      simulation: true,
    }),
  }),
  output: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  parseIO: false, // SharedArrayBuffer can't be parsed by Zod
  execute: async (input) => {
    // Initialize worker braided system with initial state
    const systemConfig = createWorkerSystemConfig(input.initialState);

    // Halt existing system if any
    if (workerSystem) {
      await haltSystem(systemConfig, workerSystem);
      workerSystem = null;
    }

    // Start system
    const systemResult = await startSystem(systemConfig);

    if (systemResult.errors.size > 0) {
      console.error("[Worker] Failed to start system:", systemResult.errors);
      return {
        success: false,
        message: `System start failed: ${Array.from(
          systemResult.errors.entries()
        )
          .map(([k, v]) => `${k}: ${v.message}`)
          .join(", ")}`,
      };
    }

    workerSystem = systemResult.system;

    console.log("[Worker] System started successfully!", {
      seed: workerSystem.workerRandomness.getMasterSeed(),
      frame: workerSystem.workerTime.getFrame(),
      elapsed: workerSystem.workerTime.getSimulationTime(),
    });

    // Initialize worker engine with full Boid objects
    workerSystem.workerEngine.initialize({
      buffer: input.buffer,
      layout: input.layout,
      initialBoids: input.initialBoids,
    });

    return {
      success: true,
      message: `Initialized ${input.initialBoids.length} boids in worker engine`,
    };
  },
});

/**
 * Start the simulation loop
 * Delegates to workerUpdateLoop resource
 */
export const startSimulationLoop = defineTask({
  input: z.object({
    targetFPS: z.number().default(60),
  }),
  output: z.object({
    running: z.boolean(),
  }),
  progress: z.object({
    frame: z.number(),
    fps: z.number(),
    simulationTime: z.number(),
  }),
  execute: async (input, { reportProgress }) => {
    if (!workerSystem) {
      throw new Error("System not initialized - call initializeEngine first");
    }

    // Delegate to update loop resource
    workerSystem.workerUpdateLoop.start(input.targetFPS, (update) => {
      reportProgress(update);
    });

    console.log("[Worker] Update loop started");

    // Return a promise that never resolves (loop runs until stopped)
    return Promise.resolve({ running: true });
  },
});

/**
 * Stop the simulation loop
 * Delegates to workerUpdateLoop resource
 */
export const stopSimulationLoop = defineTask({
  input: z.object({}),
  output: z.object({
    success: z.boolean(),
  }),
  execute: async () => {
    if (!workerSystem) {
      throw new Error("System not initialized");
    }

    console.log("[Worker] STOP received");

    // Delegate to update loop resource
    workerSystem.workerUpdateLoop.stop();

    // Call the resolve function to properly end the loop task
    if ((globalThis as any).__workerLoopResolve) {
      (globalThis as any).__workerLoopResolve();
      (globalThis as any).__workerLoopResolve = null;
    }

    console.log("[Worker] Loop stopped");
    return { success: true };
  },
});

/**
 * Pause the simulation
 * Delegates to workerUpdateLoop resource
 */
export const pauseSimulation = defineTask({
  input: z.object({}),
  output: z.object({
    paused: z.boolean(),
  }),
  execute: async () => {
    if (!workerSystem) {
      throw new Error("System not initialized");
    }

    console.log("[Worker] PAUSE received");
    workerSystem.workerUpdateLoop.pause();
    return { paused: true };
  },
});

/**
 * Resume the simulation
 * Delegates to workerUpdateLoop resource
 */
export const resumeSimulation = defineTask({
  input: z.object({}),
  output: z.object({
    paused: z.boolean(),
  }),
  execute: async () => {
    if (!workerSystem) {
      throw new Error("System not initialized");
    }

    console.log("[Worker] RESUME received");
    workerSystem.workerUpdateLoop.resume();
    return { paused: false };
  },
});

/**
 * Step the simulation forward by one frame (for debugging)
 * Delegates to workerUpdateLoop resource
 */
export const stepSimulation = defineTask({
  input: z.object({
    deltaTime: z.number().default(1 / 60), // Default: one frame at 60 FPS
  }),
  output: z.object({
    frame: z.number(),
    boidCount: z.number(),
  }),
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error("System not initialized");
    }

    // Delegate to update loop resource
    workerSystem.workerUpdateLoop.step(input.deltaTime);

    return {
      frame: workerSystem.workerTime.getFrame(),
      boidCount: workerSystem.workerEngine.boids.length,
    };
  },
});

/**
 * Update config parameters on the fly
 * Updates the worker store config which is used by workerEngine.update()
 */
export const updateParameters = defineTask({
  input: z.object({
    config: z.any(), // Partial config update
  }),
  output: z.object({
    success: z.boolean(),
  }),
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error("System not initialized");
    }

    // Update worker store config
    const currentState = workerSystem.workerStore.getState();
    workerSystem.workerStore.setState({
      ...currentState,
      config: {
        ...currentState.config,
        ...input.config,
      },
    });

    return { success: true };
  },
});

// ============================================================================
// Physics logic moved to workerEngine resource (uses existing boid behavior code)
// ============================================================================

export const sharedEngineTasks = {
  initializeEngine,
  startSimulationLoop,
  stopSimulationLoop,
  pauseSimulation,
  resumeSimulation,
  stepSimulation,
  updateParameters,
};
