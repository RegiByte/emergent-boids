import {SpeciesConfig} from "../vocabulary/schemas/prelude.ts";

/**
 * Check if offspring can be spawned given population caps
 */
export function canSpawnOffspring(
  typeId: string,
  speciesTypes: Record<string, SpeciesConfig>,
  worldLimits: {
    maxBoids: number;
    maxPreyBoids: number;
    maxPredatorBoids: number;
  },
  worldStats: {
    totalBoids: number;
    totalPrey: number;
    totalPredators: number;
  },
  currentTypeCount: number = 0 // Current count of this specific type
): boolean {
  const speciesConfig = speciesTypes[typeId];
  if (!speciesConfig) {
    console.warn(`Unknown species: ${typeId}`);
    return false;
  }
  if (
    speciesConfig.role === "prey" &&
    worldStats.totalPrey >= worldLimits.maxPreyBoids
  ) {
    return false;
  }
  if (
    speciesConfig.role === "predator" &&
    worldStats.totalPredators >= worldLimits.maxPredatorBoids
  ) {
    return false;
  }

  // Check per-type cap (if specified)
  if (
    speciesConfig.limits.maxPopulation !== undefined &&
    currentTypeCount >= speciesConfig.limits.maxPopulation
  ) {
    return false;
  }

  return true;
}
