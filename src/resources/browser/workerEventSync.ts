import { defineResource } from "braided";
import { eventKeywords } from "@/boids/vocabulary/keywords";
import { LocalBoidStoreResource } from "./localBoidStore";
import { RuntimeController } from "./runtimeController";
import { SharedEngineResource } from "./sharedEngine";

/**
 * Worker Event Sync Resource
 *
 * Listens to worker events and syncs main thread state.
 * Main thread is read-only - worker is source of truth.
 */
export const workerEventSync = defineResource({
  dependencies: ["engine", "localBoidStore", "runtimeController"],
  start: ({
    engine,
    localBoidStore,
    runtimeController,
  }: {
    engine: SharedEngineResource;
    localBoidStore: LocalBoidStoreResource;
    runtimeController: RuntimeController;
  }) => {
    const boidStore = localBoidStore.store;

    // Subscribe to ALL worker events
    const unsubscribe = engine.eventSubscription.subscribe((event) => {
      // Forward to runtime controller (for analytics, atmosphere, etc.)
      runtimeController.dispatch(event);

      // Sync local state based on event type
      switch (event.type) {
        case eventKeywords.boids.reproduced: {
          // Worker created a boid - we need to add it to local store
          // But we need the full boid data!
          // This is a problem - events don't include full boid...
          // Solution: Add a separate sync mechanism or include boid in event
          console.log("[WorkerEventSync] Boid reproduced:", event.childId);
          break;
        }

        case eventKeywords.boids.died: {
          // Worker removed a boid - remove from local store
          console.log("[WorkerEventSync] Boid died:", event.boidId);
          boidStore.removeBoid(event.boidId);
          break;
        }

        case eventKeywords.boids.caught: {
          // Prey was caught - already handled by died event
          break;
        }

        // Other events just forward to controller
        default:
          break;
      }
    });

    return { unsubscribe };
  },
  halt: ({ unsubscribe }) => {
    unsubscribe();
  },
});
