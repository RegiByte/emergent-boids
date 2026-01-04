/**
 * Atlas Generation Worker
 *
 * Web Worker entry point for atlas generation tasks.
 * Uses the emergent worker pattern for bidirectional communication.
 */

import { startSystem } from "braided";
import { workerSystemConfig } from "./atlasGenerationTasks";

console.log("🎨 [Atlas Generation Worker] Starting...");

// Start the system
startSystem(workerSystemConfig)
  .then(({ system, errors }) => {
    // Check for errors
    if (errors.size > 0) {
      console.error("❌ [Atlas Generation Worker] System started with errors:");
      errors.forEach((error, resourceId) => {
        console.error(`  - ${resourceId}:`, error);
      });

      // Send error to client
      self.postMessage({
        type: "worker/error",
        message: `System started with ${errors.size} error(s)`,
      });
      return;
    }

    console.log("✅ [Atlas Generation Worker] System started successfully");

    // Send ready signal to client
    system.workerTransport.notifyReady();

    console.log("🎉 [Atlas Generation Worker] Ready!");
  })
  .catch((error: unknown) => {
    console.error(
      "❌ [Atlas Generation Worker] Failed to start system:",
      error,
    );

    // Send error to client
    self.postMessage({
      type: "worker/error",
      message: String(error),
    });
  });
