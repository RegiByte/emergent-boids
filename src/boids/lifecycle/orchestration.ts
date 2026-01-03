import type { BoidUpdateContext } from "../context";
import { lookupBoid } from "../conversions";
import { iterateBoids } from "../iterators";
import type { MatingContext, OffspringData } from "../mating";
import { applyMatingResult, unpairBoids } from "../mating";
import { isReadyToMate } from "../predicates";
import type { BoidsById } from "../vocabulary/schemas/entities";
import { updateBoidAge } from "./aging";
import { updateBoidCooldowns } from "./cooldowns";
import { updateBoidEnergy } from "./energy";
import { getDeathCause, isDead, regenerateHealth } from "./health";
import { processBoidReproduction } from "./reproduction";

/**
 * Process all lifecycle updates for all boids
 * Returns collections of changes to apply
 */
export function processLifecycleUpdates(
  boids: BoidsById,
  context: BoidUpdateContext
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

  // Process each boid
  for (const boid of iterateBoids(boids)) {
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
      matedBoids
    );

    // Apply mating result
    const context: MatingContext = { boids, matedBoids, boidsToAdd };
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
      const mate = lookupBoid(boid.mateId!, boids);
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

export type LifecycleUpdates = ReturnType<typeof processLifecycleUpdates>;
