/**
 * Shared Worker Kernel Entry Point
 *
 * Worker thread entry for parallel boid simulation.
 * Handles physics computation in a separate thread.
 * 
 * This doesn't do any work by itself, just delegates to tasks.
 */

import { createWorkerSystem } from "@/lib/workerTasks/worker.ts";
import { sharedEngineTasks } from "./tasks.ts";
import { startSystem } from "braided";

export const engineWorkerSystem = createWorkerSystem(sharedEngineTasks);

startSystem(engineWorkerSystem).then(({ system, errors }) => {
  if (errors.size > 0) {
    console.error("❌ [Shared Worker Kernel] System started with errors:");
    errors.forEach((error, resourceId) => {
      console.error(`  - ${resourceId}:`, error);
    });

    system.workerTransport.notifyError(
      `System started with ${errors.size} error(s)`,
      "sharedEngineTasksSetup",
      "sharedEngineTasksSetup",
    );
    return;
  }

  system.workerTransport.notifyReady();

  console.log("✅ [Shared Worker Kernel] System started successfully");
}).catch((error) => {
  console.error("❌ [Shared Worker Kernel] System failed to start:", error);
});
