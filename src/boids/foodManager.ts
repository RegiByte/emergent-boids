import type { BoidsById, FoodSource } from './vocabulary/schemas/entities'
import type { SpeciesConfig } from './vocabulary/schemas/species'
import type { WorldConfig } from './vocabulary/schemas/world'
import type { Boid } from './vocabulary/schemas/entities'
import { FOOD_CONSTANTS } from './food'
import type { DomainRNG } from '@/lib/seededRandom'
import { filterBoidsWhere } from './iterators'

/**
 * Food Management System
 *
 * Pure functions for managing food sources in the ecosystem.
 * Separates logic (what to do) from effects (how to do it).
 */

export type FoodSourceUpdate = {
  foodSources: FoodSource[]
  boidsToUpdate: Array<{ boid: Boid; energyGain: number }>
}

export type FoodSpawnResult = {
  newFoodSources: FoodSource[]
  shouldUpdate: boolean
}

/**
 * Create a predator food source from caught prey
 * Pure function - returns new food source without side effects
 */
export function createPredatorFood(
  preyEnergy: number,
  preyPosition: { x: number; y: number },
  currentTick: number,
  rng: DomainRNG,
  simulationTime: number // NEW: Pass simulation time for ID generation
): FoodSource {
  const foodEnergy =
    preyEnergy * FOOD_CONSTANTS.PREDATOR_FOOD_FROM_PREY_MULTIPLIER
  const randomId = Math.floor(rng.next() * 1_000_000)

  return {
    id: `food-predator-${simulationTime}-${randomId}`,
    position: preyPosition,
    energy: foodEnergy,
    maxEnergy: foodEnergy,
    sourceType: 'predator',
    createdFrame: currentTick,
  }
}

/**
 * Check if we can create a predator food source (cap check)
 */
export function canCreatePredatorFood(
  currentFoodSources: FoodSource[]
): boolean {
  const existingPredatorFoodCount = currentFoodSources.filter(
    (food) => food.sourceType === 'predator'
  ).length

  return existingPredatorFoodCount < FOOD_CONSTANTS.MAX_PREDATOR_FOOD_SOURCES
}

/**
 * Generate new prey food sources
 * Pure function - returns array of new food sources
 */
export function generatePreyFood(
  currentFoodSources: FoodSource[],
  world: WorldConfig,
  currentTick: number,
  rng: DomainRNG,
  simulationTime: number // NEW: Pass simulation time for ID generation
): FoodSpawnResult {
  const existingPreyFoodCount = currentFoodSources.filter(
    (food) => food.sourceType === 'prey'
  ).length

  if (existingPreyFoodCount >= FOOD_CONSTANTS.MAX_PREY_FOOD_SOURCES) {
    return { newFoodSources: [], shouldUpdate: false }
  }

  const maxToSpawn = Math.min(
    FOOD_CONSTANTS.PREY_FOOD_SPAWN_COUNT,
    FOOD_CONSTANTS.MAX_PREY_FOOD_SOURCES - existingPreyFoodCount
  )

  const newFoodSources: FoodSource[] = []

  for (let i = 0; i < maxToSpawn; i++) {
    const randomId = Math.floor(rng.next() * 1000000000)
    newFoodSources.push({
      id: `food-prey-${simulationTime}-${randomId}-${i}`,
      position: {
        x: rng.range(0, world.width),
        y: rng.range(0, world.height),
      },
      energy: FOOD_CONSTANTS.PREY_FOOD_INITIAL_ENERGY,
      maxEnergy: FOOD_CONSTANTS.PREY_FOOD_INITIAL_ENERGY,
      sourceType: 'prey',
      createdFrame: currentTick,
    })
  }

  return { newFoodSources, shouldUpdate: newFoodSources.length > 0 }
}

/**
 * Check if a boid can eat from a food source
 */
function canBoidEatFood(
  boid: Boid,
  food: FoodSource,
  speciesConfig: SpeciesConfig
): boolean {
  if (food.sourceType === 'prey' && speciesConfig.role !== 'prey') return false
  if (food.sourceType === 'predator' && speciesConfig.role !== 'predator')
    return false

  if (boid.stance !== 'eating') return false

  if (boid.eatingCooldownFrames > 0) return false

  const dx = boid.position.x - food.position.x
  const dy = boid.position.y - food.position.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  return dist < FOOD_CONSTANTS.FOOD_CONSUMPTION_RADIUS
}

/**
 * Process food consumption for all food sources
 * Pure function - returns updated food sources and boid energy changes
 */
export function processFoodConsumption(
  foodSources: FoodSource[],
  boids: BoidsById,
  speciesTypes: Record<string, SpeciesConfig>
): FoodSourceUpdate {
  const updatedFoodSources: FoodSource[] = []
  const boidsToUpdate: Array<{ boid: Boid; energyGain: number }> = []

  for (const food of foodSources) {
    if (food.energy <= 0) {
      continue
    }

    const eatingBoids = filterBoidsWhere(boids, (boid) => {
      const speciesConfig = speciesTypes[boid.typeId]
      if (!speciesConfig) return false
      return canBoidEatFood(boid, food, speciesConfig)
    })

    if (eatingBoids.length > 0) {
      const consumptionRate =
        food.sourceType === 'prey'
          ? FOOD_CONSTANTS.PREY_FOOD_CONSUMPTION_RATE
          : FOOD_CONSTANTS.PREDATOR_FOOD_CONSUMPTION_RATE

      const totalConsumption = consumptionRate * eatingBoids.length
      const actualConsumption = Math.min(totalConsumption, food.energy)
      const perBoidGain = actualConsumption / eatingBoids.length

      for (const boid of eatingBoids) {
        boidsToUpdate.push({ boid, energyGain: perBoidGain })
      }

      updatedFoodSources.push({
        ...food,
        energy: food.energy - actualConsumption,
      })
    } else {
      updatedFoodSources.push(food)
    }
  }

  return {
    foodSources: updatedFoodSources,
    boidsToUpdate,
  }
}

/**
 * Apply energy gains to boids (mutates boids)
 * This is the only impure function - clearly separated
 */
export function applyEnergyGains(
  boidsToUpdate: Array<{ boid: Boid; energyGain: number }>,
  _speciesTypes: Record<string, SpeciesConfig>
): void {
  for (const { boid, energyGain } of boidsToUpdate) {
    boid.energy = Math.min(boid.energy + energyGain, boid.phenotype.maxEnergy)
  }
}

/**
 * Check if food sources have changed (for optimization)
 */
export function haveFoodSourcesChanged(
  oldSources: FoodSource[],
  newSources: FoodSource[]
): boolean {
  if (oldSources.length !== newSources.length) return true

  return newSources.some((food, idx) => food.energy !== oldSources[idx]?.energy)
}
