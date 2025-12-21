import type { BoidConfig, BoidTypeConfig } from "../types";

/**
 * Check if offspring can be spawned given population caps
 */
export function canSpawnOffspring(
  typeId: string,
  currentBoidCount: number,
  currentPreyCount: number,
  currentPredatorCount: number,
  config: BoidConfig,
  typeConfigs: Record<string, BoidTypeConfig>,
  currentTypeCount: number = 0 // NEW: Current count of this specific type
): boolean {
  const typeConfig = typeConfigs[typeId];
  if (!typeConfig) return false;

  // Check global cap
  if (currentBoidCount >= config.maxBoids) {
    return false;
  }

  // Check per-role cap
  if (typeConfig.role === "prey" && currentPreyCount >= config.maxPreyBoids) {
    return false;
  }
  if (
    typeConfig.role === "predator" &&
    currentPredatorCount >= config.maxPredatorBoids
  ) {
    return false;
  }

  // Check per-type cap (if specified)
  if (typeConfig.maxPopulation !== undefined && currentTypeCount >= typeConfig.maxPopulation) {
    return false;
  }

  return true;
}

