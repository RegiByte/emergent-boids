import { defineResource, StartedResource } from 'braided'
import { FrameRaterAPI } from '../shared/frameRater'
import { createSubscription, SubscriptionCallback } from '@/lib/state'
import { BoidEngine } from './engine'
import { TimeAPI } from '../shared/time'
import z from 'zod'
import { allEventSchema } from '@/boids/vocabulary/schemas/events'
import { SimulationGateway } from './simulationController'
import { eventKeywords } from '@/boids/vocabulary/keywords'
import { createUpdateLoop } from '@/lib/updateLoop'

export const updateLoopUpdateSchema = z.discriminatedUnion('type', [
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

export type UpdateLoopUpdate = z.infer<typeof updateLoopUpdateSchema>
export type UpdateLoopFrameUpdate = Extract<UpdateLoopUpdate, { type: 'frame' }>
export type UpdateLoopEventUpdate = Extract<UpdateLoopUpdate, { type: 'event' }>

export const updateLoopResource = defineResource({
  dependencies: ['frameRater', 'engine', 'time', 'runtimeController'],
  start: ({
    frameRater,
    engine,
    time,
    runtimeController,
  }: {
    frameRater: FrameRaterAPI
    engine: BoidEngine
    time: TimeAPI
    runtimeController: SimulationGateway
  }) => {
    const simulationRater = frameRater.fixed('simulation', {
      targetFPS: 30, // 30 UPS for deterministic physics
      maxUpdatesPerFrame: 3, // Max 3 catch-up frames
      maxAccumulatedTime: 167, // 5 frames worth (167ms) prevents spiral of death
    })

    const updateLoop = createUpdateLoop({
      onStart: () => {
        console.log('[UpdateLoop] Started')
        time.resume()
      },
      onStop: () => {
        console.log('[UpdateLoop] Stopped')
      },
      onUpdate: (_deltaMs, scaledDeltaMs, clockDeltaMs) => {
        animate(scaledDeltaMs, clockDeltaMs)
      },
      onStep: (_deltaTime, _scaledDeltaMs) => {
        time.step()
      },
      onPause: () => {},
      getDefaultTimestep: () => {
        return simulationRater.getTimestep()
      },
      getTimeScale: () => {
        return time.getState().timeScale
      },
    })

    const lifecycleRater = frameRater.throttled('lifecycle', {
      intervalMs: 1000, // 1 Hz (every 1 second)
    })

    const catchesRater = frameRater.throttled('catches', {
      intervalMs: 100, // 10 Hz
    })

    const updateSubscription = createSubscription<UpdateLoopFrameUpdate>()
    const lifecycleSubscription = createSubscription<UpdateLoopEventUpdate>()
    const animate = (scaledDeltaMs: number, _clockDeltaMs: number) => {
      if (!time.getState().isPaused) {
        const { updates, timestep, droppedFrames } =
          simulationRater.shouldUpdate(scaledDeltaMs)

        for (let i = 0; i < updates; i++) {
          engine.update(timestep) // timestep already in seconds!
          time.tick()

          updateSubscription.notify({
            type: 'frame',
            frame: time.getFrame(),
            fps: Math.round(simulationRater.getMetrics().fps),
            simulationTime: time.getSimulationTime(),
          })
        }
        simulationRater.recordExecution(updates, droppedFrames)

        if (lifecycleRater.shouldExecute(scaledDeltaMs)) {
          runtimeController.dispatch({
            type: eventKeywords.time.passed,
            deltaMs: 1000,
          })
          lifecycleRater.recordExecution()
        }

        if (catchesRater.shouldExecute(scaledDeltaMs)) {
          const events = engine.checkCatches()
          for (const event of events) {
            runtimeController.dispatch(event)
          }
          catchesRater.recordExecution()
        }
      }

      if (time.getState().stepRequested) {
        const timestep = simulationRater.getTimestep() / 1000
        engine.update(timestep) // timestep already in seconds!
        time.tick()

        updateSubscription.notify({
          type: 'frame',
          frame: time.getFrame(),
          fps: Math.round(simulationRater.getMetrics().fps),
          simulationTime: time.getSimulationTime(),
        })
        simulationRater.recordExecution(1, 0)
        time.clearStepRequest()
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
      updateLoop.stop()
      updateSubscription.clear()
      lifecycleSubscription.clear()

      simulationRater.reset()
      lifecycleRater.reset()

      console.log('[UpdateLoop] Stopped')
    }

    const pause = () => {
      time.pause()
    }

    const resume = () => {
      console.log('[UpdateLoop] Resuming')
      time.resume()
    }

    const step = () => {
      time.step()
    }

    const api = {
      start,
      stop,
      pause,
      resume,
      step,
      isRunning: () => updateLoop.isRunning(),
      isPaused: () => time.getState().isPaused,
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

export type UpdateLoopResource = StartedResource<typeof updateLoopResource>
