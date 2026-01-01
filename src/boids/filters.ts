import type { Boid } from "./vocabulary/schemas/entities";
import { isPrey, isPredator } from "./predicates";

import { SpeciesConfig } from "./vocabulary/schemas/species";

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
  speciesTypes: Record<string, SpeciesConfig>,
): Boid[] {
  return boids.filter((boid) => isPrey(boid, speciesTypes));
}

/**
 * Filter boids to get only predators
 */
export function getPredators(
  boids: Boid[],
  speciesTypes: Record<string, SpeciesConfig>,
): Boid[] {
  return boids.filter((boid) => isPredator(boid, speciesTypes));
}

/**
 * Filter boids by role (generic)
 */
export function getBoidsOfRole(
  boids: Boid[],
  role: "prey" | "predator",
  speciesTypes: Record<string, SpeciesConfig>,
): Boid[] {
  return boids.filter((boid) => {
    const speciesConfig = speciesTypes[boid.typeId];
    return speciesConfig?.role === role;
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
export function findBoidById(
  boids: Boid[],
  id: string | undefined | null,
): Boid | undefined {
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
  speciesTypes: Record<string, SpeciesConfig>,
): number {
  return getBoidsOfRole(boids, role, speciesTypes).length;
}

/**
 * Count prey boids
 */
export function countPrey(
  boids: Boid[],
  speciesTypes: Record<string, SpeciesConfig>,
): number {
  return countByRole(boids, "prey", speciesTypes);
}

/**
 * Count predator boids
 */
export function countPredators(
  boids: Boid[],
  speciesTypes: Record<string, SpeciesConfig>,
): number {
  return countByRole(boids, "predator", speciesTypes);
}
