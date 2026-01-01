import { boidsById, lookupBoid } from "../conversions";
import type { BoidUpdateContext } from "../context";
import type { MatingContext, OffspringData } from "../mating";
import { applyMatingResult, unpairBoids } from "../mating";
import { isReadyToMate } from "../predicates";
import type { Boid } from "../vocabulary/schemas/entities";
import { updateBoidAge } from "./aging";
import { updateBoidCooldowns } from "./cooldowns";
import { updateBoidEnergy } from "./energy";
import { processBoidReproduction } from "./reproduction";
import { regenerateHealth, isDead, getDeathCause } from "./health";

/**
 * DEPRECATED (Session 73): Replaced by behavior scoring system
 * Keeping for reference during migration
 *
 * Update prey stance based on current state (declarative)
 */
// function updatePreyStance_DEPRECATED(
//   boid: Boid,
//   speciesConfig: SpeciesConfig,
//   parameters: SimulationParameters,
//   nearbyPredators: Boid[],
//   foodSources: FoodSource[]
// ): void {
//   const currentStance = boid.stance as PreyStance;

//   // Priority 0: Desperate eating overrides fear (when critically low energy)
//   // This creates risk/reward: starving boids will eat near predators
//   const desperateThreshold = boid.phenotype.maxEnergy * 0.3; // Below 30% = desperate
//   if (boid.energy < desperateThreshold) {
//     const nearbyFood = foodSources.find((food) => {
//       if (food.sourceType !== "prey" || food.energy <= 0) return false;
//       const dx = boid.position.x - food.position.x;
//       const dy = boid.position.y - food.position.y;
//       const dist = Math.sqrt(dx * dx + dy * dy);
//       return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS;
//     });

//     if (nearbyFood) {
//       if (currentStance !== "eating") {
//         boid.previousStance = currentStance;
//         boid.stance = "eating";
//       }
//       return; // Eating overrides fleeing when desperate!
//     }
//   }

//   // Priority 1: Fear overrides everything (unless desperate) - if predators nearby, flee!
//   if (nearbyPredators.length > 0) {
//     if (currentStance !== "fleeing") {
//       boid.previousStance = currentStance;
//       boid.stance = "fleeing";
//     }
//     return;
//   }

//   // Return from fleeing to previous stance
//   if (currentStance === "fleeing") {
//     boid.stance = (boid.previousStance as typeof currentStance) || "flocking";
//     boid.previousStance = null;
//     return;
//   }

//   // Priority 2: Eating (near food source with low energy)
//   if (boid.energy < boid.phenotype.maxEnergy * 0.7) {
//     // Eat when below 70%
//     const nearbyFood = foodSources.find((food) => {
//       if (food.sourceType !== "prey" || food.energy <= 0) return false;
//       const dx = boid.position.x - food.position.x;
//       const dy = boid.position.y - food.position.y;
//       const dist = Math.sqrt(dx * dx + dy * dy);
//       return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS;
//     });

//     if (nearbyFood) {
//       if (currentStance !== "eating") {
//         boid.previousStance = currentStance;
//         boid.stance = "eating";
//       }
//       return;
//     }
//   }

//   // Priority 3: Mating (has a mate) - only for sexual reproduction
//   if (speciesConfig.reproduction.type === "sexual") {
//     if (boid.mateId) {
//       if (currentStance !== "mating") {
//         boid.stance = "mating";
//       }
//       return;
//     }

//     // Priority 4: Seeking mate - only for sexual reproduction
//     if (isReadyToMate(boid, parameters, speciesConfig)) {
//       if (currentStance !== "seeking_mate") {
//         boid.stance = "seeking_mate";
//       }
//       return;
//     }
//   }
//   // Note: Asexual boids skip mate-seeking and reproduce instantly when ready

//   // Default: Flocking
//   if (currentStance !== "flocking") {
//     boid.stance = "flocking";
//   }
// }

/**
 * DEPRECATED (Session 73): Replaced by behavior scoring system
 * Keeping for reference during migration
 *
 * Update predator stance based on current state (declarative)
 */
// function updatePredatorStance_DEPRECATED(
//   boid: Boid,
//   speciesConfig: SpeciesConfig,
//   parameters: SimulationParameters,
//   foodSources: FoodSource[]
// ): void {
//   const currentStance = boid.stance as
//     | "hunting"
//     | "seeking_mate"
//     | "mating"
//     | "idle"
//     | "eating";

//   // Priority 1: Eating (near food source OR has eating cooldown)
//   // Check if near food source
//   const nearbyFood = foodSources.find((food) => {
//     if (food.sourceType !== "predator" || food.energy <= 0) return false;
//     const dx = boid.position.x - food.position.x;
//     const dy = boid.position.y - food.position.y;
//     const dist = Math.sqrt(dx * dx + dy * dy);
//     return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5;
//   });

//   if (nearbyFood || boid.eatingCooldown > 0) {
//     if (currentStance !== "eating") {
//       boid.stance = "eating";
//     }
//     return;
//   }

//   // Priority 2: Mating (has a mate) - only for sexual reproduction
//   if (speciesConfig.reproduction.type === "sexual") {
//     if (boid.mateId) {
//       if (currentStance !== "mating") {
//         boid.stance = "mating";
//       }
//       return;
//     }

//     // Priority 3: Seeking mate - only for sexual reproduction
//     if (isReadyToMate(boid, parameters, speciesConfig)) {
//       if (currentStance !== "seeking_mate") {
//         boid.stance = "seeking_mate";
//       }
//       return;
//     }
//   }

//   // Priority 4: Idle (low energy, conserving) - hysteresis: enter at 30%, exit at 50%
//   if (currentStance === "idle") {
//     // Stay idle until energy recovers to 50%
//     if (boid.energy < boid.phenotype.maxEnergy * 0.5) {
//       return; // Stay idle
//     }
//   } else {
//     // Enter idle if energy drops below 30%
//     if (boid.energy < boid.phenotype.maxEnergy * 0.3) {
//       boid.stance = "idle";
//       return;
//     }
//   }

//   // Default: Hunting
//   // BUT: If predator food sources are at cap, we want predators to seek existing food
//   // instead of hunting and creating more. This is handled in the boid movement logic
//   // by checking food source count, so we still set stance to "hunting" here.
//   if (currentStance !== "hunting") {
//     boid.stance = "hunting";
//   }
// }

/**
 * Process all lifecycle updates for all boids
 * Returns collections of changes to apply
 */
export function processLifecycleUpdates(
  boids: Boid[],
  context: BoidUpdateContext,
): {
  boidsToRemove: string[];
  boidsToAdd: OffspringData[];
  deathEvents: Array<{
    boidId: string;
    reason: "old_age" | "starvation" | "predation";
  }>;
  reproductionEvents: Array<{
    parent1Id: string;
    parent2Id?: string;
    typeId: string;
  }>;
} {
  // Extract context for convenience
  const { config, deltaSeconds } = context;
  const { parameters, species: speciesTypes } = config;

  const boidsToRemove: string[] = [];
  const boidsToAdd: OffspringData[] = [];
  const deathEvents: Array<{
    boidId: string;
    reason: "old_age" | "starvation" | "predation";
  }> = [];
  const reproductionEvents: Array<{
    parent1Id: string;
    parent2Id?: string;
    typeId: string;
  }> = [];
  const matedBoids = new Set<string>();
  const boidsMap = boidsById(boids);

  // Process each boid
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    const speciesConfig = speciesTypes[boid.typeId];
    if (!speciesConfig) continue;

    // 1. Age the boid
    boid.age = updateBoidAge(boid, deltaSeconds);

    // 2. Check for death (health OR energy depletion)
    // NOTE: Behavior evaluation moved to engine.ts at frame rate (Session 76)
    if (isDead(boid)) {
      const maxAge = boid.phenotype.maxAge;
      const deathReason = getDeathCause(boid, maxAge);
      boidsToRemove.push(boid.id);
      deathEvents.push({ boidId: boid.id, reason: deathReason });
      continue; // Skip remaining updates for dead boid
    }

    // 3. Update energy
    boid.energy = updateBoidEnergy(boid, speciesConfig, deltaSeconds);

    // 4. Regenerate health (passive, slow)
    boid.health = regenerateHealth(boid).health;

    // 5. Update cooldowns
    const cooldowns = updateBoidCooldowns(boid);
    boid.reproductionCooldown = cooldowns.reproductionCooldown;
    boid.eatingCooldown = cooldowns.eatingCooldown;
    boid.attackCooldown = cooldowns.attackCooldown;

    // 6. Update seeking state
    boid.seekingMate = isReadyToMate(boid, parameters, speciesConfig);

    // 7. Process reproduction
    const matingResult = processBoidReproduction(
      boid,
      boids,
      parameters,
      speciesConfig,
      matedBoids,
    );

    // Apply mating result
    const context: MatingContext = { boidsMap, matedBoids, boidsToAdd };
    applyMatingResult(boid, matingResult, context);

    // Track reproduction events and handle failures (Session 75)
    if (matingResult.type === "reproduction_complete") {
      reproductionEvents.push({
        parent1Id: matingResult.offspring.parent1Id,
        parent2Id: matingResult.offspring.parent2Id,
        typeId: matingResult.offspring.typeId,
      });
      // Reset mate commitment after successful reproduction
      boid.mateCommitmentTime = 0;
    } else if (matingResult.type === "mate_lost") {
      // Mate was lost, unpair if needed
      const mate = lookupBoid(boid.mateId!, boidsMap);
      unpairBoids(boid, mate);
      // Reset mate commitment when mate lost
      boid.mateCommitmentTime = 0;
    } else if (matingResult.type === "pair_found") {
      // Just paired with new mate, reset commitment
      boid.mateCommitmentTime = 0;
    } else if (boid.mateId !== null) {
      // Still has mate, increment commitment time
      boid.mateCommitmentTime++;
    }
  }

  return { boidsToRemove, boidsToAdd, deathEvents, reproductionEvents };
}
