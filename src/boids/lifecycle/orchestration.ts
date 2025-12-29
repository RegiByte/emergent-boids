import { boidsById, lookupBoid } from "../conversions";
import type { BoidUpdateContext } from "../context";
import { getPredators } from "../filters";
import { FOOD_CONSTANTS } from "../food";
import type { MatingContext, OffspringData } from "../mating";
import { applyMatingResult, unpairBoids } from "../mating";
import { isReadyToMate, isWithinRadius } from "../predicates";
import type { Boid } from "../vocabulary/schemas/prelude.ts";
import { PreyStance } from "../vocabulary/schemas/prelude.ts";
import { updateBoidAge } from "./aging";
import { updateBoidCooldowns } from "./cooldowns";
import { updateBoidEnergy } from "./energy";
import { processBoidReproduction } from "./reproduction";
import { regenerateHealth, isDead, getDeathCause } from "./health";
import type {
  FoodSource,
  SimulationParameters,
  SpeciesConfig,
} from "../vocabulary/schemas/prelude.ts";

/**
 * Update prey stance based on current state (declarative)
 */
function updatePreyStance(
  boid: Boid,
  speciesConfig: SpeciesConfig,
  parameters: SimulationParameters,
  nearbyPredators: Boid[],
  foodSources: FoodSource[]
): void {
  const currentStance = boid.stance as PreyStance;

  // Priority 0: Desperate eating overrides fear (when critically low energy)
  // This creates risk/reward: starving boids will eat near predators
  const desperateThreshold = boid.phenotype.maxEnergy * 0.3; // Below 30% = desperate
  if (boid.energy < desperateThreshold) {
    const nearbyFood = foodSources.find((food) => {
      if (food.sourceType !== "prey" || food.energy <= 0) return false;
      const dx = boid.position.x - food.position.x;
      const dy = boid.position.y - food.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS;
    });

    if (nearbyFood) {
      if (currentStance !== "eating") {
        boid.previousStance = currentStance;
        boid.stance = "eating";
      }
      return; // Eating overrides fleeing when desperate!
    }
  }

  // Priority 1: Fear overrides everything (unless desperate) - if predators nearby, flee!
  if (nearbyPredators.length > 0) {
    if (currentStance !== "fleeing") {
      boid.previousStance = currentStance;
      boid.stance = "fleeing";
    }
    return;
  }

  // Return from fleeing to previous stance
  if (currentStance === "fleeing") {
    boid.stance = (boid.previousStance as typeof currentStance) || "flocking";
    boid.previousStance = null;
    return;
  }

  // Priority 2: Eating (near food source with low energy)
  if (boid.energy < boid.phenotype.maxEnergy * 0.7) {
    // Eat when below 70%
    const nearbyFood = foodSources.find((food) => {
      if (food.sourceType !== "prey" || food.energy <= 0) return false;
      const dx = boid.position.x - food.position.x;
      const dy = boid.position.y - food.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS;
    });

    if (nearbyFood) {
      if (currentStance !== "eating") {
        boid.previousStance = currentStance;
        boid.stance = "eating";
      }
      return;
    }
  }

  // Priority 3: Mating (has a mate) - only for sexual reproduction
  if (speciesConfig.reproduction.type === "sexual") {
    if (boid.mateId) {
      if (currentStance !== "mating") {
        boid.stance = "mating";
      }
      return;
    }

    // Priority 4: Seeking mate - only for sexual reproduction
    if (isReadyToMate(boid, parameters, speciesConfig)) {
      if (currentStance !== "seeking_mate") {
        boid.stance = "seeking_mate";
      }
      return;
    }
  }
  // Note: Asexual boids skip mate-seeking and reproduce instantly when ready

  // Default: Flocking
  if (currentStance !== "flocking") {
    boid.stance = "flocking";
  }
}

/**
 * Update predator stance based on current state (declarative)
 */
function updatePredatorStance(
  boid: Boid,
  speciesConfig: SpeciesConfig,
  parameters: SimulationParameters,
  foodSources: FoodSource[]
): void {
  const currentStance = boid.stance as
    | "hunting"
    | "seeking_mate"
    | "mating"
    | "idle"
    | "eating";

  // Priority 1: Eating (near food source OR has eating cooldown)
  // Check if near food source
  const nearbyFood = foodSources.find((food) => {
    if (food.sourceType !== "predator" || food.energy <= 0) return false;
    const dx = boid.position.x - food.position.x;
    const dy = boid.position.y - food.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5;
  });

  if (nearbyFood || boid.eatingCooldown > 0) {
    if (currentStance !== "eating") {
      boid.stance = "eating";
    }
    return;
  }

  // Priority 2: Mating (has a mate) - only for sexual reproduction
  if (speciesConfig.reproduction.type === "sexual") {
    if (boid.mateId) {
      if (currentStance !== "mating") {
        boid.stance = "mating";
      }
      return;
    }

    // Priority 3: Seeking mate - only for sexual reproduction
    if (isReadyToMate(boid, parameters, speciesConfig)) {
      if (currentStance !== "seeking_mate") {
        boid.stance = "seeking_mate";
      }
      return;
    }
  }

  // Priority 4: Idle (low energy, conserving) - hysteresis: enter at 30%, exit at 50%
  if (currentStance === "idle") {
    // Stay idle until energy recovers to 50%
    if (boid.energy < boid.phenotype.maxEnergy * 0.5) {
      return; // Stay idle
    }
  } else {
    // Enter idle if energy drops below 30%
    if (boid.energy < boid.phenotype.maxEnergy * 0.3) {
      boid.stance = "idle";
      return;
    }
  }

  // Default: Hunting
  // BUT: If predator food sources are at cap, we want predators to seek existing food
  // instead of hunting and creating more. This is handled in the boid movement logic
  // by checking food source count, so we still set stance to "hunting" here.
  if (currentStance !== "hunting") {
    boid.stance = "hunting";
  }
}

/**
 * Process all lifecycle updates for all boids
 * Returns collections of changes to apply
 */
export function processLifecycleUpdates(
  boids: Boid[],
  context: BoidUpdateContext
): {
  boidsToRemove: string[];
  boidsToAdd: OffspringData[];
  deathEvents: Array<{ boidId: string; reason: "old_age" | "starvation" | "predation" }>;
  reproductionEvents: Array<{
    parent1Id: string;
    parent2Id?: string;
    typeId: string;
  }>;
} {
  // Extract context for convenience
  const { config, simulation, deltaSeconds } = context;
  const { parameters, species: speciesTypes } = config;
  const { foodSources } = simulation;

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

  // Pre-calculate predators for prey stance updates
  const predators = getPredators(boids, speciesTypes);

  // Process each boid
  for (const boid of boids) {
    const speciesConfig = speciesTypes[boid.typeId];
    if (!speciesConfig) continue;

    // 1. Age the boid
    boid.age = updateBoidAge(boid, deltaSeconds);

    // 2. Update stance based on current state
    if (speciesConfig.role === "predator") {
      updatePredatorStance(boid, speciesConfig, parameters, foodSources);
    } else {
      // Use type-specific fear radius if available, otherwise use global
      const fearRadius =
        speciesConfig.limits.fearRadius ?? parameters.fearRadius;
      const nearbyPredators = predators.filter((p) =>
        isWithinRadius(boid.position, p.position, fearRadius)
      );
      updatePreyStance(
        boid,
        speciesConfig,
        parameters,
        nearbyPredators,
        foodSources
      );
    }

    // 3. Check for death (health OR energy depletion)
    if (isDead(boid)) {
      const maxAge = speciesConfig.lifecycle?.maxAge || 0;
      const deathReason = getDeathCause(boid, maxAge);
      boidsToRemove.push(boid.id);
      deathEvents.push({ boidId: boid.id, reason: deathReason });
      continue; // Skip remaining updates for dead boid
    }

    // 4. Update energy
    boid.energy = updateBoidEnergy(boid, speciesConfig, deltaSeconds);

    // 5. Regenerate health (passive, slow)
    boid.health = regenerateHealth(boid).health;

    // 6. Update cooldowns
    const cooldowns = updateBoidCooldowns(boid);
    boid.reproductionCooldown = cooldowns.reproductionCooldown;
    boid.eatingCooldown = cooldowns.eatingCooldown;
    boid.attackCooldown = cooldowns.attackCooldown;

    // 7. Update seeking state
    boid.seekingMate = isReadyToMate(boid, parameters, speciesConfig);

    // 8. Process reproduction
    const matingResult = processBoidReproduction(
      boid,
      boids,
      parameters,
      speciesConfig,
      matedBoids
    );

    // Apply mating result
    const context: MatingContext = { boidsMap, matedBoids, boidsToAdd };
    applyMatingResult(boid, matingResult, context);

    // Track reproduction events
    if (matingResult.type === "reproduction_complete") {
      reproductionEvents.push({
        parent1Id: matingResult.offspring.parent1Id,
        parent2Id: matingResult.offspring.parent2Id,
        typeId: matingResult.offspring.typeId,
      });
    } else if (matingResult.type === "mate_lost" && boid.mateId === null) {
      // Mate was lost, unpair if needed
      const mate = lookupBoid(boid.mateId!, boidsMap);
      unpairBoids(boid, mate);
    }
  }

  return { boidsToRemove, boidsToAdd, deathEvents, reproductionEvents };
}
