import { allEventSchema } from '@/boids/vocabulary/schemas/events'
import { createSubscription, SubscriptionCallback } from '@/lib/state'
import { createUpdateLoop } from '@/lib/updateLoop'
import { defineResource, StartedResource } from 'braided'
import z from 'zod'
import { FrameRaterAPI } from '../shared/frameRater'
import { TimeAPI } from '../shared/time'
import { SharedEngineResource } from './sharedEngine'

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

export const sharedUpdateLoop = defineResource({
  dependencies: ['frameRater', 'engine', 'time'],
  start: ({
    frameRater,
    engine: _engine,
    time,
  }: {
    frameRater: FrameRaterAPI
    engine: SharedEngineResource
    time: TimeAPI
  }) => {
    const simulationRater = frameRater.fixed('simulation', {
      targetFPS: 30, // 30 UPS for deterministic physics
      maxUpdatesPerFrame: 3, // Max 3 catch-up frames
      maxAccumulatedTime: 167, // 5 frames worth (167ms) prevents spiral of death
    })
    const lifecycleRater = frameRater.throttled('lifecycle', {
      intervalMs: 1000, // 1 Hz (every 1 second)
    })

    const updateLoop = createUpdateLoop({
      onStart: () => {
        console.log('[SharedUpdateLoop] Started')
      },
      onStop: () => {
        console.log('[SharedUpdateLoop] Stopped')
      },
      onUpdate: (_deltaMs, _scaledDeltaMs, clockDeltaMs) => {
        animate(clockDeltaMs)
      },
      onPause: () => {},
      getDefaultTimestep: () => {
        return simulationRater.getTimestep() / 1000
      },
      getTimeScale: () => {
        return time.getState().timeScale
      },
      onStep: (_deltaTime, _scaledDeltaMs) => {
        console.log('[SharedUpdateLoop] Stepping', _deltaTime, _scaledDeltaMs)
      },
    })

    const updateSubscription = createSubscription<UpdateLoopFrameUpdate>()
    const lifecycleSubscription = createSubscription<UpdateLoopEventUpdate>()

    const animate = (_timestamp: number) => {}

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

      console.log('[SharedUpdateLoop] Stopped')
    }

    const pause = () => {
      updateLoop.pause()
    }

    const resume = () => {
      updateLoop.start()
    }

    const step = (_deltaTime?: number) => {
      console.warn('[SharedUpdateLoop] Step not implemented')
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

export type SharedUpdateLoopResource = StartedResource<typeof sharedUpdateLoop>
