import { defineResource } from "braided";
import type { BoidEngine } from "./engine";
import type { BoidConfig } from "../boids/types";
import type { RuntimeController } from "./runtimeController";
import type { StartedRuntimeStore } from "./runtimeStore";
import { eventKeywords } from "../vocabulary/keywords";
import { createBoidOfType } from "../boids/boid";

export const energyManager = defineResource({
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
        handleEnergyUpdate(event.deltaMs);
      } else if (event.type === eventKeywords.boids.spawnPredator) {
        handleSpawnPredator(event.x, event.y);
      }
    });

    const handleEnergyUpdate = (deltaMs: number) => {
      const deltaSeconds = deltaMs / 1000;
      const boidsToRemove: string[] = [];
      const boidsToAdd: Array<{
        parent1Id: string;
        parent2Id?: string;
        typeId: string;
        position: { x: number; y: number };
      }> = [];
      const matedBoids = new Set<string>(); // Track boids that already mated this tick

      // Get runtime types (these are mutable and updated by UI)
      const runtimeTypes = runtimeStore.store.getState().state.types;

      // Update energy and age for all boids
      for (const boid of engine.boids) {
        const typeConfig = runtimeTypes[boid.typeId];
        if (!typeConfig) continue;

        // Age all boids
        boid.age += deltaSeconds;

        // Check for death from old age
        if (typeConfig.maxAge > 0 && boid.age >= typeConfig.maxAge) {
          boidsToRemove.push(boid.id);
          runtimeController.dispatch({
            type: eventKeywords.boids.died,
            boidId: boid.id,
          });
          continue; // Skip energy updates for dead boid
        }

        if (typeConfig.role === "predator") {
          // Predators still reproduce solo (asexual) - they're rare and need to reproduce fast
          if (boid.energy >= typeConfig.maxEnergy) {
            boid.energy = typeConfig.maxEnergy / 2; // Reset to half
            boidsToAdd.push({
              parent1Id: boid.id,
              typeId: boid.typeId,
              position: boid.position,
            });
          }

          // Predators lose energy over time
          boid.energy -= typeConfig.energyLossRate * deltaSeconds;

          // Check if predator died
          if (boid.energy <= 0) {
            boidsToRemove.push(boid.id);
            runtimeController.dispatch({
              type: eventKeywords.boids.died,
              boidId: boid.id,
            });
          }
        } else {
          // Prey gain energy over time
          boid.energy += typeConfig.energyGainRate * deltaSeconds;
          
          // Cap energy at max
          if (boid.energy > typeConfig.maxEnergy) {
            boid.energy = typeConfig.maxEnergy;
          }

          // Decrement reproduction cooldown
          if (boid.reproductionCooldown > 0) {
            boid.reproductionCooldown -= 1;
          }

          // Check if ready to seek mates (Phase 2: age + energy threshold)
          const energyThreshold = typeConfig.maxEnergy * config.reproductionEnergyThreshold;
          const isReadyToMate = 
            boid.age >= config.minReproductionAge &&
            boid.energy >= energyThreshold &&
            boid.reproductionCooldown === 0;

          // Update seeking state
          boid.seekingMate = isReadyToMate;

          // PROXIMITY-BASED REPRODUCTION: Prey need a nearby mate
          if (isReadyToMate && !matedBoids.has(boid.id)) {
            // Find nearby mate of same type that's also seeking
            const mate = findNearbyMate(
              boid,
              engine.boids,
              matedBoids,
              config.mateRadius
            );

            if (mate) {
              // Both parents lose 50% energy (less harsh than before)
              boid.energy = typeConfig.maxEnergy * 0.5;
              mate.energy = typeConfig.maxEnergy * 0.5;
              
              // Set reproduction cooldown (Phase 2)
              boid.reproductionCooldown = config.reproductionCooldownTicks;
              mate.reproductionCooldown = config.reproductionCooldownTicks;
              
              // Clear seeking state
              boid.seekingMate = false;
              mate.seekingMate = false;

              // Mark both as mated this tick
              matedBoids.add(boid.id);
              matedBoids.add(mate.id);

              // Spawn offspring between parents
              const midpoint = {
                x: (boid.position.x + mate.position.x) / 2,
                y: (boid.position.y + mate.position.y) / 2,
              };

              boidsToAdd.push({
                parent1Id: boid.id,
                parent2Id: mate.id,
                typeId: boid.typeId,
                position: midpoint,
              });
            }
          }
        }
      }

      // Helper function to find nearby mate
      function findNearbyMate(
        boid: any,
        allBoids: any[],
        alreadyMated: Set<string>,
        mateRadius: number
      ) {
        for (const other of allBoids) {
          if (
            other.id !== boid.id &&
            other.typeId === boid.typeId &&
            other.seekingMate && // Must be actively seeking (Phase 2)
            other.reproductionCooldown === 0 && // Must be off cooldown (Phase 2)
            !alreadyMated.has(other.id)
          ) {
            // Calculate distance
            const dx = boid.position.x - other.position.x;
            const dy = boid.position.y - other.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < mateRadius) {
              return other;
            }
          }
        }
        return null;
      }

      // Remove dead boids
      for (const boidId of boidsToRemove) {
        engine.removeBoid(boidId);
      }

      // Add new boids (reproduction) - only once per energy tick!
      for (const { parent1Id, parent2Id, typeId, position } of boidsToAdd) {
        if (engine.boids.length < config.maxBoids) {
          const typeConfig = runtimeTypes[typeId];
          const newBoid = createBoidOfType(
            position,
            typeId,
            typeConfig,
            config.canvasWidth,
            config.canvasHeight
          );
          engine.addBoid(newBoid);
          runtimeController.dispatch({
            type: eventKeywords.boids.reproduced,
            parentId: parent1Id,
            childId: newBoid.id,
            typeId: typeId,
            // Optional: include second parent for pair reproduction
            ...(parent2Id && { parent2Id }),
          });
        }
      }

      // Handle population cap - cull random boids if over limit
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
