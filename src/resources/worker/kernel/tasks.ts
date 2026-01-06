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
import { haltSystem, startSystem } from "braided";
import { z } from "zod";
import { WorkerSystem, workerSystemConfig } from "@/systems/worker.ts";
import { runtimeStoreSchema } from "../../../boids/vocabulary/schemas/state.ts";
import {
  simulationCommandSchema,
  simulationEventSchema,
} from "@/boids/vocabulary/schemas/simulation.ts";
import { simulationKeywords } from "@/boids/vocabulary/keywords.ts";

/**
 * Worker-side state
 * Persists across task invocations
 */
// Worker system (braided resources)
let workerSystem: WorkerSystem | null = null;
let systemConfig: ReturnType<typeof workerSystemConfig> | null = null;

/**
 * Initialize the shared simulation worker
 * Creates full Boid objects and initializes worker braided system
 */
export const initializeWorker = defineTask({
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
    systemConfig = workerSystemConfig(input.initialState);

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

    // Attach shared memory buffer and initial boids to the engine
    workerSystem.workerEngine.attach({
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
export const startSimulation = defineTask({
  input: z.object({}),
  output: z.object({
    running: z.boolean(),
  }),
  progress: z.discriminatedUnion('channel', [
    z.object({
      channel: z.literal('simulation'),
      event: simulationEventSchema,
    }),
  ]),
  execute: async (_input, { reportProgress }) => {
    if (!workerSystem) {
      throw new Error("System not initialized - call initializeEngine first");
    }

    // Delegate to update loop resource
    const simulation = workerSystem.workerSimulation;
    simulation.initialize();
    simulation.dispatch({
      type: simulationKeywords.commands.start,
    });
    simulation.watch((event) => {
      reportProgress({ channel: 'simulation', event });
    });

    console.log("[Worker] Update loop started");

    return {
      running: true,
    };
  },
});

/**
 * Stop the simulation loop
 * Delegates to workerUpdateLoop resource
 */
export const haltWorker = defineTask({
  input: z.object({}),
  output: z.object({
    halted: z.boolean(),
  }),
  execute: async () => {
    if (!workerSystem || !systemConfig) {
      throw new Error("System not initialized");
    }

    try {
      await haltSystem(systemConfig, workerSystem);
      workerSystem = null;
      systemConfig = null;
    } catch (error) {
      console.error("[Worker] Error halting system:", error);
      return { halted: false };
    }

    console.log("[Worker] System halted");
    return { halted: true };
  },
});

/**
 * Pause the simulation
 * Delegates to workerUpdateLoop resource
 */
// export const pauseSimulation = defineTask({
//   input: z.object({}),
//   output: z.object({
//     paused: z.boolean(),
//   }),
//   execute: async () => {
//     if (!workerSystem) {
//       throw new Error("System not initialized");
//     }

//     console.log("[Worker] PAUSE received");
//     workerSystem.workerUpdateLoop.pause();
//     return { paused: true };
//   },
// });

/**
 * Resume the simulation
 * Delegates to workerUpdateLoop resource
 */
// export const resumeSimulation = defineTask({
//   input: z.object({}),
//   output: z.object({
//     paused: z.boolean(),
//   }),
//   execute: async () => {
//     if (!workerSystem) {
//       throw new Error("System not initialized");
//     }

//     console.log("[Worker] RESUME received");
//     workerSystem.workerUpdateLoop.resume();
//     return { paused: false };
//   },
// });

/**
 * Step the simulation forward by one frame (for debugging)
 * Delegates to workerUpdateLoop resource
 */
// export const stepSimulation = defineTask({
//   input: z.object({
//     deltaTime: z.number().default(1 / 60), // Default: one frame at 60 FPS
//   }),
//   output: z.object({
//     frame: z.number(),
//     boidCount: z.number(),
//   }),
//   execute: async (input) => {
//     if (!workerSystem) {
//       throw new Error("System not initialized");
//     }

//     // Delegate to update loop resource
//     workerSystem.workerUpdateLoop.step(input.deltaTime);

//     return {
//       frame: workerSystem.workerTime.getFrame(),
//       boidCount: workerSystem.workerStore.boids.count(),
//     };
//   },
// });

/**
 * Update config parameters on the fly
 * Updates the worker store config which is used by workerEngine.update()
 */
// export const updateParameters = defineTask({
//   input: z.object({
//     config: z.any(), // Partial config update
//   }),
//   output: z.object({
//     success: z.boolean(),
//   }),
//   execute: async (input) => {
//     if (!workerSystem) {
//       throw new Error("System not initialized");
//     }

//     // Update worker store config
//     const currentState = workerSystem.workerStore.getState();
//     workerSystem.workerStore.setState({
//       ...currentState,
//       config: {
//         ...currentState.config,
//         ...input.config,
//       },
//     });

//     return { success: true };
//   },
// });

export const command = defineTask({
  input: z.object({
    command: simulationCommandSchema,
  }),
  output: z.object({
    dispatched: z.boolean(),
  }),
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error("System not initialized");
    }

    workerSystem.workerSimulation.dispatch(input.command);

    return { dispatched: true };
  },
});

export const sharedEngineTasks = {
  initializeWorker: initializeWorker,
  startSimulation,
  haltWorker,
  command,
  // startSimulationLoop,
  // stopSimulationLoop,
  // pauseSimulation,
  // resumeSimulation,
  // stepSimulation,
  // updateParameters,
};
