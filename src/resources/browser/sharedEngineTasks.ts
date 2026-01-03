/**
 * Shared Engine Tasks Resource (Session 111)
 *
 * Worker tasks resource for parallel simulation engine.
 * Creates the worker and exposes task dispatchers as a braided resource.
 */

import { createWorkerClientResource } from "@/lib/workerTasks/client.ts";
import { sharedEngineTasks } from "@/resources/worker/workerEngine/tasks.ts";
import { StartedResource } from "braided";

/**
 * Shared engine worker tasks resource
 * Automatically creates worker instance and provides type-safe task dispatchers
 */
export const engineTasksResource = createWorkerClientResource(
  () => import("@/resources/worker/workerEngine/workerScript.ts?worker"),
  sharedEngineTasks
);

export type EngineTasks = StartedResource<typeof engineTasksResource>;
