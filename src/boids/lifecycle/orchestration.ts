import type { Boid, BoidConfig, BoidTypeConfig } from "../types";
import type { OffspringData, MatingContext } from "../mating";
import { applyMatingResult } from "../mating";
import { boidsById, lookupBoid } from "../conversions";
import { getPredators } from "../filters";
import { isReadyToMate, isWithinRadius } from "../predicates";
import { unpairBoids } from "../mating";
import { updateBoidEnergy } from "./energy";
import { updateBoidAge, checkBoidDeath } from "./aging";
import { updateBoidCooldowns } from "./cooldowns";
import { processBoidReproduction } from "./reproduction";

/**
 * Update prey stance based on current state (declarative)
 */
function updatePreyStance(
  boid: Boid,
  typeConfig: BoidTypeConfig,
  config: BoidConfig,
  nearbyPredators: Boid[]
): void {
  const currentStance = boid.stance as
    | "flocking"
    | "seeking_mate"
    | "mating"
    | "fleeing";

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
    boid.stance = (boid.previousStance as typeof currentStance) || "flocking";
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
  const currentStance = boid.stance as
    | "hunting"
    | "seeking_mate"
    | "mating"
    | "idle"
    | "eating";

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
  if (currentStance === "idle") {
    // Stay idle until energy recovers to 50%
    if (boid.energy < typeConfig.maxEnergy * 0.5) {
      return; // Stay idle
    }
  } else {
    // Enter idle if energy drops below 30%
    if (boid.energy < typeConfig.maxEnergy * 0.3) {
      boid.stance = "idle";
      return;
    }
  }

  // Default to hunting
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
  config: BoidConfig,
  runtimeTypes: Record<string, BoidTypeConfig>,
  deltaSeconds: number
): {
  boidsToRemove: string[];
  boidsToAdd: OffspringData[];
  deathEvents: Array<{ boidId: string; reason: "old_age" | "starvation" }>;
  reproductionEvents: Array<{
    parent1Id: string;
    parent2Id?: string;
    typeId: string;
  }>;
} {
  const boidsToRemove: string[] = [];
  const boidsToAdd: OffspringData[] = [];
  const deathEvents: Array<{
    boidId: string;
    reason: "old_age" | "starvation";
  }> = [];
  const reproductionEvents: Array<{
    parent1Id: string;
    parent2Id?: string;
    typeId: string;
  }> = [];
  const matedBoids = new Set<string>();
  const boidsMap = boidsById(boids);

  // Pre-calculate predators for prey stance updates
  const predators = getPredators(boids, runtimeTypes);

  // Process each boid
  for (const boid of boids) {
    const typeConfig = runtimeTypes[boid.typeId];
    if (!typeConfig) continue;

    // 1. Age the boid
    boid.age = updateBoidAge(boid, deltaSeconds);

    // 2. Update stance based on current state
    if (typeConfig.role === "predator") {
      updatePredatorStance(boid, typeConfig, config);
    } else {
      const nearbyPredators = predators.filter((p) =>
        isWithinRadius(boid.position, p.position, config.fearRadius)
      );
      updatePreyStance(boid, typeConfig, config, nearbyPredators);
    }

    // 3. Check for death
    const deathReason = checkBoidDeath(boid, typeConfig);
    if (deathReason) {
      boidsToRemove.push(boid.id);
      deathEvents.push({ boidId: boid.id, reason: deathReason });
      continue; // Skip remaining updates for dead boid
    }

    // 4. Update energy
    boid.energy = updateBoidEnergy(boid, typeConfig, deltaSeconds);

    // 5. Update cooldowns
    const cooldowns = updateBoidCooldowns(boid);
    boid.reproductionCooldown = cooldowns.reproductionCooldown;
    boid.eatingCooldown = cooldowns.eatingCooldown;

    // 6. Update seeking state
    boid.seekingMate = isReadyToMate(boid, config, typeConfig);

    // 7. Process reproduction
    const matingResult = processBoidReproduction(
      boid,
      boids,
      config,
      typeConfig,
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

