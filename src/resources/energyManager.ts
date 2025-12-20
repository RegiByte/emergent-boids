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
import {
  isReadyToMate,
  isWithinRadius,
  hasDiedFromOldAge,
  hasDiedFromStarvation,
  shouldStayIdle,
  shouldEnterIdleStance,
} from "../boids/predicates";
import { calculateIdleEnergyGain } from "../boids/calculations";
import { getPredators, countPrey, countPredators } from "../boids/filters";
import {
  processMatingCycle,
  applyMatingResult,
  unpairBoids,
  type MatingContext,
} from "../boids/mating";
import { boidsById, lookupBoid } from "../boids/conversions";

/**
 * Update prey stance based on current state (declarative)
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

  // Check if should be seeking mate (using pure predicate)
  if (isReadyToMate(boid, config, typeConfig)) {
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
 * Update predator stance based on current state (declarative)
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

  // Priority 3: Seeking mate (using pure predicate)
  if (isReadyToMate(boid, config, typeConfig)) {
    if (currentStance !== "seeking_mate") {
      boid.stance = "seeking_mate";
    }
    return;
  }

  // Priority 4: Idle (low energy, conserving) - hysteresis: enter at 30%, exit at 50%
  if (shouldStayIdle(boid, typeConfig)) {
    return; // Stay idle until energy recovers
  }

  if (shouldEnterIdleStance(boid, typeConfig)) {
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
      const boidsMap = boidsById(engine.boids);

      // Get runtime types (these are mutable and updated by UI)
      const runtimeTypes = runtimeStore.store.getState().state.types;

      // Pre-calculate predators for prey stance updates (using pure filter)
      const predators = getPredators(engine.boids, runtimeTypes);

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
          // Check if predators are nearby for prey (using pure predicate)
          const nearbyPredators = predators.filter((p) =>
            isWithinRadius(boid.position, p.position, config.fearRadius)
          );
          updatePreyStance(boid, typeConfig, config, nearbyPredators);
        }

        // Check for death from old age (using pure predicate)
        if (hasDiedFromOldAge(boid, typeConfig)) {
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
            // Gain energy while idle (using pure calculation)
            boid.energy += calculateIdleEnergyGain(
              typeConfig.energyGainRate,
              deltaSeconds
            );
            // Cap at max energy
            if (boid.energy > typeConfig.maxEnergy) {
              boid.energy = typeConfig.maxEnergy;
            }
          } else {
            // Lose energy while active (hunting, seeking mate, mating, eating)
            boid.energy -= typeConfig.energyLossRate * deltaSeconds;
          }

          // Check if predator died from starvation (using pure predicate)
          if (hasDiedFromStarvation(boid)) {
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

          // Update seeking state (using pure predicate)
          const ready = isReadyToMate(boid, config, typeConfig);
          boid.seekingMate = ready;

          // PREDATOR REPRODUCTION: Using pure mating state machine
          if (ready && !matedBoids.has(boid.id)) {
            const result = processMatingCycle(
              boid,
              engine.boids,
              config,
              typeConfig,
              matedBoids
            );

            // Apply mating result (all side effects in one place)
            const context: MatingContext = { boidsMap, matedBoids, boidsToAdd };
            applyMatingResult(boid, result, context);
          } else if (boid.mateId && !ready) {
            // No longer ready to mate, clear pairing
            const mate = lookupBoid(boid.mateId!, boidsMap);
            unpairBoids(boid, mate);
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

          // Update seeking state (using pure predicate)
          const ready = isReadyToMate(boid, config, typeConfig);
          boid.seekingMate = ready;

          // PREY REPRODUCTION: Using pure mating state machine
          if (ready && !matedBoids.has(boid.id)) {
            const result = processMatingCycle(
              boid,
              engine.boids,
              config,
              typeConfig,
              matedBoids
            );

            // Apply mating result (all side effects in one place)
            const context: MatingContext = { boidsMap, matedBoids, boidsToAdd };
            applyMatingResult(boid, result, context);
          } else if (boid.mateId && !ready) {
            // No longer ready to mate, clear pairing
            const mate = lookupBoid(boid.mateId!, boidsMap);
            unpairBoids(boid, mate);
          }
        }
      }

      // Remove dead boids
      for (const boidId of boidsToRemove) {
        engine.removeBoid(boidId);
      }

      // Add new boids (reproduction) - check both global and per-role caps
      for (const { parent1Id, parent2Id, typeId, position } of boidsToAdd) {
        const typeConfig = runtimeTypes[typeId];
        const role = typeConfig?.role;

        // Count current population by role (using pure filters)
        const currentPreyCount = countPrey(engine.boids, runtimeTypes);
        const currentPredatorCount = countPredators(engine.boids, runtimeTypes);

        // Check global cap
        if (engine.boids.length >= config.maxBoids) {
          continue; // Skip this offspring
        }

        // Check per-role cap
        if (role === "prey" && currentPreyCount >= config.maxPreyBoids) {
          continue; // Prey cap reached
        }
        if (
          role === "predator" &&
          currentPredatorCount >= config.maxPredatorBoids
        ) {
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
