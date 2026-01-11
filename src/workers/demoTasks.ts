/**
 * Demo Worker Tasks
 *
 * Example task definitions using the worker tasks abstraction.
 */

import { z } from 'zod'
import { defineTask } from '@/lib/workerTasks/core'
import { createWorkerSystemConfig } from '@/lib/workerTasks/worker'
import { createWorkerClientResource } from '@/lib/workerTasks/client'

export const demoTasks = {
  /**
   * Simple task: Square a number (no progress)
   * Note: Context is always passed, but reportProgress is never for tasks without progress
   */
  square: defineTask({
    input: z.number(),
    output: z.number(),
    execute: async (n, _ctx) => {
      return n * n
    },
  }),

  /**
   * Simple task: Compute factorial (no progress)
   */
  factorial: defineTask({
    input: z.number(),
    output: z.number(),
    execute: async (n, _ctx) => {
      let result = 1
      for (let i = 2; i <= n; i++) {
        result *= i
      }
      return result
    },
  }),

  /**
   * Complex task: Heavy computation with progress reporting
   */
  heavyComputation: defineTask({
    input: z.object({
      iterations: z.number(),
    }),
    progress: z.object({
      current: z.number(),
      total: z.number(),
    }),
    output: z.object({
      result: z.number(),
      duration: z.number(),
    }),
    parseIO: false,
    execute: async ({ iterations }, { reportProgress }) => {
      const start = performance.now()
      let sum = 0

      for (let i = 0; i < iterations; i++) {
        if (i % Math.floor(iterations / 10) === 0) {
          await reportProgress({ current: i, total: iterations })
        }

        sum += Math.sqrt(i) * Math.sin(i)
      }

      await reportProgress({ current: iterations, total: iterations })

      const duration = performance.now() - start

      return { result: sum, duration }
    },
  }),

  /**
   * Task that deliberately throws an error (for testing error handling)
   */
  throwError: defineTask({
    input: z.object({
      message: z.string(),
    }),
    output: z.never(),
    execute: async ({ message }, _ctx) => {
      throw new Error(message)
    },
  }),
}

export const workerSystemConfig = createWorkerSystemConfig(demoTasks)

export const clientResource = createWorkerClientResource(
  () => import('@/workers/demoTasksWorker?worker'),
  demoTasks
)
