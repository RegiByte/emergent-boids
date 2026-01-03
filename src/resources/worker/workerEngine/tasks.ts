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

import { boidSchema } from "@/boids/vocabulary/schemas/entities.ts";
import { defineTask } from "@/lib/workerTasks/core.ts";
import { profiler } from "@/resources/shared/profiler.ts";
import { randomness } from "@/resources/shared/randomness.ts";
import { time } from "@/resources/shared/time.ts";
import { haltSystem, StartedSystem, startSystem } from "braided";
import { z } from "zod";

import { workerEngine } from "@/resources/worker/workerEngine.ts";
import {
  createWorkerStore,
  WorkerStoreState,
} from "@/resources/worker/workerStore.ts";
import {
  workerLoopUpdateSchema,
  workerUpdateLoop,
} from "@/resources/worker/workerUpdateLoop.ts";
import { runtimeStoreSchema } from "../../../boids/vocabulary/schemas/state.ts";
import { workerRuntimeStore } from "@/resources/worker/workerRuntimeStore.ts";
import { workerLifecycleManager } from "../workerLifecycleManager.ts";

const createWorkerSystemConfig = (initialState: WorkerStoreState) => {
  return {
    workerStore: createWorkerStore(initialState),
    workerProfiler: profiler,
    workerRandomness: randomness,
    workerLifecycleManager: workerLifecycleManager,
    workerTime: time,
    workerEngine: workerEngine,
    workerUpdateLoop: workerUpdateLoop,
    runtimeStore: workerRuntimeStore,
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
  progress: workerLoopUpdateSchema,
  execute: async (input, { reportProgress }) => {
    if (!workerSystem) {
      throw new Error("System not initialized - call initializeEngine first");
    }

    // Delegate to update loop resource
    workerSystem.workerUpdateLoop.start(
      input.targetFPS,
      (update) => {
        reportProgress(update);
      },
      (lifecycle) => {
        reportProgress(lifecycle);
      }
    );

    console.log("[Worker] Update loop started");

    // Return a promise that never resolves (loop runs until stopped)
    return {
      running: true,
    };
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
      boidCount: workerSystem.workerStore.boids.count(),
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

export const sharedEngineTasks = {
  initializeEngine,
  startSimulationLoop,
  stopSimulationLoop,
  pauseSimulation,
  resumeSimulation,
  stepSimulation,
  updateParameters,
};
