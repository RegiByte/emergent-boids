import type {
  FoodSource,
  SpeciesConfig,
  WorldConfig,
} from "./vocabulary/schemas/prelude.ts";
import type { Boid } from "./vocabulary/schemas/prelude.ts";
import { FOOD_CONSTANTS } from "./food";

/**
 * Food Management System
 *
 * Pure functions for managing food sources in the ecosystem.
 * Separates logic (what to do) from effects (how to do it).
 */

// ============================================
// Types
// ============================================

export type FoodSourceUpdate = {
  foodSources: FoodSource[];
  boidsToUpdate: Array<{ boid: Boid; energyGain: number }>;
};

export type FoodSpawnResult = {
  newFoodSources: FoodSource[];
  shouldUpdate: boolean;
};

// ============================================
// Pure Logic Functions
// ============================================

/**
 * Create a predator food source from caught prey
 * Pure function - returns new food source without side effects
 */
export function createPredatorFood(
  preyEnergy: number,
  preyPosition: { x: number; y: number },
  currentTick: number
): FoodSource {
  const foodEnergy =
    preyEnergy * FOOD_CONSTANTS.PREDATOR_FOOD_FROM_PREY_MULTIPLIER;
  const randomNumber = Math.random().toString(36).substring(2, 15);
  const now = Date.now();

  return {
    id: `food-predator-${now}-${randomNumber}`,
    position: preyPosition,
    energy: foodEnergy,
    maxEnergy: foodEnergy,
    sourceType: "predator",
    createdTick: currentTick,
  };
}

/**
 * Check if we can create a predator food source (cap check)
 */
export function canCreatePredatorFood(
  currentFoodSources: FoodSource[]
): boolean {
  const existingPredatorFoodCount = currentFoodSources.filter(
    (food) => food.sourceType === "predator"
  ).length;

  return existingPredatorFoodCount < FOOD_CONSTANTS.MAX_PREDATOR_FOOD_SOURCES;
}

/**
 * Generate new prey food sources
 * Pure function - returns array of new food sources
 */
export function generatePreyFood(
  currentFoodSources: FoodSource[],
  world: WorldConfig,
  currentTick: number
): FoodSpawnResult {
  // Count existing prey food sources
  const existingPreyFoodCount = currentFoodSources.filter(
    (food) => food.sourceType === "prey"
  ).length;

  // Don't spawn if at or above cap
  if (existingPreyFoodCount >= FOOD_CONSTANTS.MAX_PREY_FOOD_SOURCES) {
    return { newFoodSources: [], shouldUpdate: false };
  }

  // Calculate how many we can spawn
  const maxToSpawn = Math.min(
    FOOD_CONSTANTS.PREY_FOOD_SPAWN_COUNT,
    FOOD_CONSTANTS.MAX_PREY_FOOD_SOURCES - existingPreyFoodCount
  );

  const newFoodSources: FoodSource[] = [];

  for (let i = 0; i < maxToSpawn; i++) {
    newFoodSources.push({
      id: `food-prey-${Date.now()}-${Math.random()}-${i}`,
      position: {
        x: Math.random() * world.canvasWidth,
        y: Math.random() * world.canvasHeight,
      },
      energy: FOOD_CONSTANTS.PREY_FOOD_INITIAL_ENERGY,
      maxEnergy: FOOD_CONSTANTS.PREY_FOOD_INITIAL_ENERGY,
      sourceType: "prey",
      createdTick: currentTick,
    });
  }

  return { newFoodSources, shouldUpdate: newFoodSources.length > 0 };
}

/**
 * Check if a boid can eat from a food source
 */
function canBoidEatFood(
  boid: Boid,
  food: FoodSource,
  speciesConfig: SpeciesConfig
): boolean {
  // Must be correct role
  if (food.sourceType === "prey" && speciesConfig.role !== "prey") return false;
  if (food.sourceType === "predator" && speciesConfig.role !== "predator")
    return false;

  // Must be in eating stance
  if (boid.stance !== "eating") return false;

  // Must NOT have eating cooldown (respects turn-taking)
  if (boid.eatingCooldown > 0) return false;

  // Must be close enough
  const dx = boid.position.x - food.position.x;
  const dy = boid.position.y - food.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < FOOD_CONSTANTS.FOOD_CONSUMPTION_RADIUS;
}

/**
 * Process food consumption for all food sources
 * Pure function - returns updated food sources and boid energy changes
 */
export function processFoodConsumption(
  foodSources: FoodSource[],
  boids: Boid[],
  speciesTypes: Record<string, SpeciesConfig>
): FoodSourceUpdate {
  const updatedFoodSources: FoodSource[] = [];
  const boidsToUpdate: Array<{ boid: Boid; energyGain: number }> = [];

  // Process each food source
  for (const food of foodSources) {
    // Skip exhausted food (will be filtered out)
    if (food.energy <= 0) {
      continue;
    }

    // Find boids eating from this source
    const eatingBoids = boids.filter((boid) => {
      const speciesConfig = speciesTypes[boid.typeId];
      if (!speciesConfig) return false;
      return canBoidEatFood(boid, food, speciesConfig);
    });

    if (eatingBoids.length > 0) {
      // Calculate consumption
      const consumptionRate =
        food.sourceType === "prey"
          ? FOOD_CONSTANTS.PREY_FOOD_CONSUMPTION_RATE
          : FOOD_CONSTANTS.PREDATOR_FOOD_CONSUMPTION_RATE;

      const totalConsumption = consumptionRate * eatingBoids.length;
      const actualConsumption = Math.min(totalConsumption, food.energy);
      const perBoidGain = actualConsumption / eatingBoids.length;

      // Record energy gains for each boid
      for (const boid of eatingBoids) {
        boidsToUpdate.push({ boid, energyGain: perBoidGain });
      }

      // Update food energy
      updatedFoodSources.push({
        ...food,
        energy: food.energy - actualConsumption,
      });
    } else {
      // No consumption, keep food as-is
      updatedFoodSources.push(food);
    }
  }

  return {
    foodSources: updatedFoodSources,
    boidsToUpdate,
  };
}

// ============================================
// Side Effect Functions (for lifecycleManager)
// ============================================

/**
 * Apply energy gains to boids (mutates boids)
 * This is the only impure function - clearly separated
 */
export function applyEnergyGains(
  boidsToUpdate: Array<{ boid: Boid; energyGain: number }>,
  speciesTypes: Record<string, SpeciesConfig>
): void {
  for (const { boid, energyGain } of boidsToUpdate) {
    const speciesConfig = speciesTypes[boid.typeId];
    if (speciesConfig) {
      boid.energy = Math.min(
        boid.energy + energyGain,
        speciesConfig.lifecycle.maxEnergy
      );
    }
  }
}

/**
 * Check if food sources have changed (for optimization)
 */
export function haveFoodSourcesChanged(
  oldSources: FoodSource[],
  newSources: FoodSource[]
): boolean {
  if (oldSources.length !== newSources.length) return true;

  return newSources.some(
    (food, idx) => food.energy !== oldSources[idx]?.energy
  );
}
