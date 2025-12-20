import type { Boid, BoidConfig, BoidTypeConfig, Vector2 } from "./types";
import * as vec from "./vector";

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
  types: Record<string, BoidTypeConfig>
): boolean {
  const typeConfig = types[boid.typeId];
  return typeConfig?.role === "prey";
}

/**
 * Check if a boid is a predator
 */
export function isPredator(
  boid: Boid,
  types: Record<string, BoidTypeConfig>
): boolean {
  const typeConfig = types[boid.typeId];
  return typeConfig?.role === "predator";
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
  typeConfig: BoidTypeConfig
): boolean {
  return boid.energy < typeConfig.maxEnergy * 0.3;
}

/**
 * Check if boid energy is above active threshold (50%)
 * Predators exit idle state at this threshold (hysteresis)
 */
export function isEnergyAboveActiveThreshold(
  boid: Boid,
  typeConfig: BoidTypeConfig
): boolean {
  return boid.energy >= typeConfig.maxEnergy * 0.5;
}

/**
 * Check if boid has enough energy to reproduce
 */
export function hasReproductionEnergy(
  boid: Boid,
  config: BoidConfig,
  typeConfig: BoidTypeConfig
): boolean {
  const threshold = typeConfig.maxEnergy * config.reproductionEnergyThreshold;
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
  config: BoidConfig,
  typeConfig: BoidTypeConfig
): boolean {
  return (
    boid.age >= config.minReproductionAge &&
    hasReproductionEnergy(boid, config, typeConfig) &&
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
 * Note: We check seekingMate flag which is set by energyManager based on isReadyToMate
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
    boid.seekingMate && // Cached state, updated by energyManager
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
  typeConfig: BoidTypeConfig
): boolean {
  return boid.stance !== "idle" && isEnergyBelowIdleThreshold(boid, typeConfig);
}

/**
 * Check if predator should exit idle stance (energy recovered)
 */
export function shouldExitIdleStance(
  boid: Boid,
  typeConfig: BoidTypeConfig
): boolean {
  return (
    boid.stance === "idle" && isEnergyAboveActiveThreshold(boid, typeConfig)
  );
}

/**
 * Check if predator should stay in idle stance (still recovering)
 */
export function shouldStayIdle(
  boid: Boid,
  typeConfig: BoidTypeConfig
): boolean {
  return boid.stance === "idle" && !shouldExitIdleStance(boid, typeConfig);
}

// ============================================================================
// Age Predicates
// ============================================================================

/**
 * Check if boid has died from old age
 */
export function hasDiedFromOldAge(
  boid: Boid,
  typeConfig: BoidTypeConfig
): boolean {
  return typeConfig.maxAge > 0 && boid.age >= typeConfig.maxAge;
}

/**
 * Check if boid has died from starvation (predators only)
 */
export function hasDiedFromStarvation(boid: Boid): boolean {
  return boid.energy <= 0;
}
