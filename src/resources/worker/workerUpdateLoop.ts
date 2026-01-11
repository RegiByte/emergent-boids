import { allEventSchema } from '@/boids/vocabulary/schemas/events'
import { createSubscription, SubscriptionCallback } from '@/lib/state'
import { defineResource, StartedResource } from 'braided'
import z from 'zod'
import { TimeAPI } from '../shared/time'
import { FrameRaterAPI } from '../shared/frameRater'
import { WorkerEngineResource } from './workerEngine'
import { createUpdateLoop } from '@/lib/updateLoop'

export const workerLoopUpdateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('frame'),
    frame: z.number(),
    fps: z.number(),
    simulationTime: z.number(),
  }),
  z.object({
    type: z.literal('event'),
    event: allEventSchema,
  }),
])

export type WorkerLoopUpdate = z.infer<typeof workerLoopUpdateSchema>
export type WorkerLoopFrameUpdate = Extract<WorkerLoopUpdate, { type: 'frame' }>
export type WorkerLoopEventUpdate = Extract<WorkerLoopUpdate, { type: 'event' }>

/**
 * Worker Update Loop Resource
 *
 * Equivalent to renderer.ts on main thread.
 * Manages the RAF animation loop and delegates to workerEngine.
 *
 * Uses frameRater for timing:
 * - Fixed timestep for simulation (30 UPS, deterministic)
 * - Throttled executor for lifecycle (1 Hz, periodic)
 */
export const workerUpdateLoop = defineResource({
  dependencies: ['workerEngine', 'workerTime', 'workerFrameRater'],
  start: ({
    workerEngine,
    workerTime,
    workerFrameRater,
  }: {
    workerEngine: WorkerEngineResource
    workerTime: TimeAPI
    workerFrameRater: FrameRaterAPI
  }) => {
    const simulationRater = workerFrameRater.fixed('simulation', {
      targetFPS: 30, // 30 UPS for deterministic physics
      maxUpdatesPerFrame: 3, // Max 3 catch-up frames
      maxAccumulatedTime: 167, // 5 frames worth (167ms) prevents spiral of death
    })

    const updateLoop = createUpdateLoop({
      onStart: () => {
        console.log('[WorkerUpdateLoop] Started')
      },
      onStop: () => {
        console.log('[WorkerUpdateLoop] Stopped')
      },
      onUpdate: (_deltaMs, scaledDeltaMs, clockDeltaMs) => {
        animate(scaledDeltaMs, clockDeltaMs)
      },
      onPause: () => {},
      getDefaultTimestep: () => {
        return simulationRater.getTimestep() / 1000
      },
      getTimeScale: () => {
        return workerTime.getState().timeScale
      },
      onStep: (_deltaTime, _scaledDeltaMs) => {
        console.log('[WorkerUpdateLoop] Stepping', _deltaTime, _scaledDeltaMs)
        workerTime.step()
      },
    })

    const lifecycleRater = workerFrameRater.throttled('lifecycle', {
      intervalMs: 1000, // 1 Hz (every 1 second)
    })

    const catchesRater = workerFrameRater.throttled('catches', {
      intervalMs: 100, // 10 Hz
    })

    const updateSubscription = createSubscription<WorkerLoopFrameUpdate>()
    const lifecycleSubscription = createSubscription<WorkerLoopEventUpdate>()

    const animate = (scaledDeltaMs: number, _clockDeltaMs: number) => {
      if (!workerTime.getState().isPaused) {
        const { updates, timestep, droppedFrames } =
          simulationRater.shouldUpdate(scaledDeltaMs)

        for (let i = 0; i < updates; i++) {
          workerEngine.update(timestep) // timestep already in seconds!
          workerTime.tick()

          updateSubscription.notify({
            type: 'frame',
            frame: workerTime.getFrame(),
            fps: Math.round(simulationRater.getMetrics().fps),
            simulationTime: workerTime.getSimulationTime(),
          })
        }

        simulationRater.recordExecution(updates, droppedFrames)

        if (lifecycleRater.shouldExecute(scaledDeltaMs)) {
          lifecycleRater.recordExecution()
        }

        if (catchesRater.shouldExecute(scaledDeltaMs)) {
          const events = workerEngine.checkCatches()
          events.forEach((event) => {
            lifecycleSubscription.notify({
              type: 'event',
              event,
            })
          })
          catchesRater.recordExecution()
        }
      }

      if (workerTime.getState().stepRequested) {
        const timestep = simulationRater.getTimestep() / 1000

        workerEngine.update(timestep) // timestep already in seconds!
        workerTime.tick()

        updateSubscription.notify({
          type: 'frame',
          frame: workerTime.getFrame(),
          fps: Math.round(simulationRater.getMetrics().fps),
          simulationTime: workerTime.getSimulationTime(),
        })

        simulationRater.recordExecution(1, 0)
        workerTime.clearStepRequest()
      }
    }

    const start = (
      _targetFps: number,
      onUpdateEngine: SubscriptionCallback<typeof updateSubscription>,
      onUpdateLifecycle: SubscriptionCallback<typeof lifecycleSubscription>
    ) => {
      simulationRater.setConfig({ targetFPS: _targetFps })
      updateLoop.start()

      updateSubscription.subscribe(onUpdateEngine)
      lifecycleSubscription.subscribe(onUpdateLifecycle)
    }

    const stop = () => {
      updateSubscription.clear()
      lifecycleSubscription.clear()

      simulationRater.reset()
      lifecycleRater.reset()

      console.log('[WorkerUpdateLoop] Stopped')
    }

    const pause = () => {
      workerTime.pause()
    }

    const resume = () => {
      workerTime.resume()
    }

    const step = (_deltaTime?: number) => {
      workerTime.step()
    }

    const api = {
      start,
      stop,
      pause,
      resume,
      step,
      isRunning: () => updateLoop.isRunning(),
      isPaused: () => updateLoop.isPaused(),
      getMetrics: () => ({
        simulation: simulationRater.getMetrics(),
        lifecycle: lifecycleRater.getMetrics(),
      }),
    }

    return api
  },
  halt: ({ stop }) => {
    stop()
  },
})

export type WorkerUpdateLoopResource = StartedResource<typeof workerUpdateLoop>
