/**
 * Shared Engine Worker Entry Point
 *
 * Worker thread entry for parallel boid simulation.
 * Handles physics computation in a separate thread.
 */

import { createWorkerSystem } from "@/lib/workerTasks/worker";
import { sharedEngineTasks } from "./tasks.ts";
import { startSystem } from "braided";

export const engineWorkerSystem = createWorkerSystem(sharedEngineTasks);

startSystem(engineWorkerSystem).then(({ system, errors }) => {
  if (errors.size > 0) {
    console.error("❌ [Shared Engine Worker] System started with errors:");
    errors.forEach((error, resourceId) => {
      console.error(`  - ${resourceId}:`, error);
    });

    system.workerTransport.notifyError(
      `System started with ${errors.size} error(s)`,
      "sharedEngineTasksSetup",
      "sharedEngineTasksSetup"
    );
    return;
  }

  system.workerTransport.notifyReady();

  console.log("✅ [Shared Engine Worker] System started successfully");
});
