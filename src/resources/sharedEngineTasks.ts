/**
 * Shared Engine Tasks Resource (Session 111)
 *
 * Worker tasks resource for parallel simulation engine.
 * Creates the worker and exposes task dispatchers as a braided resource.
 */

import { createWorkerClientResource } from "@/lib/workerTasks/client";
import { sharedEngineTasks } from "@/workers/sharedEngineTasks";
import { StartedResource } from "braided";

/**
 * Shared engine worker tasks resource
 * Automatically creates worker instance and provides type-safe task dispatchers
 */
export const sharedEngineTasksResource = createWorkerClientResource(
  () => import("@/workers/sharedEngineWorker?worker"),
  sharedEngineTasks
);

export type SharedEngineTasks = StartedResource<typeof sharedEngineTasksResource>;