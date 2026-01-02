/**
 * Worker Demo Events & Effects
 *
 * Bidirectional event-driven communication via Web Worker.
 *
 * Architecture:
 * - Client-side event loop (main thread)
 * - Worker-side event loop (worker thread)
 * - Forwarding effects bridge the two
 *
 * Philosophy: "Events flow. Effects execute. Boundaries are just forwarding."
 */

import { z } from "zod";

export const eventKeywords = {
  client: {
    ping: "client/ping",
    compute: "client/compute",
    heavyComputation: "client/heavyComputation",
  },
  worker: {
    error: "worker/error",
    ready: "worker/ready",
    pong: "worker/pong",
    result: "worker/result",
    progress: "worker/progress",
    complete: "worker/complete",
  },
} as const;

export const effectKeywords = {
  client: {
    forwardToWorker: "client/forwardToWorker",
    log: "client/log",
    flushQueue: "client/flushQueue",
  },
  worker: {
    forwardToClient: "worker/forwardToClient",
    log: "worker/log",
    performHeavyComputation: "worker/performHeavyComputation",
  },
} as const;

// ============================================
// Client → Worker Events (Requests)
// ============================================

export const ClientEvents = {
  // Request: Ping the worker
  [eventKeywords.client.ping]: z.object({
    type: z.literal(eventKeywords.client.ping),
  }),

  // Request: Compute something
  [eventKeywords.client.compute]: z.object({
    type: z.literal(eventKeywords.client.compute),
    data: z.number(),
  }),

  // Request: Heavy computation
  [eventKeywords.client.heavyComputation]: z.object({
    type: z.literal(eventKeywords.client.heavyComputation),
    iterations: z.number(),
  }),
} as const;

export type ClientEvent = z.infer<
  (typeof ClientEvents)[keyof typeof ClientEvents]
>;

// ============================================
// Worker → Client Events (Responses)
// ============================================

export const WorkerEvents = {
  // Response: Worker is ready
  [eventKeywords.worker.ready]: z.object({
    type: z.literal(eventKeywords.worker.ready),
    timestamp: z.number(),
  }),

  // Response: Pong from worker
  [eventKeywords.worker.pong]: z.object({
    type: z.literal(eventKeywords.worker.pong),
    timestamp: z.number(),
  }),

  // Response: Computation result
  [eventKeywords.worker.result]: z.object({
    type: z.literal(eventKeywords.worker.result),
    value: z.number(),
  }),

  // Response: Progress update
  [eventKeywords.worker.progress]: z.object({
    type: z.literal(eventKeywords.worker.progress),
    current: z.number(),
    total: z.number(),
  }),

  // Response: Computation complete
  [eventKeywords.worker.complete]: z.object({
    type: z.literal(eventKeywords.worker.complete),
    result: z.number(),
    duration: z.number(),
  }),
} as const;

export type WorkerEvent = z.infer<
  (typeof WorkerEvents)[keyof typeof WorkerEvents]
>;

// ============================================
// All Events (Union)
// ============================================

export type AllWorkerEvents = ClientEvent | WorkerEvent;

// ============================================
// Client-Side Effects
// ============================================

export const ClientEffects = {
  // Effect: Forward event to worker
  [effectKeywords.client.forwardToWorker]: z.object({
    type: z.literal(effectKeywords.client.forwardToWorker),
    event: z.custom<ClientEvent>(), // The event to forward
  }),

  // Effect: Log message (for debugging)
  [effectKeywords.client.log]: z.object({
    type: z.literal(effectKeywords.client.log),
    message: z.string(),
  }),

  // Effect: Flush queued messages
  [effectKeywords.client.flushQueue]: z.object({
    type: z.literal(effectKeywords.client.flushQueue),
  }),
} as const;

export type ClientEffect = z.infer<
  (typeof ClientEffects)[keyof typeof ClientEffects]
>;

// ============================================
// Worker-Side Effects
// ============================================

export const WorkerEffects = {
  // Effect: Forward event to client
  [effectKeywords.worker.forwardToClient]: z.object({
    type: z.literal(effectKeywords.worker.forwardToClient),
    event: z.custom<WorkerEvent>(), // The event to forward
  }),

  // Effect: Log message (for debugging)
  [effectKeywords.worker.log]: z.object({
    type: z.literal(effectKeywords.worker.log),
    message: z.string(),
  }),

  // Effect: Perform heavy computation
  [effectKeywords.worker.performHeavyComputation]: z.object({
    type: z.literal(effectKeywords.worker.performHeavyComputation),
    iterations: z.number(),
  }),
} as const;

export type WorkerEffect = z.infer<
  (typeof WorkerEffects)[keyof typeof WorkerEffects]
>;

// ============================================
// All Effects (Union)
// ============================================

export type AllWorkerEffects = ClientEffect | WorkerEffect;
