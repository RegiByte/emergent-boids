import type { Boid, BoidTypeConfig } from "./types";
import { isPrey, isPredator } from "./predicates";

/**
 * Pure filter functions for boid collections
 * All functions are side-effect free and testable
 */

// ============================================================================
// Role Filters
// ============================================================================

/**
 * Filter boids to get only prey
 */
export function getPrey(
  boids: Boid[],
  types: Record<string, BoidTypeConfig>
): Boid[] {
  return boids.filter((boid) => isPrey(boid, types));
}

/**
 * Filter boids to get only predators
 */
export function getPredators(
  boids: Boid[],
  types: Record<string, BoidTypeConfig>
): Boid[] {
  return boids.filter((boid) => isPredator(boid, types));
}

/**
 * Filter boids by role (generic)
 */
export function getBoidsOfRole(
  boids: Boid[],
  role: "prey" | "predator",
  types: Record<string, BoidTypeConfig>
): Boid[] {
  return boids.filter((boid) => {
    const typeConfig = types[boid.typeId];
    return typeConfig?.role === role;
  });
}

/**
 * Filter boids excluding a specific boid
 */
export function getOtherBoids(boids: Boid[], excludeId: string): Boid[] {
  return boids.filter((boid) => boid.id !== excludeId);
}

/**
 * Filter boids of the same type
 */
export function getBoidsOfSameType(boids: Boid[], typeId: string): Boid[] {
  return boids.filter((boid) => boid.typeId === typeId);
}

/**
 * Find a boid by id
 */
export function findBoidById(boids: Boid[], id: string | undefined | null): Boid | undefined {
  return boids.find((boid) => boid.id === id);
}

// ============================================================================
// Count Functions
// ============================================================================

/**
 * Count boids by role
 */
export function countByRole(
  boids: Boid[],
  role: "prey" | "predator",
  types: Record<string, BoidTypeConfig>
): number {
  return getBoidsOfRole(boids, role, types).length;
}

/**
 * Count prey boids
 */
export function countPrey(
  boids: Boid[],
  types: Record<string, BoidTypeConfig>
): number {
  return countByRole(boids, "prey", types);
}

/**
 * Count predator boids
 */
export function countPredators(
  boids: Boid[],
  types: Record<string, BoidTypeConfig>
): number {
  return countByRole(boids, "predator", types);
}
