/**
 * Emergent Worker System (Braided)
 *
 * This file defines the braided system that runs inside the Web Worker.
 *
 * Architecture:
 * - messageListener resource: Listens for messages from main thread
 * - workerEventLoop resource: Emergent event loop for handling ClientEvents
 *
 * Philosophy: "Worker is a system. Resources compose. Initialization is explicit."
 */

import { defineResource, StartedSystem } from 'braided'
import { emergentSystem } from 'emergent'
import type { EventHandlerMap, EffectExecutorMap } from 'emergent'
import {
  effectKeywords,
  eventKeywords,
  WorkerEffect,
  type ClientEvent,
  type WorkerEvent,
} from './workerEvents'

type WorkerState = Record<string, never>
type HandlerContext = Record<string, never>

const handlers = {
  [eventKeywords.client.ping]: (_state, _event) => {
    return [
      {
        type: effectKeywords.worker.log,
        message: 'Received ping',
      },
      {
        type: effectKeywords.worker.forwardToClient,
        event: {
          type: eventKeywords.worker.pong,
          timestamp: Date.now(),
        },
      },
    ]
  },

  [eventKeywords.client.compute]: (_state, event) => {
    const result = event.data * event.data
    return [
      {
        type: effectKeywords.worker.log,
        message: `Computing square of ${event.data}`,
      },
      {
        type: effectKeywords.worker.forwardToClient,
        event: {
          type: 'worker/result',
          value: result,
        },
      },
    ]
  },

  'client/heavyComputation': (_state: WorkerState, event): WorkerEffect[] => {
    return [
      {
        type: effectKeywords.worker.log,
        message: `Starting heavy computation (${event.iterations} iterations)`,
      },
      {
        type: 'worker/performHeavyComputation' as const,
        iterations: event.iterations,
      },
    ]
  },
} satisfies EventHandlerMap<
  ClientEvent,
  WorkerEffect,
  WorkerState,
  HandlerContext
>

type ExecutorContext = {
  dispatchToClient: (event: ClientEvent | WorkerEvent) => void
}

const executors = {
  [effectKeywords.worker.forwardToClient]: (effect, _ctx) => {
    const event = (effect as { event: WorkerEvent }).event
    self.postMessage(event)
  },

  [effectKeywords.worker.log]: (effect) => {
    const message = (effect as { message: string }).message
    console.log(`[Worker] ${message}`)
  },

  [effectKeywords.worker.performHeavyComputation]: (
    effect,
    ctx: ExecutorContext
  ) => {
    const { iterations } = effect
    const startTime = performance.now()
    let sum = 0

    for (let i = 0; i < iterations; i++) {
      if (i % Math.floor(iterations / 10) === 0) {
        ctx.dispatchToClient({
          type: eventKeywords.worker.progress,
          current: i,
          total: iterations,
        })
      }

      sum += Math.sqrt(i) * Math.sin(i)
    }

    const endTime = performance.now()
    const duration = endTime - startTime

    ctx.dispatchToClient({
      type: 'worker/complete',
      result: sum,
      duration,
    })
  },
} satisfies EffectExecutorMap<WorkerEffect, ClientEvent, ExecutorContext>

/**
 * Worker Event Loop Resource
 *
 * Creates and manages the emergent event loop for handling ClientEvents.
 * Uses closure pattern for executor context.
 */
export const workerEventLoop = defineResource({
  dependencies: [],
  start: () => {
    console.log('[Worker] Starting event loop resource...')

    const createWorkerLoop = emergentSystem<
      ClientEvent,
      WorkerEffect,
      WorkerState,
      HandlerContext,
      ExecutorContext
    >()

    const loop = createWorkerLoop({
      getState: () => ({}),
      handlers,
      executors,
      handlerContext: {},
      executorContext: {
        dispatchToClient: (event: ClientEvent | WorkerEvent) => {
          self.postMessage(event) // dispatch event to the client
        },
      },
    })

    return {
      dispatch: loop.dispatch,
      subscribe: loop.subscribe,
      dispose: loop.dispose,
    }
  },
  halt: (loop) => {
    console.log('[Worker] Halting event loop resource...')
    loop.dispose()
  },
})

/**
 * Message Listener Resource
 *
 * Listens for messages from the main thread and dispatches them to the event loop.
 * Depends on workerEventLoop to dispatch events.
 */
export const messageListener = defineResource({
  dependencies: ['workerEventLoop'],
  start: ({ workerEventLoop }) => {
    console.log('[Worker] Starting message listener resource...')

    const handleMessage = (event: MessageEvent<ClientEvent>) => {
      const clientEvent = event.data
      console.log(`[Worker] Received event: ${clientEvent.type}`)

      workerEventLoop.dispatch(clientEvent)
    }

    self.addEventListener('message', handleMessage)

    return {
      cleanup: () => {
        self.removeEventListener('message', handleMessage)
      },
    }
  },
  halt: (listener) => {
    console.log('[Worker] Halting message listener resource...')
    listener.cleanup()
  },
})

/**
 * Worker System Config
 *
 * Minimal system with just 2 resources:
 * 1. workerEventLoop - The emergent event loop
 * 2. messageListener - Listens for messages and dispatches to loop
 */
export const workerSystemConfig = {
  workerEventLoop,
  messageListener,
}

export type WorkerSystem = StartedSystem<typeof workerSystemConfig>
