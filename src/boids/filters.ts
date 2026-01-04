import type { Boid, BoidsById } from "./vocabulary/schemas/entities";

import { iterateBoids } from "./iterators";
import { SpeciesConfig } from "./vocabulary/schemas/species";
import { Role } from "./vocabulary/schemas/primitives";
import { roleKeywords } from "./vocabulary/keywords";

/**
 * Pure filter functions for boid collections
 * All functions are side-effect free and testable
 */

// ============================================================================
// Role Filters
// ============================================================================

/**
 * Filter boids by role (generic)
 */
export function getBoidsOfRole(
  boids: BoidsById,
  role: "prey" | "predator",
  speciesTypes: Record<string, SpeciesConfig>,
): Boid[] {
  const filteredBoids: Boid[] = [];
  for (const boid of iterateBoids(boids)) {
    const speciesConfig = speciesTypes[boid.typeId];
    if (speciesConfig?.role === role) {
      filteredBoids.push(boid);
    }
  }
  return filteredBoids;
}

/**
 * Filter boids to get only prey
 */
export function getPrey(
  boids: BoidsById,
  speciesTypes: Record<string, SpeciesConfig>,
): Boid[] {
  return getBoidsOfRole(boids, "prey", speciesTypes);
}

/**
 * Filter boids to get only predators
 */
export function getPredators(
  boids: BoidsById,
  speciesTypes: Record<string, SpeciesConfig>,
): Boid[] {
  return getBoidsOfRole(boids, "predator", speciesTypes);
}

/**
 * Filter boids excluding a specific boid
 */
export function getOtherBoids(boids: BoidsById, excludeId: string): Boid[] {
  const filteredBoids: Boid[] = [];
  for (const boidId in boids) {
    const boid = boids[boidId];
    if (boid.id !== excludeId) {
      filteredBoids.push(boid);
    }
  }
  return filteredBoids;
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

export function boidsByIdFromArray(boids: Boid[]): BoidsById {
  return boids.reduce((acc, boid) => {
    acc[boid.id] = boid;
    return acc;
  }, {} as BoidsById);
}

// ============================================================================
// Count Functions
// ============================================================================

/**
 * Count boids by role
 */
export function countByRole(
  boids: BoidsById,
  role: "prey" | "predator",
  speciesTypes: Record<string, SpeciesConfig>,
): number {
  return getBoidsOfRole(boids, role, speciesTypes).length;
}

/**
 * Count prey boids
 */
export function countPrey(
  boids: BoidsById,
  speciesTypes: Record<string, SpeciesConfig>,
): number {
  return countByRole(boids, "prey", speciesTypes);
}

/**
 * Count predator boids
 */
export function countPredators(
  boids: BoidsById,
  speciesTypes: Record<string, SpeciesConfig>,
): number {
  return countByRole(boids, "predator", speciesTypes);
}

export function countBoidsByRole(
  boids: BoidsById,
  speciesTypes: Record<string, SpeciesConfig>,
): Record<string, number> {
  const counts = {
    prey: 0,
    predator: 0,
  };
  for (const boid of iterateBoids(boids)) {
    const speciesConfig = speciesTypes[boid.typeId];
    if (speciesConfig?.role === "prey") {
      counts.prey++;
    } else if (speciesConfig?.role === "predator") {
      counts.predator++;
    }
  }
  return counts;
}

export function getBoidsByRole(
  boids: BoidsById,
  speciesTypes: Record<string, SpeciesConfig>,
): Record<Role, Boid[]> {
  const byRole = {
    prey: [],
    predator: [],
  } as Record<Role, Boid[]>;
  for (const boid of iterateBoids(boids)) {
    const speciesConfig = speciesTypes[boid.typeId];
    if (speciesConfig?.role === roleKeywords.prey) {
      byRole.prey.push(boid);
    } else if (speciesConfig?.role === roleKeywords.predator) {
      byRole.predator.push(boid);
    }
  }
  return byRole;
}
