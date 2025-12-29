import type { Boid } from "./vocabulary/schemas/prelude.ts";
import type { Vector2 } from "./vocabulary/schemas/prelude.ts";
import * as vec from "./vector";
import {
  SimulationParameters,
  SpeciesConfig,
} from "./vocabulary/schemas/prelude.ts";

/**
 * Pure predicates for boid state and behavior
 * All functions are side-effect free and testable
 */

// ============================================================================
// Distance Predicates
// ============================================================================

/**
 * Check if two points are within a given radius (Euclidean distance)
 */
export function isWithinRadius(
  a: Vector2,
  b: Vector2,
  radius: number
): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distSq = dx * dx + dy * dy;
  return distSq < radius * radius;
}

/**
 * Check if two points are within a given radius (toroidal distance)
 */
export function isWithinToroidalRadius(
  a: Vector2,
  b: Vector2,
  radius: number,
  width: number,
  height: number
): boolean {
  const dist = vec.toroidalDistance(a, b, width, height);
  return dist < radius;
}

// ============================================================================
// Role Predicates
// ============================================================================

/**
 * Check if a boid is prey
 */
export function isPrey(
  boid: Boid,
  speciesTypes: Record<string, SpeciesConfig>
): boolean {
  const speciesConfig = speciesTypes[boid.typeId];
  return speciesConfig?.role === "prey";
}

/**
 * Check if a boid is a predator
 */
export function isPredator(
  boid: Boid,
  speciesTypes: Record<string, SpeciesConfig>
): boolean {
  const speciesConfig = speciesTypes[boid.typeId];
  return speciesConfig?.role === "predator";
}

/**
 * Check if two boids have the same type
 */
export function isSameType(boid1: Boid, boid2: Boid): boolean {
  return boid1.typeId === boid2.typeId;
}

// ============================================================================
// Energy Predicates
// ============================================================================

/**
 * Check if boid energy is below idle threshold (30%)
 * Predators enter idle state at this threshold
 */
export function isEnergyBelowIdleThreshold(
  boid: Boid,
  speciesConfig: SpeciesConfig
): boolean {
  return boid.energy < speciesConfig.lifecycle.maxEnergy * 0.3;
}

/**
 * Check if boid energy is above active threshold (50%)
 * Predators exit idle state at this threshold (hysteresis)
 */
export function isEnergyAboveActiveThreshold(
  boid: Boid,
  speciesConfig: SpeciesConfig
): boolean {
  return boid.energy >= speciesConfig.lifecycle.maxEnergy * 0.5;
}

/**
 * Check if boid has enough energy to reproduce
 */
export function hasReproductionEnergy(
  boid: Boid,
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig
): boolean {
  const threshold =
    speciesConfig.lifecycle.maxEnergy * parameters.reproductionEnergyThreshold;
  return boid.energy >= threshold;
}

// ============================================================================
// Mating Predicates
// ============================================================================

/**
 * Check if boid is ready to mate (age, energy, cooldown)
 */
export function isReadyToMate(
  boid: Boid,
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig
): boolean {
  return (
    boid.age >= boid.phenotype.minReproductionAge &&
    hasReproductionEnergy(boid, parameters, speciesConfig) &&
    boid.reproductionCooldown === 0
  );
}

/**
 * Check if boid is currently seeking a mate (derived from stance)
 */
export function isSeekingMate(boid: Boid): boolean {
  return boid.stance === "seeking_mate" || boid.stance === "mating";
}

/**
 * Check if boid is eligible as a mate for another boid
 * Note: We check seekingMate flag which is set by lifecycleManager based on isReadyToMate
 * This is intentional - seekingMate acts as a cached state for performance
 */
export function isEligibleMate(
  boid: Boid,
  otherBoid: Boid,
  alreadyMated: Set<string>
): boolean {
  return (
    boid.id !== otherBoid.id &&
    boid.typeId === otherBoid.typeId &&
    boid.seekingMate && // Cached state, updated by lifecycleManager
    boid.reproductionCooldown === 0 &&
    !alreadyMated.has(boid.id)
  );
}

// ============================================================================
// Stance Predicates
// ============================================================================

/**
 * Check if predator should enter idle stance (low energy)
 */
export function shouldEnterIdleStance(
  boid: Boid,
  speciesConfig: SpeciesConfig
): boolean {
  return (
    boid.stance !== "idle" && isEnergyBelowIdleThreshold(boid, speciesConfig)
  );
}

/**
 * Check if predator should exit idle stance (energy recovered)
 */
export function shouldExitIdleStance(
  boid: Boid,
  speciesConfig: SpeciesConfig
): boolean {
  return (
    boid.stance === "idle" && isEnergyAboveActiveThreshold(boid, speciesConfig)
  );
}

/**
 * Check if predator should stay in idle stance (still recovering)
 */
export function shouldStayIdle(
  boid: Boid,
  speciesConfig: SpeciesConfig
): boolean {
  return boid.stance === "idle" && !shouldExitIdleStance(boid, speciesConfig);
}

// ============================================================================
// Age Predicates
// ============================================================================

/**
 * Check if boid has died from old age
 */
export function hasDiedFromOldAge(boid: Boid): boolean {
  return boid.phenotype.maxAge > 0 && boid.age >= boid.phenotype.maxAge;
}

/**
 * Check if boid has died from starvation (predators only)
 */
export function hasDiedFromStarvation(boid: Boid): boolean {
  return boid.energy <= 0;
}
