import {
  applyBehaviorDecision,
  buildBehaviorContext,
  evaluateBehavior,
} from '@/boids/behavior/evaluator'
import {
  createBehaviorRuleset,
  MINIMUM_STANCE_DURATION_FRAMES,
} from '@/boids/behavior/rules'
import { createBoidOfType } from '@/boids/boid'
import { BoidUpdateContext } from '@/boids/context'
import { defaultWorldPhysics } from '@/boids/defaultPhysics'
import { countBoidsByRole } from '@/boids/filters'
import { FOOD_CONSTANTS } from '@/boids/food'
import { isDead } from '@/boids/lifecycle/health'
import { canSpawnOffspring } from '@/boids/lifecycle/population'
import { isReadyToMate } from '@/boids/predicates'
import { ItemWithDistance } from '@/boids/spatialHash'
import * as vec from '@/boids/vector'
import {
  eventKeywords,
  lifecycleKeywords,
  roleKeywords,
} from '@/boids/vocabulary/keywords'
import {
  Boid,
  BoidsById,
  DeathMarker,
  FoodSource,
} from '@/boids/vocabulary/schemas/entities'
import {
  CatchEvent,
  LifecycleEvent,
} from '@/boids/vocabulary/schemas/events'
import { Vector2 } from '@/boids/vocabulary/schemas/primitives'
import { SpeciesConfig } from '@/boids/vocabulary/schemas/species'
import {
  WorldConfig,
  WorldPhysics,
  SimulationParameters,
} from '@/boids/vocabulary/schemas/world'
import { DomainRNG } from '@/lib/seededRandom'
import { Profiler } from '@/resources/shared/profiler'

type BehaviorRuleset = ReturnType<typeof createBehaviorRuleset>

/**
 * Core Engine Logic - Pure Functions
 *
 * This module contains all simulation logic shared between browser and worker engines.
 * Philosophy: "Everything is information processing. Simple rules compose."
 *
 * Key principle: No side effects, no environment-specific code.
 * Adapters (browser/worker) handle I/O, state management, and communication.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ConfigContext = {
  parameters: SimulationParameters
  species: Record<string, SpeciesConfig>
  world: WorldConfig
  physics?: WorldPhysics
}

export type LifecycleCollector = {
  collect: (event: LifecycleEvent) => void
}

export type LifecycleApplicationResult = {
  boidsToRemove: string[]
  boidsToAdd: Boid[]
  foodConsumption: Map<string, number>
  deathMarkers: DeathMarker[]
  catchEvents: CatchEvent[]
  reproductionEvents: Array<{
    parentId: string
    childId: string
    typeId: string
    offspringCount: number
    parent2Id?: string
  }>
}

// ============================================================================
// BEHAVIOR EVALUATION
// ============================================================================

/**
 * Evaluate boid behavior and apply decision
 *
 * This is the core AI logic - determines what stance a boid should take
 * based on its surroundings and internal state.
 */
export const evaluateBoidBehaviorCore = (
  boid: Boid,
  context: BoidUpdateContext,
  config: ConfigContext,
  behaviorRuleset: BehaviorRuleset,
  currentFrame: number,
  boidsCount: number,
  profiler?: Profiler
): void => {
  const speciesConfig = config.species[boid.typeId]
  if (!speciesConfig) return

  const role = speciesConfig.role
  const parameters = config.parameters

  const nearbyPredators =
    role === roleKeywords.prey
      ? context.nearbyPredators.filter((p) => {
          const fearRadius =
            speciesConfig.limits.fearRadius ?? parameters.fearRadius
          return p.distance < fearRadius
        })
      : []

  const nearbyPrey =
    role === roleKeywords.predator
      ? context.nearbyPrey.filter((p) => p.distance < parameters.chaseRadius)
      : []

  const nearbyFlock: ItemWithDistance<Boid>[] = []
  const boidsToCheck =
    role === roleKeywords.predator ? context.nearbyPredators : context.nearbyPrey

  for (const nearbyBoid of boidsToCheck) {
    if (
      nearbyBoid.item.typeId === boid.typeId &&
      nearbyBoid.item.id !== boid.id
    ) {
      nearbyFlock.push(nearbyBoid)
    }
  }

  const populationRatio = boidsCount / parameters.maxBoids
  const readyToMate = isReadyToMate(boid, parameters, speciesConfig)

  const behaviorContext = buildBehaviorContext(boid, speciesConfig, {
    frame: currentFrame,
    populationRatio,
    readyToMate,
    nearbyPredators,
    nearbyPrey,
    nearbyFood: context.nearbyFoodSources,
    nearbyFlock,
  })

  const decision = evaluateBehavior(behaviorContext, behaviorRuleset, role)

  if (decision) {
    applyBehaviorDecision(
      boid,
      decision,
      currentFrame,
      MINIMUM_STANCE_DURATION_FRAMES,
      profiler
    )
  }
}

// ============================================================================
// COMBAT SYSTEM
// ============================================================================

/**
 * Process predator attacks on nearby prey
 *
 * Handles damage, knockback, and death collection.
 * Returns catch events for food creation.
 */
export const processPredatorAttack = (
  predator: Boid,
  nearbyPrey: ItemWithDistance<Boid>[],
  config: ConfigContext,
  lifecycleCollector: LifecycleCollector
): void => {
  if (predator.attackCooldownFrames > 0) return

  for (const { item: potentialPrey, distance } of nearbyPrey) {
    if (distance < config.parameters.catchRadius) {
      const damage = predator.phenotype.attackDamage
      potentialPrey.health -= damage

      const knockbackDirection = vec.toroidalSubtract(
        potentialPrey.position,
        predator.position,
        config.world.width,
        config.world.height
      )
      const pushDist = vec.magnitude(knockbackDirection)
      if (pushDist > 0) {
        const nx = knockbackDirection.x / pushDist
        const ny = knockbackDirection.y / pushDist
        const sizeRatio =
          predator.phenotype.baseSize / potentialPrey.phenotype.baseSize
        const baseKnockback = predator.phenotype.maxSpeed * 2.2
        const damageMultiplier =
          1 + (damage / potentialPrey.phenotype.maxHealth) * 3
        const knockbackStrength = baseKnockback * damageMultiplier * sizeRatio

        potentialPrey.knockbackVelocity = {
          x: nx * knockbackStrength,
          y: ny * knockbackStrength,
        }
        potentialPrey.knockbackFramesRemaining = 3
      }

      predator.attackCooldownFrames = config.parameters.attackCooldownFrames

      if (isDead(potentialPrey)) {
        lifecycleCollector.collect({
          type: lifecycleKeywords.events.death,
          boidId: potentialPrey.id,
          typeId: potentialPrey.typeId,
          reason: 'predation',
        })
      }

      break
    }
  }
}

/**
 * Legacy catch checking for browser engine
 * TODO: Migrate browser engine to use processPredatorAttack
 */
export const checkCatchesCore = (
  boids: BoidsById,
  config: ConfigContext
): CatchEvent[] => {
  const { parameters } = config
  const predators = Object.values(boids).filter(
    (b) => config.species[b.typeId]?.role === 'predator'
  )
  const prey = Object.values(boids).filter(
    (b) => config.species[b.typeId]?.role === 'prey'
  )

  const catches: CatchEvent[] = []
  const caughtPreyIds: string[] = []

  for (const predator of predators) {
    if (predator.attackCooldownFrames > 0) continue

    for (const preyBoid of prey) {
      if (caughtPreyIds.includes(preyBoid.id)) continue

      const dist = vec.toroidalDistance(
        predator.position,
        preyBoid.position,
        config.world.width,
        config.world.height
      )

      if (dist < parameters.catchRadius) {
        const damage = predator.phenotype.attackDamage
        preyBoid.health -= damage

        const knockbackDirection = vec.toroidalSubtract(
          preyBoid.position,
          predator.position,
          config.world.width,
          config.world.height
        )
        const pushDist = vec.magnitude(knockbackDirection)
        if (pushDist > 0) {
          const nx = knockbackDirection.x / pushDist
          const ny = knockbackDirection.y / pushDist
          const sizeRatio =
            predator.phenotype.baseSize / preyBoid.phenotype.baseSize
          const baseKnockback = predator.phenotype.maxSpeed * 1.5
          const damageMultiplier =
            1 + (damage / preyBoid.phenotype.maxHealth) * 3
          const knockbackStrength = baseKnockback * damageMultiplier * sizeRatio

          preyBoid.knockbackVelocity = {
            x: nx * knockbackStrength,
            y: ny * knockbackStrength,
          }
          preyBoid.knockbackFramesRemaining = 3
        }

        predator.attackCooldownFrames = parameters.attackCooldownFrames

        if (isDead(preyBoid)) {
          const preyEnergy = preyBoid.phenotype.maxEnergy
          const preyPosition = {
            x: preyBoid.position.x,
            y: preyBoid.position.y,
          }
          const preyTypeId = preyBoid.typeId

          caughtPreyIds.push(preyBoid.id)

          catches.push({
            type: eventKeywords.boids.caught,
            predatorId: predator.id,
            preyId: preyBoid.id,
            preyTypeId,
            preyEnergy,
            preyPosition,
          })
        }

        break
      }
    }
  }

  return catches
}

// ============================================================================
// COOLDOWN MANAGEMENT
// ============================================================================

/**
 * Update all boid cooldowns
 *
 * Decrements frame-based cooldowns and updates mating readiness.
 */
export const updateBoidCooldowns = (
  boid: Boid,
  config: ConfigContext
): void => {
  if (boid.attackCooldownFrames > 0) {
    boid.attackCooldownFrames--
  }
  if (boid.eatingCooldownFrames > 0) {
    boid.eatingCooldownFrames--
  }
  if (boid.reproductionCooldown > 0) {
    boid.reproductionCooldown--

    if (boid.reproductionCooldown === 0) {
      const speciesConfig = config.species[boid.typeId]
      if (speciesConfig) {
        boid.seekingMate = isReadyToMate(
          boid,
          config.parameters,
          speciesConfig
        )
      }
    }
  }
  if (boid.knockbackFramesRemaining > 0) {
    boid.knockbackFramesRemaining--
  }
}

// ============================================================================
// LIFECYCLE EVENT APPLICATION
// ============================================================================

/**
 * Apply lifecycle events (deaths, reproductions, food consumption)
 *
 * Pure function that computes what changes need to be made.
 * Adapters apply these changes to their respective stores.
 */
export const applyLifecycleEventsCore = (
  events: LifecycleEvent[],
  context: {
    boids: BoidsById
    config: ConfigContext
    currentFrame: number
    rng: DomainRNG
    getNextBoidIndex: () => number
  }
): LifecycleApplicationResult => {
  const result: LifecycleApplicationResult = {
    boidsToRemove: [],
    boidsToAdd: [],
    foodConsumption: new Map(),
    deathMarkers: [],
    catchEvents: [],
    reproductionEvents: [],
  }

  const speciesTypes = context.config.species

  for (const event of events) {
    if (event.type === lifecycleKeywords.events.death) {
      result.boidsToRemove.push(event.boidId)
    }
  }

  for (const event of events) {
    if (event.type === lifecycleKeywords.events.foodConsumed) {
      const current = result.foodConsumption.get(event.foodId) || 0
      result.foodConsumption.set(event.foodId, current + event.energyConsumed)
    }
  }

  const counts = countBoidsByRole(context.boids, speciesTypes)
  let currentPreyCount = counts.prey
  let currentPredatorCount = counts.predator

  for (const event of events) {
    if (event.type === lifecycleKeywords.events.reproduction) {
      const offspring = event.offspring
      const speciesConfig = speciesTypes[offspring.typeId]
      const offspringCount = speciesConfig.reproduction.offspringCount || 1
      const energyBonus = speciesConfig.reproduction.offspringEnergyBonus || 0

      const parent1 = context.boids[offspring.parent1Id]
      const parent2 = offspring.parent2Id
        ? context.boids[offspring.parent2Id]
        : undefined

      for (let i = 0; i < offspringCount; i++) {
        const currentTypeCount = Object.values(context.boids).filter(
          (b: Boid) => b.typeId === offspring.typeId
        ).length

        const canSpawn = canSpawnOffspring(
          offspring.typeId,
          speciesTypes,
          {
            maxBoids: context.config.parameters.maxBoids,
            maxPreyBoids: context.config.parameters.maxPreyBoids,
            maxPredatorBoids: context.config.parameters.maxPredatorBoids,
          },
          {
            totalBoids: Object.keys(context.boids).length,
            totalPrey: currentPreyCount,
            totalPredators: currentPredatorCount,
          },
          currentTypeCount
        )

        if (canSpawn) {
          const { width, height } = context.config.world
          const physics = context.config.physics || defaultWorldPhysics
          const creationContext = {
            world: { width, height },
            species: speciesTypes,
            rng: context.rng,
            physics,
          }

          const parentGenomes =
            parent1 && parent1.genome
              ? {
                  parent1: parent1.genome,
                  parent2: parent2?.genome,
                }
              : undefined

          const createResult = createBoidOfType(
            offspring.position,
            offspring.typeId,
            creationContext,
            energyBonus,
            context.getNextBoidIndex(),
            parentGenomes
          )
          const newBoid = createResult.boid
          result.boidsToAdd.push(newBoid)

          if (speciesConfig.role === 'prey') {
            currentPreyCount++
          } else if (speciesConfig.role === 'predator') {
            currentPredatorCount++
          }

          if (i === 0) {
            result.reproductionEvents.push({
              parentId: offspring.parent1Id,
              childId: newBoid.id,
              typeId: offspring.typeId,
              offspringCount,
              ...(offspring.parent2Id && { parent2Id: offspring.parent2Id }),
            })
          }
        }
      }
    }
  }

  return result
}

// ============================================================================
// FOOD MANAGEMENT
// ============================================================================

/**
 * Check if prey food should spawn this frame
 */
export const shouldSpawnPreyFood = (
  foodSources: FoodSource[],
  currentFrame: number,
  spawnIntervalFrames: number
): boolean => {
  const preyFoodCount = foodSources.filter(
    (f) => f.sourceType === 'prey'
  ).length
  return currentFrame % spawnIntervalFrames === 0 && preyFoodCount < 15
}

/**
 * Generate prey food sources
 */
export const generatePreyFoodBatch = (
  currentFood: FoodSource[],
  world: WorldConfig,
  currentFrame: number,
  rng: DomainRNG,
  timestamp: number
): FoodSource[] => {
  const preyFoodCount = currentFood.filter(
    (f) => f.sourceType === 'prey'
  ).length

  if (preyFoodCount >= 15) return []

  const toSpawn = Math.min(5, 15 - preyFoodCount)
  const newFoodSources: FoodSource[] = []

  for (let i = 0; i < toSpawn; i++) {
    newFoodSources.push({
      id: `food-prey-${timestamp}-${Math.floor(rng.next() * 1000000)}-${i}`,
      position: {
        x: rng.range(0, world.width),
        y: rng.range(0, world.height),
      },
      energy: FOOD_CONSTANTS.PREY_FOOD_INITIAL_ENERGY,
      maxEnergy: FOOD_CONSTANTS.PREY_FOOD_INITIAL_ENERGY,
      sourceType: 'prey',
      createdFrame: currentFrame,
    })
  }

  return newFoodSources
}

/**
 * Create predator food from catch event
 */
export const createPredatorFoodFromCatch = (
  catchEvent: CatchEvent,
  currentFood: FoodSource[],
  currentFrame: number,
  rng: DomainRNG,
  timestamp: number
): FoodSource | null => {
  const predatorFoodCount = currentFood.filter(
    (f) => f.sourceType === 'predator'
  ).length

  if (predatorFoodCount >= 25) return null

  const foodEnergy = catchEvent.preyEnergy * 0.8

  return {
    id: `food-predator-${timestamp}-${Math.floor(rng.next() * 1000000)}`,
    position: catchEvent.preyPosition,
    energy: foodEnergy,
    maxEnergy: foodEnergy,
    sourceType: 'predator',
    createdFrame: currentFrame,
  }
}

/**
 * Apply food consumption to food sources
 */
export const applyFoodConsumption = (
  foodSources: FoodSource[],
  consumptionMap: Map<string, number>
): {
  updatedFood: FoodSource[]
  exhaustedFoodIds: string[]
} => {
  const exhaustedFoodIds: string[] = []
  const updatedFood = foodSources
    .map((food) => {
      const consumed = consumptionMap.get(food.id)
      if (consumed) {
        const newEnergy = Math.max(0, food.energy - consumed)
        if (newEnergy <= 0) {
          exhaustedFoodIds.push(food.id)
        }
        return { ...food, energy: newEnergy }
      }
      return food
    })
    .filter((food) => food.energy > 0)

  return { updatedFood, exhaustedFoodIds }
}

// ============================================================================
// DEATH MARKER MANAGEMENT
// ============================================================================

const CONSOLIDATION_RADIUS = 100
const MAX_LIFETIME_FRAMES = 600

/**
 * Consolidate death marker or create new one
 *
 * Merges nearby deaths to prevent marker spam.
 */
export const consolidateDeathMarker = (
  death: { position: Vector2; typeId: string; id: string; reason: string },
  existingMarkers: DeathMarker[],
  currentFrame: number
): { consolidated: boolean; newMarker?: DeathMarker } => {
  if (death.reason === 'predation') {
    return { consolidated: true }
  }

  for (const marker of existingMarkers) {
    const dx = death.position.x - marker.position.x
    const dy = death.position.y - marker.position.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < CONSOLIDATION_RADIUS && marker.typeId === death.typeId) {
      marker.strength = Math.min(5.0, marker.strength + 0.5)
      marker.remainingFrames = MAX_LIFETIME_FRAMES
      return { consolidated: true }
    }
  }

  const newMarker: DeathMarker = {
    id: `death-${currentFrame}-${death.id}`,
    position: {
      x: death.position.x,
      y: death.position.y,
    },
    remainingFrames: MAX_LIFETIME_FRAMES,
    strength: 1.0,
    maxLifetimeFrames: MAX_LIFETIME_FRAMES,
    typeId: death.typeId,
  }

  return { consolidated: false, newMarker }
}

/**
 * Decay death markers by one frame
 */
export const decayDeathMarkers = (
  markers: DeathMarker[]
): {
  updatedMarkers: DeathMarker[]
  expiredIds: string[]
} => {
  const updatedMarkers: DeathMarker[] = []
  const expiredIds: string[] = []

  for (const marker of markers) {
    const remainingFrames = marker.remainingFrames - 1

    if (remainingFrames <= 0) {
      expiredIds.push(marker.id)
    } else {
      updatedMarkers.push({
        ...marker,
        remainingFrames,
      })
    }
  }

  return { updatedMarkers, expiredIds }
}

