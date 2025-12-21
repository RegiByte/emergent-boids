
import {
  calculateDistance,
  calculateOffspringPosition,
  calculateReproductionEnergyCost,
} from "./calculations";
import { findBoidById } from "./filters";
import { isEligibleMate } from "./predicates";
import type { Boid, Vector2 } from "./types";
import {SimulationParameters, SpeciesConfig} from "../vocabulary/schemas/prelude.ts";

/**
 * Pure mating state machine
 * Handles all mating logic in a declarative, side-effect free way
 */

// ============================================================================
// Types
// ============================================================================

export type OffspringData = {
  parent1Id: string;
  parent2Id?: string;
  typeId: string;
  position: Vector2;
};

export type BoidUpdates = {
  energy: number;
  reproductionCooldown: number;
  matingBuildupCounter: number;
  mateId: string | null;
  seekingMate: boolean;
};

export type MatingResult =
  | { type: "no_action" }
  | { type: "pair_found"; mateId: string; updates: BoidUpdates }
  | { type: "building_up"; buildup: number }
  | { type: "buildup_reset"; updates: BoidUpdates }
  | { type: "mate_lost"; updates: BoidUpdates }
  | {
      type: "reproduction_complete";
      offspring: OffspringData;
      boidUpdates: BoidUpdates;
      mateUpdates: BoidUpdates;
    };

/**
 * Context for applying mating results (side effects)
 */
export type MatingContext = {
  boidsMap: Record<string, Boid>;
  matedBoids: Set<string>;
  boidsToAdd: OffspringData[];
};

// ============================================================================
// Pure Mating Logic
// ============================================================================

/**
 * Find nearest eligible mate within radius
 */
export function findNearbyMate(
  boid: Boid,
  allBoids: Boid[],
  alreadyMated: Set<string>,
  mateRadius: number
): Boid | null {
  for (const other of allBoids) {
    if (isEligibleMate(other, boid, alreadyMated)) {
      const distance = calculateDistance(boid.position, other.position);
      if (distance < mateRadius) {
        return other;
      }
    }
  }
  return null;
}

/**
 * Process asexual reproduction for a boid
 * Returns the result of asexual reproduction without side effects
 */
export function processAsexualReproduction(
  boid: Boid,
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig
): MatingResult {
  // Asexual reproduction is instant - no mate needed, no buildup
  const reproductionEnergy = calculateReproductionEnergyCost(
    speciesConfig.lifecycle.maxEnergy
  );

  // Use type-specific cooldown if available, otherwise use global
  const cooldownTicks =
    speciesConfig.reproduction.cooldownTicks ??
    parameters.reproductionCooldownTicks;

  return {
    type: "reproduction_complete",
    offspring: {
      parent1Id: boid.id,
      parent2Id: undefined, // No second parent for asexual
      typeId: boid.typeId,
      position: boid.position, // Spawn at parent's position
    },
    boidUpdates: {
      energy: reproductionEnergy,
      reproductionCooldown: cooldownTicks, // Use type-specific or global cooldown
      matingBuildupCounter: 0,
      mateId: null,
      seekingMate: false,
    },
    mateUpdates: {
      // No mate, but we need to provide this for type compatibility
      energy: 0,
      reproductionCooldown: 0,
      matingBuildupCounter: 0,
      mateId: null,
      seekingMate: false,
    },
  };
}

/**
 * Process mating cycle for a boid
 * Returns the result of the mating attempt without side effects
 */
export function processMatingCycle(
  boid: Boid,
  allBoids: Boid[],
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  matedBoids: Set<string>
): MatingResult {
  // Check if this type uses asexual reproduction
  if (speciesConfig.reproduction.type === "asexual") {
    return processAsexualReproduction(boid, parameters, speciesConfig);
  }

  // Sexual reproduction logic below
  // If already paired, check mating progress
  if (boid.mateId) {
    const mate = findBoidById(allBoids, boid.mateId);

    // Mate died or disappeared
    if (!mate) {
      return {
        type: "mate_lost",
        updates: {
          energy: boid.energy,
          reproductionCooldown: boid.reproductionCooldown,
          matingBuildupCounter: 0,
          mateId: null,
          seekingMate: boid.seekingMate,
        },
      };
    }

    const distance = calculateDistance(boid.position, mate.position);

    // Close enough to build up mating
    if (distance < parameters.mateRadius) {
      const newBuildup = Math.min(
        boid.matingBuildupCounter + 1,
        parameters.matingBuildupTicks
      );

      // Buildup complete - reproduce!
      if (newBuildup >= parameters.matingBuildupTicks) {
        const reproductionEnergy = calculateReproductionEnergyCost(
          speciesConfig.lifecycle.maxEnergy
        );

        // Use type-specific cooldown if available, otherwise use global
        const cooldownTicks =
          speciesConfig.reproduction.cooldownTicks ??
          parameters.reproductionCooldownTicks;

        return {
          type: "reproduction_complete",
          offspring: {
            parent1Id: boid.id,
            parent2Id: mate.id,
            typeId: boid.typeId,
            position: calculateOffspringPosition(boid.position, mate.position),
          },
          boidUpdates: {
            energy: reproductionEnergy,
            reproductionCooldown: cooldownTicks, // Use type-specific or global cooldown
            matingBuildupCounter: 0,
            mateId: null,
            seekingMate: false,
          },
          mateUpdates: {
            energy: reproductionEnergy,
            reproductionCooldown: cooldownTicks, // Use type-specific or global cooldown
            matingBuildupCounter: 0,
            mateId: null,
            seekingMate: false,
          },
        };
      }

      // Still building up
      return {
        type: "building_up",
        buildup: newBuildup,
      };
    } else {
      // Too far apart - reset buildup
      return {
        type: "buildup_reset",
        updates: {
          energy: boid.energy,
          reproductionCooldown: boid.reproductionCooldown,
          matingBuildupCounter: 0,
          mateId: boid.mateId,
          seekingMate: boid.seekingMate,
        },
      };
    }
  } else {
    // Not paired yet - find a mate
    const mate = findNearbyMate(
      boid,
      allBoids,
      matedBoids,
      parameters.mateRadius
    );

    if (mate) {
      return {
        type: "pair_found",
        mateId: mate.id,
        updates: {
          energy: boid.energy,
          reproductionCooldown: boid.reproductionCooldown,
          matingBuildupCounter: boid.matingBuildupCounter,
          mateId: mate.id,
          seekingMate: boid.seekingMate,
        },
      };
    }
  }

  return { type: "no_action" };
}

// ============================================================================
// Update Helpers
// ============================================================================

/**
 * Apply updates to a boid (side effect)
 */
export function applyBoidUpdates(boid: Boid, updates: BoidUpdates): void {
  boid.energy = updates.energy;
  boid.reproductionCooldown = updates.reproductionCooldown;
  boid.matingBuildupCounter = updates.matingBuildupCounter;
  boid.mateId = updates.mateId;
  boid.seekingMate = updates.seekingMate;
}

/**
 * Increment mating buildup for both boids (side effect)
 */
export function incrementMatingBuildup(
  boid: Boid,
  mate: Boid,
  amount: number = 1
): void {
  boid.matingBuildupCounter += amount;
  mate.matingBuildupCounter += amount;
}

/**
 * Reset mating buildup for both boids (side effect)
 */
export function resetMatingBuildup(boid: Boid, mate: Boid): void {
  boid.matingBuildupCounter = 0;
  mate.matingBuildupCounter = 0;
}

/**
 * Pair two boids as mates (side effect)
 */
export function pairBoids(boid: Boid, mate: Boid): void {
  boid.mateId = mate.id;
  mate.mateId = boid.id;
}

/**
 * Unpair two boids (side effect)
 */
export function unpairBoids(boid: Boid, mate: Boid | null | undefined): void {
  if (mate) {
    mate.mateId = null;
  }
  boid.mateId = null;
}

// ============================================================================
// Mating Result Application (Side Effects)
// ============================================================================

/**
 * Apply mating result to the world (side effects)
 * Handles all cases of the mating state machine result
 *
 * This function encapsulates all side effects from mating:
 * - Updating boid states
 * - Pairing/unpairing boids
 * - Tracking mated boids
 * - Adding offspring to spawn queue
 */
export function applyMatingResult(
  boid: Boid,
  result: MatingResult,
  context: MatingContext
): void {
  const { boidsMap, matedBoids, boidsToAdd } = context;

  switch (result.type) {
    case "reproduction_complete": {
      // Apply updates to parent(s)
      applyBoidUpdates(boid, result.boidUpdates);

      // For sexual reproduction, update mate
      if (result.offspring.parent2Id) {
        const mate = boidsMap[result.offspring.parent2Id];
        if (mate) {
          applyBoidUpdates(mate, result.mateUpdates);
          matedBoids.add(result.offspring.parent2Id);
        }
      }

      // Mark parent as mated and add offspring to spawn queue
      matedBoids.add(boid.id);
      boidsToAdd.push(result.offspring);
      break;
    }

    case "pair_found": {
      const mate = boidsMap[result.mateId];
      if (mate) {
        pairBoids(boid, mate);
        matedBoids.add(boid.id);
        matedBoids.add(mate.id);
      }
      break;
    }

    case "building_up": {
      const mate = boidsMap[boid.mateId!];
      if (mate) {
        incrementMatingBuildup(boid, mate);
      }
      break;
    }

    case "buildup_reset": {
      const mate = boidsMap[boid.mateId!];
      if (mate) {
        resetMatingBuildup(boid, mate);
      }
      break;
    }

    case "mate_lost": {
      applyBoidUpdates(boid, result.updates);
      break;
    }

    case "no_action":
      // Nothing to do
      break;
  }
}
