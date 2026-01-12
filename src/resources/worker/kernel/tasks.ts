/**
 * Shared Engine Worker Tasks
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

import { boidSchema } from '@/boids/vocabulary/schemas/entities.ts'
import { defineTask } from '@/lib/workerTasks/core.ts'
import { haltSystem, startSystem, toDot } from 'braided'
import { z } from 'zod'
import { WorkerSystem, workerSystemConfig } from '@/systems/worker.ts'
import { runtimeStoreSchema } from '../../../boids/vocabulary/schemas/state.ts'
import {
  simulationCommandSchema,
  simulationEventSchema,
} from '@/boids/vocabulary/schemas/simulation.ts'
import { simulationKeywords } from '@/boids/vocabulary/keywords.ts'

/**
 * Worker-side state
 * Persists across task invocations
 */
let workerSystem: WorkerSystem | null = null
let systemConfig: ReturnType<typeof workerSystemConfig> | null = null

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
      energy0Offset: z.number(),
      energy1Offset: z.number(),
      health0Offset: z.number(),
      health1Offset: z.number(),
      stanceFlags0Offset: z.number(),
      stanceFlags1Offset: z.number(),
      stanceEnteredAtFrame0Offset: z.number(), // Session 130
      stanceEnteredAtFrame1Offset: z.number(), // Session 130
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
    systemConfig = workerSystemConfig(input.initialState)

    if (workerSystem) {
      await haltSystem(systemConfig, workerSystem)
      workerSystem = null
    }

    const systemResult = await startSystem(systemConfig)

    if (systemResult.errors.size > 0) {
      console.error('[Worker] Failed to start system:', systemResult.errors)
      return {
        success: false,
        message: `System start failed: ${Array.from(
          systemResult.errors.entries()
        )
          .map(([k, v]) => `${k}: ${v.message}`)
          .join(', ')}`,
      }
    }

    workerSystem = systemResult.system

    const topology = systemResult.topology
    console.log('Worker System Topology:')
    console.log(toDot(topology))

    workerSystem.workerEngine.attach({
      buffer: input.buffer,
      layout: input.layout,
      initialBoids: input.initialBoids,
    })

    return {
      success: true,
      message: `Initialized ${input.initialBoids.length} boids in worker engine`,
    }
  },
})

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
      throw new Error('System not initialized - call initializeEngine first')
    }

    const simulation = workerSystem.workerSimulation
    simulation.initialize()
    simulation.dispatch({
      type: simulationKeywords.commands.start,
    })
    simulation.watch((event) => {
      reportProgress({ channel: 'simulation', event })
    })

    return {
      running: true,
    }
  },
})

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
      throw new Error('System not initialized')
    }

    try {
      await haltSystem(systemConfig, workerSystem)
      workerSystem = null
      systemConfig = null
    } catch (error) {
      console.error('[Worker] Error halting system:', error)
      return { halted: false }
    }

    console.log('[Worker] System halted')
    return { halted: true }
  },
})

/**
 * Pause the simulation
 * Delegates to workerUpdateLoop resource
 */

/**
 * Resume the simulation
 * Delegates to workerUpdateLoop resource
 */

/**
 * Step the simulation forward by one frame (for debugging)
 * Delegates to workerUpdateLoop resource
 */

/**
 * Update config parameters on the fly
 * Updates the worker store config which is used by workerEngine.update()
 */

export const command = defineTask({
  input: z.object({
    command: simulationCommandSchema,
  }),
  output: z.object({
    dispatched: z.boolean(),
  }),
  execute: async (input) => {
    if (!workerSystem) {
      throw new Error('System not initialized')
    }

    workerSystem.workerSimulation.dispatch(input.command)

    return { dispatched: true }
  },
})

export const sharedEngineTasks = {
  initializeWorker: initializeWorker,
  startSimulation,
  haltWorker,
  command,
}
