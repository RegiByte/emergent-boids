/**
 * Emergent-Powered Web Worker (Braided System)
 *
 * This worker uses braided + emergent for type-safe message handling.
 *
 * Architecture:
 * - Braided system orchestrates worker resources
 * - Event loop resource handles ClientEvents
 * - Message listener resource receives messages from main thread
 * - Explicit "ready" signal after system initialization
 *
 * Philosophy: "Worker is a system. Initialization is explicit. Ready when ready."
 */

import { startSystem, haltSystem } from "braided";
import { WorkerSystem, workerSystemConfig } from "./emergentWorkerSystem";
import { eventKeywords } from "./workerEvents";

// ============================================
// Worker System Initialization
// ============================================

console.log("🚀 [Worker] Starting braided system...");

let startedSystem: WorkerSystem | null = null;

// Start the system
startSystem(workerSystemConfig)
  .then(({ system, errors, topology }) => {
    // Check for errors
    if (errors.size > 0) {
      console.error("❌ [Worker] System started with errors:");
      errors.forEach((error, resourceId) => {
        console.error(`  - ${resourceId}:`, error);
      });

      startedSystem = system;
      // Send error to client
      self.postMessage({
        type: eventKeywords.worker.error,
        message: `System started with ${errors.size} error(s)`,
      });
      return;
    }

    console.log("✅ [Worker] System started successfully");
    console.log("📊 [Worker] Topology:", topology);

    // Send ready signal to client
    const readyEvent = {
      type: eventKeywords.worker.ready,
      timestamp: Date.now(),
    };

    console.log("[Worker] Sending ready signal to client...");
    self.postMessage(readyEvent);
    console.log("🎉 [Worker] Ready!");
  })
  .catch((error: unknown) => {
    console.error("❌ [Worker] Failed to start system:", error);

    // Send error to client
    self.postMessage({
      type: "worker/error",
      message: String(error),
    });
  });

// Handle worker termination
self.addEventListener("close", () => {
  console.log("🛑 [Worker] Closing...");

  if (startedSystem) {
    haltSystem(workerSystemConfig, startedSystem).catch((error: unknown) => {
      console.error("[Worker] Error halting system:", error);
    });
  }
});
