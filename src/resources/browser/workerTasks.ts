/**
 * Worker Tasks Resource
 *
 * Worker tasks resource for parallel simulation kernel.
 * Creates the worker and exposes task dispatchers as a braided resource.
 */

import { createWorkerClientResource } from "@/lib/workerTasks/client.ts";
import { sharedEngineTasks } from "@/resources/worker/kernel/tasks";
import { StartedResource } from "braided";

/**
 * Shared engine worker tasks resource
 * Automatically creates worker instance and provides type-safe task dispatchers
 */
export const workerTasksResource = createWorkerClientResource(
  () => import("@/resources/worker/kernel/workerScript.ts?worker"),
  sharedEngineTasks,
);

export type WorkerTasksResource = StartedResource<typeof workerTasksResource>;
