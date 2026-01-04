/**
 * Demo Worker Tasks
 *
 * Example task definitions using the worker tasks abstraction.
 */

import { z } from "zod";
import { defineTask } from "@/lib/workerTasks/core";
import { createWorkerSystemConfig } from "@/lib/workerTasks/worker";
import { createWorkerClientResource } from "@/lib/workerTasks/client";

// ============================================
// Task Definitions
// ============================================

export const demoTasks = {
  /**
   * Simple task: Square a number (no progress)
   * Note: Context is always passed, but reportProgress is never for tasks without progress
   */
  square: defineTask({
    input: z.number(),
    output: z.number(),
    execute: async (n, _ctx) => {
      return n * n;
    },
  }),

  /**
   * Simple task: Compute factorial (no progress)
   */
  factorial: defineTask({
    input: z.number(),
    output: z.number(),
    execute: async (n, _ctx) => {
      let result = 1;
      for (let i = 2; i <= n; i++) {
        result *= i;
      }
      return result;
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
      const start = performance.now();
      let sum = 0;

      for (let i = 0; i < iterations; i++) {
        // Report progress every 10%
        if (i % Math.floor(iterations / 10) === 0) {
          await reportProgress({ current: i, total: iterations });
        }

        // Do some work
        sum += Math.sqrt(i) * Math.sin(i);
      }

      // Report 100% completion before returning
      await reportProgress({ current: iterations, total: iterations });

      const duration = performance.now() - start;

      return { result: sum, duration };
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
      throw new Error(message);
    },
  }),
};

// ============================================
// Create Worker System Config (for worker script)
// ============================================

export const workerSystemConfig = createWorkerSystemConfig(demoTasks);

// ============================================
// Create Client Resource (for main thread)
// ============================================

export const clientResource = createWorkerClientResource(
  () => import("@/workers/demoTasksWorker?worker"),
  demoTasks,
);
