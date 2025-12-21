import { defineResource } from "braided";
import type { BoidEngine } from "./engine";
import type { BoidConfig } from "../boids/types";
import type { RuntimeController } from "./runtimeController";
import type { StartedRuntimeStore } from "./runtimeStore";
import { eventKeywords } from "../vocabulary/keywords";
import { createBoidOfType } from "../boids/boid";
import { countPrey, countPredators } from "../boids/filters";
import { processLifecycleUpdates } from "../boids/lifecycle/orchestration";
import { canSpawnOffspring } from "../boids/lifecycle/population";

/**
 * Lifecycle Manager
 *
 * Manages the full lifecycle of boids:
 * - Energy updates (gain/loss)
 * - Aging and death (old age, starvation)
 * - Stance updates (behavioral states)
 * - Reproduction (mate-seeking, pairing, offspring)
 * - Population management (caps, culling)
 * - Predator spawning (user-triggered)
 */
export const lifecycleManager = defineResource({
  dependencies: ["engine", "config", "runtimeController", "runtimeStore"],
  start: ({
    engine,
    config,
    runtimeController,
    runtimeStore,
  }: {
    engine: BoidEngine;
    config: BoidConfig;
    runtimeController: RuntimeController;
    runtimeStore: StartedRuntimeStore;
  }) => {
    // Subscribe to events
    const unsubscribe = runtimeController.subscribe((event) => {
      if (event.type === eventKeywords.time.passage) {
        handleLifecycleUpdate(event.deltaMs);
      } else if (event.type === eventKeywords.boids.spawnPredator) {
        handleSpawnPredator(event.x, event.y);
      }
    });

    const handleLifecycleUpdate = (deltaMs: number) => {
      const deltaSeconds = deltaMs / 1000;
      const runtimeTypes = runtimeStore.store.getState().state.types;

      // Process all lifecycle updates (pure logic)
      const changes = processLifecycleUpdates(
        engine.boids,
        config,
        runtimeTypes,
        deltaSeconds
      );

      // Apply changes (side effects)
      applyLifecycleChanges(changes);

      // Fade death markers over time
      fadeDeathMarkers();
    };

    const fadeDeathMarkers = () => {
      const currentState = runtimeStore.store.getState().state;

      // Skip if no markers
      if (currentState.deathMarkers.length === 0) {
        return;
      }

      // Decrement remainingTicks for all markers and filter out expired ones
      const updatedMarkers = currentState.deathMarkers
        .map((marker) => ({
          ...marker,
          remainingTicks: marker.remainingTicks - 1,
        }))
        .filter((marker) => marker.remainingTicks > 0);

      // Always update store (ticks change even if length doesn't)
      runtimeStore.store.setState({
        state: {
          ...currentState,
          deathMarkers: updatedMarkers,
        },
      });
    };

    const applyLifecycleChanges = (changes: {
      boidsToRemove: string[];
      boidsToAdd: Array<{
        parent1Id: string;
        parent2Id?: string;
        typeId: string;
        position: { x: number; y: number };
      }>;
      deathEvents: Array<{ boidId: string; reason: "old_age" | "starvation" }>;
      reproductionEvents: Array<{
        parent1Id: string;
        parent2Id?: string;
        typeId: string;
      }>;
    }) => {
      const runtimeTypes = runtimeStore.store.getState().state.types;

      // Create death markers for natural deaths (starvation/old age only)
      // Predator catches will create food sources in next session
      // Consolidate nearby markers (100px radius) to prevent flooding
      const CONSOLIDATION_RADIUS = 100;
      const INITIAL_STRENGTH = 1.0;
      const STRENGTH_INCREMENT = 0.5;
      const MAX_STRENGTH = 5.0;
      const INITIAL_TICKS = 10;
      const MAX_LIFETIME_TICKS = 20;

      const currentState = runtimeStore.store.getState().state;
      const updatedMarkers = [...currentState.deathMarkers];

      for (const { boidId, reason } of changes.deathEvents) {
        // Only create markers for starvation and old age
        if (reason !== "starvation" && reason !== "old_age") {
          continue;
        }

        const boid = engine.getBoidById(boidId);
        if (!boid) continue;

        // Check if there's an existing marker nearby (within 100px)
        const nearbyMarkersIndexes = [];
        for (let i = 0; i < updatedMarkers.length; i++) {
          const marker = updatedMarkers[i];
          const dx = Math.abs(marker.position.x - boid.position.x);
          const dy = Math.abs(marker.position.y - boid.position.y);
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONSOLIDATION_RADIUS) {
            // within consolidation radius?
            // increase strength
            nearbyMarkersIndexes.push(i);
          }
        }

        if (nearbyMarkersIndexes.length > 0) {
          // Strengthen existing markers and restore ticks
          for (const nearbyMarkerIndex of nearbyMarkersIndexes) {
            const existingMarker = updatedMarkers[nearbyMarkerIndex];
            updatedMarkers[nearbyMarkerIndex] = {
              ...existingMarker,
              strength: Math.min(
                existingMarker.strength + STRENGTH_INCREMENT,
                MAX_STRENGTH
              ),
              remainingTicks: Math.min(
                existingMarker.remainingTicks + INITIAL_TICKS,
                existingMarker.maxLifetimeTicks
              ),
            };
          }
        } else {
          // Create new marker
          updatedMarkers.push({
            position: { x: boid.position.x, y: boid.position.y },
            remainingTicks: INITIAL_TICKS,
            strength: INITIAL_STRENGTH,
            maxLifetimeTicks: MAX_LIFETIME_TICKS,
            typeId: boid.typeId,
          });
        }
      }

      // Update store if markers changed
      if (updatedMarkers.length !== currentState.deathMarkers.length) {
        runtimeStore.store.setState({
          state: {
            ...currentState,
            deathMarkers: updatedMarkers,
          },
        });
      }

      // Remove dead boids
      for (const boidId of changes.boidsToRemove) {
        engine.removeBoid(boidId);
      }

      // Dispatch death events
      for (const { boidId } of changes.deathEvents) {
        runtimeController.dispatch({
          type: eventKeywords.boids.died,
          boidId,
        });
      }

      // Count current populations for cap checking
      const currentPreyCount = countPrey(engine.boids, runtimeTypes);
      const currentPredatorCount = countPredators(engine.boids, runtimeTypes);

      // Add new boids (check population caps)
      for (const offspring of changes.boidsToAdd) {
        const canSpawn = canSpawnOffspring(
          offspring.typeId,
          engine.boids.length,
          currentPreyCount,
          currentPredatorCount,
          config,
          runtimeTypes
        );

        if (canSpawn) {
          const typeConfig = runtimeTypes[offspring.typeId];
          const newBoid = createBoidOfType(
            offspring.position,
            offspring.typeId,
            typeConfig,
            config.canvasWidth,
            config.canvasHeight
          );
          engine.addBoid(newBoid);

          // Dispatch reproduction event
          const reproductionEvent = changes.reproductionEvents.find(
            (e) => e.parent1Id === offspring.parent1Id
          );
          if (reproductionEvent) {
            runtimeController.dispatch({
              type: eventKeywords.boids.reproduced,
              parentId: reproductionEvent.parent1Id,
              childId: newBoid.id,
              typeId: reproductionEvent.typeId,
              ...(reproductionEvent.parent2Id && {
                parent2Id: reproductionEvent.parent2Id,
              }),
            });
          }
        }
      }

      // Handle global population cap (cull random boids if over limit)
      if (engine.boids.length > config.maxBoids) {
        const excessCount = engine.boids.length - config.maxBoids;
        for (let i = 0; i < excessCount; i++) {
          const randomIndex = Math.floor(Math.random() * engine.boids.length);
          const boid = engine.boids[randomIndex];
          engine.removeBoid(boid.id);
        }
      }
    };

    const handleSpawnPredator = (x: number, y: number) => {
      const runtimeTypes = runtimeStore.store.getState().state.types;

      // Find the predator type
      const predatorTypeId = Object.keys(runtimeTypes).find(
        (id) => runtimeTypes[id].role === "predator"
      );

      if (!predatorTypeId) {
        console.warn("No predator type found in config");
        return;
      }

      if (engine.boids.length >= config.maxBoids) {
        console.warn("Max boids reached, cannot spawn predator");
        return;
      }

      const typeConfig = runtimeTypes[predatorTypeId];
      const newPredator = createBoidOfType(
        { x, y },
        predatorTypeId,
        typeConfig,
        config.canvasWidth,
        config.canvasHeight
      );

      engine.addBoid(newPredator);
    };

    return { unsubscribe };
  },
  halt: ({ unsubscribe }) => {
    unsubscribe();
  },
});
