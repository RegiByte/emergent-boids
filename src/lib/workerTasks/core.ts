/**
 * Worker Tasks Abstraction
 *
 * A generic system for creating type-safe bidirectional worker communication
 * with minimal boilerplate (~90% reduction).
 *
 * Philosophy: "Define tasks as data. Generate systems from data. Types flow naturally."
 *
 * Key Features:
 * - Type-safe task definitions with Zod schemas
 * - Automatic type inference for inputs, outputs, and progress
 * - Fluent subscription API with auto-cleanup
 * - Event keywords pattern (no raw strings)
 * - Natural type parameter order: Input → Output → Progress
 * - Unified task shape: all tasks receive context (future extensibility)
 *
 * @example Simple task without progress
 * ```typescript
 * const tasks = {
 *   square: defineTask({
 *     input: z.number(),
 *     output: z.number(),
 *     execute: async (n, _ctx) => n * n,  // Context always present
 *   }),
 * };
 *
 * // Usage - types are inferred!
 * worker
 *   .dispatch("square", 5)
 *   .onComplete((result) => console.log(result))  // result: number
 *   .onError((error) => console.error(error));
 * ```
 *
 * @example Complex task with progress
 * ```typescript
 * const tasks = {
 *   heavy: defineTask({
 *     input: z.object({ iterations: z.number() }),
 *     output: z.object({ result: z.number(), duration: z.number() }),
 *     progress: z.object({ current: z.number(), total: z.number() }),
 *     execute: async (input, { reportProgress }) => {
 *       for (let i = 0; i < input.iterations; i++) {
 *         if (i % 1000 === 0) {
 *           await reportProgress({ current: i, total: input.iterations });
 *         }
 *         // ... do work
 *       }
 *       return { result, duration };
 *     },
 *   }),
 * };
 *
 * // Usage - all types inferred!
 * worker
 *   .dispatch("heavy", { iterations: 10_000 })
 *   .onProgress((p) => updateUI(p))       // p: { current, total }
 *   .onComplete((out) => showResult(out)) // out: { result, duration }
 *   .onError((err) => console.error(err));
 * ```
 *
 * @example Creating worker system
 * ```typescript
 * // In worker script
 * import { startSystem } from "braided";
 * import { createWorkerSystemConfig } from "@/lib/workerTasks";
 *
 * const workerSystemConfig = createWorkerSystemConfig(tasks);
 * startSystem(workerSystemConfig).then(() => {
 *   self.postMessage({ type: "worker/ready", timestamp: Date.now() });
 * });
 * ```
 *
 * @example Creating client resource
 * ```typescript
 * // In client code
 * import { createWorkerClientResource } from "@/lib/workerTasks";
 *
 * export const myWorker = createWorkerClientResource(
 *   () => import("@/workers/myWorker?worker"),
 *   tasks
 * );
 * ```
 */

import z, { ZodType } from "zod";
import * as z4 from "zod/v4/core";

function inferSchema<T extends z4.$ZodType>(schema: T) {
  return schema;
}

inferSchema(z.string());

import {
  clientStatusKeywords,
  effectKeywords,
  eventKeywords,
} from "./vocabulary";

export type WorkerImportFn = () => Promise<{ default: new () => Worker }>;

/**
 * Task execution context
 * Passed to all tasks, with reportProgress conditionally typed
 */
export type TaskExecutionContext<TProgress> = {
  /**
   * Report progress during task execution
   * - If task has no progress: type is `never` (cannot be called)
   * - If task has progress: type is `(progress: TProgress) => Promise<void>`
   */
  reportProgress: TProgress extends never
    ? never
    : (progress: z4.infer<TProgress>) => Promise<void>;
};

/**
 * Unified task definition
 * All tasks have the same shape - context is always present
 * Progress is optional (defaults to never)
 */
export type TaskDefinition<
  TInput extends z4.$ZodType,
  TOutput extends z4.$ZodType,
  TProgress extends z4.$ZodType = never,
> = {
  input: TInput;
  output: TOutput;
  progress?: TProgress extends never ? never : TProgress;
  execute: (
    input: z4.infer<TInput>,
    ctx: TaskExecutionContext<TProgress>,
  ) => Promise<z4.infer<TOutput>>;
  // granularly define if input and output should be parsed
  // reduces overhead for tasks that require every milisecond of performance
  parseIO?: boolean;
};

/**
 * Registry of tasks
 * Use `as const` when defining tasks for better type inference
 */
export type TaskRegistry = Record<string, TaskDefinition<any, any, any>>;

/**
 * Helper to check if task has progress schema
 */
export function hasProgress(
  task: TaskDefinition<any, any, any>,
): task is TaskDefinition<any, any, any> & { progress: ZodType<any> } {
  return "progress" in task && task.progress !== undefined;
}

// ============================================
// Type Extraction Utilities
// ============================================

/**
 * Extract input type from task definition
 */
export type InferInput<T> = T extends { input: ZodType<infer TInput> }
  ? TInput
  : never;

/**
 * Extract output type from task definition
 */
export type InferOutput<T> = T extends { output: ZodType<infer TOutput> }
  ? TOutput
  : never;

/**
 * Extract progress type from task definition
 * Returns never if task has no progress
 * Handles optional progress property
 */
export type InferProgress<T> = T extends {
  progress?: ZodType<infer TProgress>;
}
  ? TProgress extends undefined
    ? never
    : TProgress
  : never;

/**
 * Check if task has progress at type level
 */
export type HasProgress<T> = T extends { progress: ZodType<any> }
  ? true
  : false;

/**
 * Define a task with type inference
 * Natural type order: Input → Output → Progress (optional)
 *
 * All tasks receive a context parameter, even without progress
 * This allows future extensibility without breaking changes
 */
export function defineTask<
  TInput extends z4.$ZodType,
  TOutput extends z4.$ZodType,
  TProgress extends z4.$ZodType = never,
>(
  definition: TaskDefinition<TInput, TOutput, TProgress>,
): TaskDefinition<TInput, TOutput, TProgress> {
  return definition;
}

// ============================================
// Event Schemas
// ============================================

const schemas = {
  /** Task request event (Client → Worker) */
  [eventKeywords.taskRequest]: z.object({
    type: z.literal(eventKeywords.taskRequest),
    taskId: z.string(),
    taskName: z.string(),
    input: z.unknown(), // Validated against specific task schema
  }),
  /** Task progress event (Worker → Client) */
  [eventKeywords.taskProgress]: z.object({
    type: z.literal(eventKeywords.taskProgress),
    taskId: z.string(),
    taskName: z.string(),
    progress: z.unknown(), // Validated against specific task schema
  }),
  /** Task complete event (Worker → Client) */
  [eventKeywords.taskComplete]: z.object({
    type: z.literal(eventKeywords.taskComplete),
    taskId: z.string(),
    taskName: z.string(),
    output: z.unknown(), // Validated against specific task schema
  }),
  /** Task error event (Worker → Client) */
  [eventKeywords.taskError]: z.object({
    type: z.literal(eventKeywords.taskError),
    taskId: z.string(),
    taskName: z.string(),
    error: z.string(),
  }),
  /** Worker ready event (Worker → Client) */
  [eventKeywords.workerReady]: z.object({
    type: z.literal(eventKeywords.workerReady),
    timestamp: z.number(),
  }),
};

export type TaskRequest = z.infer<
  (typeof schemas)[typeof eventKeywords.taskRequest]
> & {
  /**
   * Optional array of transferable objects (for zero-copy transfer)
   * Examples: ArrayBuffer, MessagePort, ImageBitmap, OffscreenCanvas
   *
   * These objects will be transferred (not copied) to the worker.
   * After transfer, they become unusable in the sender.
   *
   * @example
   * const canvas = document.createElement('canvas');
   * const offscreen = canvas.transferControlToOffscreen();
   *
   * dispatch('taskName', { offscreen }, [offscreen]);  // Transfer canvas
   */
  transferables?: Transferable[];
};

export type TaskProgress = z.infer<
  (typeof schemas)[typeof eventKeywords.taskProgress]
>;

export type TaskComplete = z.infer<
  (typeof schemas)[typeof eventKeywords.taskComplete]
>;

export type TaskError = z.infer<
  (typeof schemas)[typeof eventKeywords.taskError]
>;

export type WorkerReady = z.infer<
  (typeof schemas)[typeof eventKeywords.workerReady]
>;

/**
 * All client events (requests)
 */
export type ClientEvent = TaskRequest;

/**
 * All worker events (responses)
 */
export type WorkerEvent = WorkerReady | TaskProgress | TaskComplete | TaskError;

/**
 * Client effect types
 */
export type ClientEffect =
  | {
      type: typeof effectKeywords.client.forwardToWorker;
      event: ClientEvent;
    }
  | {
      type: typeof effectKeywords.client.log;
      message: string;
    }
  | {
      type: typeof effectKeywords.client.flushQueue;
    };
/**
 * Generate lightweight task ID: timestamp-randomHex
 * Example: "1704234567890-a3f5"
 */
export function generateTaskId(): string {
  const timestamp = Date.now();
  const randomHex = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `${timestamp}-${randomHex}`;
}

const clientStatusSchema = z.enum([
  clientStatusKeywords.initializing,
  clientStatusKeywords.waitingForReady,
  clientStatusKeywords.ready,
  clientStatusKeywords.error,
  clientStatusKeywords.terminated,
]);
export type ClientStatus = z.infer<typeof clientStatusSchema>;
