import type { Vector2 } from "./types";

/**
 * Pure calculation functions for boid physics and energy
 * All functions are side-effect free and testable
 */

// ============================================================================
// Energy Calculations
// ============================================================================

/**
 * Calculate speed factor based on energy level
 * Well-fed predators are faster, starving ones are slower
 * Formula: 0.5x (near death) to 1.3x (full energy)
 */
export function calculateEnergySpeedFactor(
  energy: number,
  maxEnergy: number
): number {
  const energyRatio = energy / maxEnergy;
  return 0.5 + energyRatio * 0.8; // Range: 0.5 to 1.3
}

/**
 * Calculate speed boost from fear (adrenaline rush)
 * Higher fear factor = bigger boost
 * Formula: maxSpeed * (1 + fearFactor * 0.5)
 * Examples: 0.8 fear = 40% boost, 0.5 fear = 25% boost
 */
export function calculateFearSpeedBoost(fearFactor: number): number {
  return 1 + fearFactor * 0.5;
}

/**
 * Calculate energy gained while idle (resting)
 * Predators gain 30% of their normal gain rate while resting
 */
export function calculateIdleEnergyGain(
  gainRate: number,
  deltaSeconds: number
): number {
  return gainRate * deltaSeconds * 0.3; // 30% of normal gain rate
}

/**
 * Calculate energy cost of reproduction
 * Both parents lose 50% of their max energy
 */
export function calculateReproductionEnergyCost(maxEnergy: number): number {
  return maxEnergy * 0.5;
}

/**
 * Calculate eating stance speed reduction
 * Eating predators drift at 35% of normal speed
 */
export function calculateEatingSpeedFactor(): number {
  return 0.35;
}

// ============================================================================
// Position Calculations
// ============================================================================

/**
 * Calculate offspring spawn position (midpoint between parents)
 */
export function calculateOffspringPosition(
  parent1: Vector2,
  parent2: Vector2
): Vector2 {
  return {
    x: (parent1.x + parent2.x) / 2,
    y: (parent1.y + parent2.y) / 2,
  };
}

/**
 * Calculate spawn position near parent with random offset
 */
export function calculateNearbySpawnPosition(
  parentPosition: Vector2,
  offset: number,
  width: number,
  height: number
): Vector2 {
  return {
    x: (parentPosition.x + (Math.random() - 0.5) * offset + width) % width,
    y: (parentPosition.y + (Math.random() - 0.5) * offset + height) % height,
  };
}

// ============================================================================
// Weight Calculations (Stance-Based)
// ============================================================================

/**
 * Calculate cohesion weight based on prey stance
 */
export function calculatePreyCohesionWeight(
  baseWeight: number,
  stance: "flocking" | "seeking_mate" | "mating" | "fleeing"
): number {
  switch (stance) {
    case "seeking_mate":
      return baseWeight * 0.3; // Reduce cohesion when seeking mate
    case "mating":
      return baseWeight * 1.5; // Strong cohesion with mate
    case "fleeing":
      return baseWeight * 0.5; // Reduce cohesion when fleeing (scatter!)
    case "flocking":
    default:
      return baseWeight;
  }
}

/**
 * Calculate separation weight based on predator stance
 */
export function calculatePredatorSeparationWeight(
  baseWeight: number,
  stance: "hunting" | "seeking_mate" | "mating" | "idle" | "eating"
): number {
  if (stance === "mating") {
    return baseWeight * 0.3; // Allow closeness when mating
  }
  return baseWeight;
}

/**
 * Calculate chase weight based on predator stance
 */
export function calculatePredatorChaseWeight(
  stance: "hunting" | "seeking_mate" | "mating" | "idle" | "eating"
): number {
  switch (stance) {
    case "hunting":
      return 3.0; // Strong chase when hunting
    case "idle":
      return 0.5; // Minimal movement when resting
    case "seeking_mate":
    case "mating":
      return 1.5; // Reduced chase when focused on mating
    case "eating":
      return 0.0; // No chase while eating
    default:
      return 1.0;
  }
}

// ============================================================================
// Distance Calculations
// ============================================================================

/**
 * Calculate Euclidean distance between two points
 */
export function calculateDistance(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate squared distance (faster, for comparisons)
 */
export function calculateDistanceSquared(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
