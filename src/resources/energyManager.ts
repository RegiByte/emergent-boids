import { defineResource } from "braided";
import type { BoidEngine } from "./engine";
import type {
  BoidConfig,
  Boid,
  BoidTypeConfig,
  PreyStance,
  PredatorStance,
} from "../boids/types";
import type { RuntimeController } from "./runtimeController";
import type { StartedRuntimeStore } from "./runtimeStore";
import { eventKeywords } from "../vocabulary/keywords";
import { createBoidOfType } from "../boids/boid";

/**
 * Pure function: Update prey stance based on current state
 */
function updatePreyStance(
  boid: Boid,
  typeConfig: BoidTypeConfig,
  config: BoidConfig,
  nearbyPredators: Boid[]
): void {
  const currentStance = boid.stance as PreyStance;

  // Fear overrides everything - if predators nearby, flee!
  if (nearbyPredators.length > 0) {
    if (currentStance !== "fleeing") {
      boid.previousStance = currentStance;
      boid.stance = "fleeing";
    }
    return;
  }

  // Return from fleeing to previous stance
  if (currentStance === "fleeing") {
    boid.stance = (boid.previousStance as PreyStance) || "flocking";
    boid.previousStance = null;
    return;
  }

  // Check if currently mating (has a mate)
  if (boid.mateId) {
    if (currentStance !== "mating") {
      boid.stance = "mating";
    }
    return;
  }

  // Check if should be seeking mate
  const energyThreshold =
    typeConfig.maxEnergy * config.reproductionEnergyThreshold;
  const shouldSeekMate =
    boid.age >= config.minReproductionAge &&
    boid.energy >= energyThreshold &&
    boid.reproductionCooldown === 0;

  if (shouldSeekMate) {
    if (currentStance !== "seeking_mate") {
      boid.stance = "seeking_mate";
    }
    return;
  }

  // Default to flocking
  if (currentStance !== "flocking") {
    boid.stance = "flocking";
  }
}

/**
 * Pure function: Update predator stance based on current state
 */
function updatePredatorStance(
  boid: Boid,
  typeConfig: BoidTypeConfig,
  config: BoidConfig
): void {
  const currentStance = boid.stance as PredatorStance;

  // Priority 1: Eating (has cooldown from recent catch)
  if (boid.eatingCooldown > 0) {
    if (currentStance !== "eating") {
      boid.stance = "eating";
    }
    return;
  }

  // Priority 2: Mating (has a mate)
  if (boid.mateId) {
    if (currentStance !== "mating") {
      boid.stance = "mating";
    }
    return;
  }

  // Priority 3: Seeking mate
  const energyThreshold =
    typeConfig.maxEnergy * config.reproductionEnergyThreshold;
  const shouldSeekMate =
    boid.age >= config.minReproductionAge &&
    boid.energy >= energyThreshold &&
    boid.reproductionCooldown === 0;

  if (shouldSeekMate) {
    if (currentStance !== "seeking_mate") {
      boid.stance = "seeking_mate";
    }
    return;
  }

  // Priority 4: Idle (low energy, conserving) - enter idle at <30%, stay until >50%
  if (currentStance === "idle") {
    // Stay idle until energy recovers to >50%
    if (boid.energy < typeConfig.maxEnergy * 0.5) {
      return; // Stay idle
    }
    // Energy recovered, can hunt again
  } else if (boid.energy < typeConfig.maxEnergy * 0.3) {
    // Energy too low, enter idle
    boid.stance = "idle";
    return;
  }

  // Default to hunting
  if (currentStance !== "hunting") {
    boid.stance = "hunting";
  }
}

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

      // Pre-calculate nearby predators for prey stance updates
      const predators = engine.boids.filter(
        (b) => runtimeTypes[b.typeId]?.role === "predator"
      );

      // Update energy and age for all boids
      for (const boid of engine.boids) {
        const typeConfig = runtimeTypes[boid.typeId];
        if (!typeConfig) continue;

        // Age all boids
        boid.age += deltaSeconds;

        // Update stance based on current state
        if (typeConfig.role === "predator") {
          updatePredatorStance(boid, typeConfig, config);
        } else {
          // Check if predators are nearby for prey
          const nearbyPredators = predators.filter((p) => {
            const dx = boid.position.x - p.position.x;
            const dy = boid.position.y - p.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < config.fearRadius;
          });
          updatePreyStance(boid, typeConfig, config, nearbyPredators);
        }

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
          // Predators: idle stance gains energy (resting), other stances lose energy
          if (boid.stance === "idle") {
            // Gain energy while idle (resting/conserving)
            boid.energy += typeConfig.energyGainRate * deltaSeconds * 0.3; // 30% of gain rate
            // Cap at max energy
            if (boid.energy > typeConfig.maxEnergy) {
              boid.energy = typeConfig.maxEnergy;
            }
          } else {
            // Lose energy while active (hunting, seeking mate, mating, eating)
            boid.energy -= typeConfig.energyLossRate * deltaSeconds;
          }

          // Check if predator died
          if (boid.energy <= 0) {
            boidsToRemove.push(boid.id);
            runtimeController.dispatch({
              type: eventKeywords.boids.died,
              boidId: boid.id,
            });
            continue;
          }

          // Decrement reproduction cooldown
          if (boid.reproductionCooldown > 0) {
            boid.reproductionCooldown -= 1;
          }

          // Decrement eating cooldown
          if (boid.eatingCooldown > 0) {
            boid.eatingCooldown -= 1;
          }

          // Check if ready to seek mates (same as prey)
          const energyThreshold =
            typeConfig.maxEnergy * config.reproductionEnergyThreshold;
          const isReadyToMate =
            boid.age >= config.minReproductionAge &&
            boid.energy >= energyThreshold &&
            boid.reproductionCooldown === 0;

          // Update seeking state
          boid.seekingMate = isReadyToMate;

          // PREDATOR REPRODUCTION: Sexual reproduction with buildup
          if (isReadyToMate && !matedBoids.has(boid.id)) {
            // If already paired, check if close enough to build up mating
            if (boid.mateId) {
              const mate = engine.boids.find((b) => b.id === boid.mateId);
              if (mate) {
                const dx = boid.position.x - mate.position.x;
                const dy = boid.position.y - mate.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // If close enough, increment buildup counter
                if (distance < config.mateRadius) {
                  // Increment buildup for both (only once per tick)
                  if (boid.matingBuildupCounter < config.matingBuildupTicks) {
                    boid.matingBuildupCounter += 1;
                    mate.matingBuildupCounter += 1;
                  }

                  // If buildup complete, reproduce!
                  if (boid.matingBuildupCounter >= config.matingBuildupTicks) {
                    // Both parents lose 50% energy
                    boid.energy = typeConfig.maxEnergy * 0.5;
                    mate.energy = typeConfig.maxEnergy * 0.5;

                    // Set reproduction cooldown
                    boid.reproductionCooldown = config.reproductionCooldownTicks;
                    mate.reproductionCooldown = config.reproductionCooldownTicks;

                    // Reset buildup counters
                    boid.matingBuildupCounter = 0;
                    mate.matingBuildupCounter = 0;

                    // Clear pairing
                    boid.mateId = null;
                    mate.mateId = null;
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
                } else {
                  // Too far apart, reset buildup counter
                  boid.matingBuildupCounter = 0;
                  mate.matingBuildupCounter = 0;
                }
              } else {
                // Mate died, clear pairing and reset buildup
                boid.mateId = null;
                boid.matingBuildupCounter = 0;
              }
            } else {
              // Not paired yet, find a mate
              const mate = findNearbyMate(
                boid,
                engine.boids,
                matedBoids,
                config.mateRadius
              );

              if (mate) {
                // Pair up! Set mateId for both
                boid.mateId = mate.id;
                mate.mateId = boid.id;

                // Mark as mated this tick (to prevent multiple pairings)
                matedBoids.add(boid.id);
                matedBoids.add(mate.id);
              }
            }
          } else if (boid.mateId && !isReadyToMate) {
            // No longer ready to mate, clear pairing
            const mate = engine.boids.find((b) => b.id === boid.mateId);
            if (mate) {
              mate.mateId = null;
            }
            boid.mateId = null;
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

          // PROXIMITY-BASED REPRODUCTION: Prey need nearby mate with buildup
          if (isReadyToMate && !matedBoids.has(boid.id)) {
            // If already paired, check if close enough to build up mating
            if (boid.mateId) {
              const mate = engine.boids.find((b) => b.id === boid.mateId);
              if (mate) {
                const dx = boid.position.x - mate.position.x;
                const dy = boid.position.y - mate.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // If close enough, increment buildup counter
                if (distance < config.mateRadius) {
                  // Increment buildup for both (only once per tick)
                  if (boid.matingBuildupCounter < config.matingBuildupTicks) {
                    boid.matingBuildupCounter += 1;
                    mate.matingBuildupCounter += 1;
                  }

                  // If buildup complete, reproduce!
                  if (boid.matingBuildupCounter >= config.matingBuildupTicks) {
                    // Both parents lose 50% energy
                    boid.energy = typeConfig.maxEnergy * 0.5;
                    mate.energy = typeConfig.maxEnergy * 0.5;

                    // Set reproduction cooldown
                    boid.reproductionCooldown = config.reproductionCooldownTicks;
                    mate.reproductionCooldown = config.reproductionCooldownTicks;

                    // Reset buildup counters
                    boid.matingBuildupCounter = 0;
                    mate.matingBuildupCounter = 0;

                    // Clear pairing
                    boid.mateId = null;
                    mate.mateId = null;
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
                } else {
                  // Too far apart, reset buildup counter
                  boid.matingBuildupCounter = 0;
                  mate.matingBuildupCounter = 0;
                }
              } else {
                // Mate died, clear pairing and reset buildup
                boid.mateId = null;
                boid.matingBuildupCounter = 0;
              }
            } else {
              // Not paired yet, find a mate
              const mate = findNearbyMate(
                boid,
                engine.boids,
                matedBoids,
                config.mateRadius
              );

              if (mate) {
                // Pair up! Set mateId for both
                boid.mateId = mate.id;
                mate.mateId = boid.id;

                // Mark as mated this tick (to prevent multiple pairings)
                matedBoids.add(boid.id);
                matedBoids.add(mate.id);
              }
            }
          } else if (boid.mateId && !isReadyToMate) {
            // No longer ready to mate, clear pairing
            const mate = engine.boids.find((b) => b.id === boid.mateId);
            if (mate) {
              mate.mateId = null;
            }
            boid.mateId = null;
          }
        }
      }

      // Helper function to find nearby mate
      function findNearbyMate(
        boid: Boid,
        allBoids: Boid[],
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

      // Add new boids (reproduction) - check both global and per-role caps
      for (const { parent1Id, parent2Id, typeId, position } of boidsToAdd) {
        const typeConfig = runtimeTypes[typeId];
        const role = typeConfig?.role;
        
        // Count current population by role
        const currentPreyCount = engine.boids.filter(
          (b) => runtimeTypes[b.typeId]?.role === "prey"
        ).length;
        const currentPredatorCount = engine.boids.filter(
          (b) => runtimeTypes[b.typeId]?.role === "predator"
        ).length;
        
        // Check global cap
        if (engine.boids.length >= config.maxBoids) {
          continue; // Skip this offspring
        }
        
        // Check per-role cap
        if (role === "prey" && currentPreyCount >= config.maxPreyBoids) {
          continue; // Prey cap reached
        }
        if (role === "predator" && currentPredatorCount >= config.maxPredatorBoids) {
          continue; // Predator cap reached
        }
        
        // All caps passed, spawn offspring
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
