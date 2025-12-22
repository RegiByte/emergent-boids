import { defineResource } from "braided";
import type { BoidEngine } from "./engine";
import type { RuntimeController } from "./runtimeController";
import type { StartedRuntimeStore, EvolutionSnapshot } from "./runtimeStore";
import { eventKeywords } from "../boids/vocabulary/keywords";

/**
 * Analytics Resource
 *
 * Observes the event loop and tracks ecosystem metrics over time.
 * Runs independently of UI rendering - always collecting data.
 *
 * Responsibilities:
 * - Track births/deaths/catches per type
 * - Capture evolution snapshots every N ticks
 * - Calculate population and energy statistics
 * - Update analytics slice in runtime store
 * - Manage snapshot history (max 1000 records)
 */
export const analytics = defineResource({
  dependencies: ["engine", "runtimeController", "runtimeStore"],
  start: ({
    engine,
    runtimeController,
    runtimeStore,
  }: {
    engine: BoidEngine;
    runtimeController: RuntimeController;
    runtimeStore: StartedRuntimeStore;
  }) => {
    let tickCounter = 0;
    const SNAPSHOT_INTERVAL = 3; // Every 3 ticks (3 seconds at 1 tick/sec)
    const MAX_SNAPSHOTS = 1000; // Keep last 1000 snapshots (~50 minutes at 3s intervals)

    // Event counters (reset after each snapshot)
    const eventCounters = {
      births: {} as Record<string, number>,
      deaths: {} as Record<string, number>,
      catches: {} as Record<string, number>,
    };

    // Subscribe to all events
    const unsubscribe = runtimeController.subscribe((event) => {
      // Track lifecycle events
      if (event.type === eventKeywords.boids.reproduced) {
        const typeId = event.typeId;
        // Count actual offspring spawned (handles twins: offspringCount = 2)
        const offspringCount = event.offspringCount || 1;
        eventCounters.births[typeId] =
          (eventCounters.births[typeId] || 0) + offspringCount;
      } else if (event.type === eventKeywords.boids.died) {
        // TypeId now included in event (no need to search)
        const typeId = event.typeId;
        eventCounters.deaths[typeId] = (eventCounters.deaths[typeId] || 0) + 1;
      } else if (event.type === eventKeywords.boids.caught) {
        // Find prey type from boid list
        const prey = engine.boids.find((b) => b.id === event.preyId);
        if (prey) {
          const typeId = prey.typeId;
          eventCounters.catches[typeId] =
            (eventCounters.catches[typeId] || 0) + 1;
        }
      } else if (event.type === eventKeywords.time.passed) {
        // Capture snapshot every N ticks
        tickCounter++;
        if (tickCounter % SNAPSHOT_INTERVAL === 0) {
          captureSnapshot();
        }
      }
    });

    const captureSnapshot = () => {
      const { simulation, analytics: analyticsState } =
        runtimeStore.store.getState();
      const timestamp = Date.now();

      // Calculate populations per type
      const populations: Record<string, number> = {};
      const energySum: Record<string, number> = {};

      engine.boids.forEach((boid) => {
        const typeId = boid.typeId;
        populations[typeId] = (populations[typeId] || 0) + 1;
        energySum[typeId] = (energySum[typeId] || 0) + boid.energy;
      });

      // Calculate average energy per type
      const avgEnergy: Record<string, number> = {};
      Object.keys(energySum).forEach((typeId) => {
        avgEnergy[typeId] = energySum[typeId] / (populations[typeId] || 1);
      });

      // Count food sources by type
      const preyFoodCount = simulation.foodSources.filter(
        (f) => f.sourceType === "prey"
      ).length;
      const predatorFoodCount = simulation.foodSources.filter(
        (f) => f.sourceType === "predator"
      ).length;

      // Create snapshot
      const snapshot: EvolutionSnapshot = {
        tick: tickCounter,
        timestamp,
        populations,
        births: { ...eventCounters.births },
        deaths: { ...eventCounters.deaths },
        catches: { ...eventCounters.catches },
        avgEnergy,
        foodSources: {
          prey: preyFoodCount,
          predator: predatorFoodCount,
        },
      };

      // Update store with new snapshot
      const currentSnapshots = analyticsState.evolutionHistory;
      const newSnapshots = [...currentSnapshots, snapshot].slice(
        -MAX_SNAPSHOTS
      );

      runtimeStore.store.setState({
        analytics: {
          evolutionHistory: newSnapshots,
          currentSnapshot: snapshot,
        },
      });

      // Reset event counters
      eventCounters.births = {};
      eventCounters.deaths = {};
      eventCounters.catches = {};
    };

    return { unsubscribe };
  },
  halt: ({ unsubscribe }: { unsubscribe: () => void }) => {
    unsubscribe();
  },
});
