import { getMaxCrowdTolerance } from '@/boids/affinity'
import { ForceCollector, LifecycleCollector } from '@/boids/collectors'
import {
  BoidUpdateContext,
  ConfigContext,
  EngineUpdateContext,
  SimulationContext,
} from '@/boids/context'
import { getBoidsByRole } from '@/boids/filters'
import { FOOD_CONSTANTS } from '@/boids/food'
import { updateBoidAge } from '@/boids/lifecycle/aging'

import { updateBoidEnergy } from '@/boids/lifecycle/energy'
import {
  getDeathCause,
  isDead,
  regenerateHealth,
} from '@/boids/lifecycle/health'
import { processBoidReproduction } from '@/boids/lifecycle/reproduction'
import { getNearbyBoidsByRole } from '@/boids/mappings'
import { applyMatingResult } from '@/boids/mating'
import { isReadyToMate } from '@/boids/predicates'
import { SpatialHash } from '@/boids/spatialHash'
import {
  lifecycleKeywords,
  profilerKeywords,
} from '@/boids/vocabulary/keywords'
import {
  Boid,
  DeathMarker,
  FoodSource,
  Obstacle,
} from '@/boids/vocabulary/schemas/entities'
import { Vector2 } from '@/boids/vocabulary/schemas/primitives'
import { Profiler } from '@/resources/shared/profiler'
import { LocalBoidStore } from '../localBoidStore'

export type FrameUpdateOpsLayout = {
  boidsToUpdate: number
  foodSourcesToUpdate: number
  boidSpatialHashToUpdate: number
  obstaclesToUpdate: number
  deathMarkersToUpdate: number
  totalOps: number
  opsRanges: {
    deathMarkers: [number, number]
    obstacles: [number, number]
    foodSources: [number, number]
    boids: [number, number]
    boidSpatialHash: [number, number]
  }
}

/*
  
   * Computes the operations layout for the frame update
   * This is used to determine the order and range of operations to update
   * in the frame update context.
   * This ensures we can update the full engine in a single loop pass.
   *
   * @param runtimeStore - The runtime store
   * @param boidsStore - The boids store
   * @returns The operations layout
   */
export const computeOpsLayout = ({
  deathMarkersCount,
  obstaclesCount,
  foodSourcesCount,
  boidsCount,
}: {
  deathMarkersCount: number
  obstaclesCount: number
  foodSourcesCount: number
  boidsCount: number
}): FrameUpdateOpsLayout => {
  const layout = {
    opsRanges: {
      boids: [0, 0],
      foodSources: [0, 0],
      obstacles: [0, 0],
      deathMarkers: [0, 0],
    },
  } as FrameUpdateOpsLayout

  let totalOps = 0

  layout.deathMarkersToUpdate = deathMarkersCount
  layout.opsRanges.deathMarkers = [
    totalOps,
    totalOps + layout.deathMarkersToUpdate - 1,
  ]
  totalOps += layout.deathMarkersToUpdate

  layout.obstaclesToUpdate = obstaclesCount
  layout.opsRanges.obstacles = [
    totalOps,
    totalOps + layout.obstaclesToUpdate - 1,
  ]
  totalOps += layout.obstaclesToUpdate

  layout.foodSourcesToUpdate = foodSourcesCount
  layout.opsRanges.foodSources = [
    totalOps,
    totalOps + layout.foodSourcesToUpdate - 1,
  ]
  totalOps += layout.foodSourcesToUpdate

  layout.boidSpatialHashToUpdate = boidsCount
  layout.opsRanges.boidSpatialHash = [
    totalOps,
    totalOps + layout.boidSpatialHashToUpdate - 1,
  ]
  totalOps += layout.boidSpatialHashToUpdate

  layout.boidsToUpdate = boidsCount
  layout.opsRanges.boids = [totalOps, totalOps + layout.boidsToUpdate - 1]
  totalOps += layout.boidsToUpdate

  layout.totalOps = totalOps

  return layout
}

const rangeToOperationMap = {
  boidSpatialHash: 'updateBoidSpatialHash',
  deathMarkers: 'updateDeathMarkers',
  obstacles: 'updateObstacles',
  foodSources: 'updateFoodSources',
  boids: 'updateBoids',
} as const

export const getActiveOperation = (
  opsRanges: FrameUpdateOpsLayout['opsRanges'],
  index: number
): [string, [number, number]] | null => {
  for (const key in opsRanges) {
    const range = opsRanges[key as keyof FrameUpdateOpsLayout['opsRanges']]
    if (range[0] <= 0 && range[1] <= 0) continue

    if (index >= range[0] && index <= range[1]) {
      const operation =
        rangeToOperationMap[key as keyof typeof rangeToOperationMap]
      if (operation) {
        return [operation, range]
      } else {
        console.error('operation not found', key, index, range)
        return null
      }
    }
  }
  return null
}

type EnvironmentHandlers = {
  updateTrail: (boid: Boid, position: Vector2) => void
  evaluateBoidBehavior: (boid: Boid, context: BoidUpdateContext) => void
  updateBoid: (boid: Boid, context: BoidUpdateContext) => void
  checkBoidLifecycle: (
    boid: Boid,
    context: BoidUpdateContext,
    staggerRate: number,
    collectEvent: LifecycleCollector['collect'],
    matedBoidsThisFrame: Set<string>
  ) => void
}

type OperationFn = (index: number, context: EngineUpdateContext) => void
type OperationsMap<Fn = OperationFn> = {
  updateDeathMarkers: Fn
  updateObstacles: Fn
  updateFoodSources: Fn
  updateBoidSpatialHash: Fn
  updateBoids: Fn
}
type OperationFnWithHandlers = (
  index: number,
  context: EngineUpdateContext,
  handlers: EnvironmentHandlers
) => void
type OperationsMapWithHandlers<Fn = OperationFnWithHandlers> = OperationsMap<Fn>

/**
 * Check lifecycle for a single boid (staggered)
 *
 * This function is called once per lifecycle stagger period (e.g., every 60 frames).
 * It performs lightweight calculations and collects events for batch processing.
 *
 * Key insight: We multiply deltaSeconds by stagger rate to get accurate time deltas.
 * Example: At 60 FPS with stagger=60, each boid is checked once per second,
 * so we apply 1 second worth of changes (deltaSeconds * 60).
 */
export const checkBoidLifecycle = (
  boid: Boid,
  context: BoidUpdateContext,
  staggerRate: number,
  collectEvent: LifecycleCollector['collect'],
  matedBoidsThisFrame: Set<string>
) => {
  const speciesConfig = context.config.species[boid.typeId]
  if (!speciesConfig) return
  const parameters = context.config.parameters

  const effectiveDelta = (context.scaledTime * staggerRate) / 60

  boid.age = updateBoidAge(boid, effectiveDelta)

  if (isDead(boid)) {
    const maxAge = boid.phenotype.maxAge
    const deathReason = getDeathCause(boid, maxAge)
    collectEvent({
      type: 'lifecycle:death',
      boidId: boid.id,
      typeId: boid.typeId,
      reason: deathReason,
    })
    return // Skip remaining updates for dead boid
  }

  boid.energy = updateBoidEnergy(boid, speciesConfig, effectiveDelta)

  if (boid.stance === 'eating' && boid.eatingCooldownFrames === 0) {
    for (const nearbyFood of context.nearbyFoodSources) {
      const food = nearbyFood.item

      if (food.energy <= 0) continue

      if (food.sourceType === 'prey' && speciesConfig.role !== 'prey') continue
      if (food.sourceType === 'predator' && speciesConfig.role !== 'predator')
        continue

      if (nearbyFood.distance >= FOOD_CONSTANTS.FOOD_CONSUMPTION_RADIUS) {
        continue
      }

      const consumptionRate =
        food.sourceType === 'prey'
          ? FOOD_CONSTANTS.PREY_FOOD_CONSUMPTION_RATE
          : FOOD_CONSTANTS.PREDATOR_FOOD_CONSUMPTION_RATE

      const energyGain = Math.min(consumptionRate, food.energy)

      boid.energy = Math.min(boid.energy + energyGain, boid.phenotype.maxEnergy)

      collectEvent({
        type: lifecycleKeywords.events.foodConsumed,
        foodId: food.id,
        energyConsumed: energyGain,
      })

      boid.eatingCooldownFrames = parameters.eatingCooldownFrames // ~20 frames between bites

      break
    }
  }

  boid.health = regenerateHealth(boid).health

  boid.seekingMate = isReadyToMate(boid, parameters, speciesConfig)

  if (boid.seekingMate) {
    const matingResult = processBoidReproduction(
      boid,
      context.boidsById,
      parameters,
      speciesConfig,
      matedBoidsThisFrame,
      staggerRate
    )

    const matingContext = {
      boids: context.boidsById,
      matedBoids: matedBoidsThisFrame,
      boidsToAdd: [], // We'll collect events instead
    }
    applyMatingResult(boid, matingResult, matingContext)

    if (matingResult.type === 'reproduction_complete') {
      collectEvent({
        type: 'lifecycle:reproduction',
        offspring: matingResult.offspring,
      })
      boid.mateCommitmentFrames = 0
    } else if (matingResult.type === 'mate_lost') {
      boid.mateCommitmentFrames = 0
    } else if (matingResult.type === 'pair_found') {
      boid.mateCommitmentFrames = 0
    } else if (boid.mateId !== null) {
      boid.mateCommitmentFrames++
    }
  }

  if (boid.energy < boid.phenotype.maxEnergy * 0.2) {
    collectEvent({
      type: lifecycleKeywords.events.energyLow,
      boidId: boid.id,
      energy: boid.energy,
    })
  }

  if (boid.health < boid.phenotype.maxHealth * 0.3) {
    collectEvent({
      type: lifecycleKeywords.events.healthLow,
      boidId: boid.id,
      health: boid.health,
    })
  }
}

export const updateEngine = (
  opsLayout: FrameUpdateOpsLayout,
  operationContext: EngineUpdateContext,
  operations: OperationsMapWithHandlers,
  handlers: EnvironmentHandlers
) => {
  for (let i = 0; i < opsLayout.totalOps; i++) {
    const op = getActiveOperation(opsLayout.opsRanges, i)
    if (op) {
      const key = op[0]
      const range = op[1]
      const index = i - range[0]

      if (index >= 0 && index <= range[1] - range[0]) {
        const operationHandler =
          operations[key as keyof OperationsMapWithHandlers]
        if (operationHandler) {
          operationHandler(index, operationContext, handlers)
        } else {
          console.error('operationHandler not found', key, index, range)
        }
      }
    }
  }
}

export const updateDeathMarkers = (
  index: number,
  context: EngineUpdateContext
) => {
  context.deathMarkerSpatialHash.insertItem(
    context.simulation.deathMarkers[index]
  )
}

export const updateObstacles = (
  index: number,
  context: EngineUpdateContext
) => {
  context.obstacleSpatialHash.insertItem(context.simulation.obstacles[index])
}

export const updateFoodSources = (
  index: number,
  context: EngineUpdateContext
) => {
  context.foodSourceSpatialHash.insertItem(
    context.simulation.foodSources[index]
  )
}

export const updateBoidSpatialHash = (
  index: number,
  context: EngineUpdateContext
) => {
  const boidId = context.boidIds[index]
  const boid = boidId ? context.boidsById[boidId] : undefined
  if (boid) {
    context.boidSpatialHash.insertItem(boid)
  }
}

export const updateBoids = (
  index: number,
  context: EngineUpdateContext,
  handlers: EnvironmentHandlers
) => {
  const boidKey = context.boidIds[index]
  const boid = context.boidsById[boidKey]
  if (boid) {
    const maxNeighborsLookup = context.constraints.maxNeighborsLookup
    const nearbyBoids = context.boidSpatialHash.getNearbyItems(
      boid.position,
      context.config.world,
      maxNeighborsLookup,
      context.config.parameters.perceptionRadius
    )
    const nearbyFoodSources = context.foodSourceSpatialHash.getNearbyItems(
      boid.position,
      context.config.world,
      maxNeighborsLookup,
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS
    )
    const nearbyObstacles = context.obstacleSpatialHash.getNearbyItems(
      boid.position,
      context.config.world,
      maxNeighborsLookup
    )
    const nearbyDeathMarkers = context.deathMarkerSpatialHash.getNearbyItems(
      boid.position,
      context.config.world,
      maxNeighborsLookup,
      context.config.parameters.perceptionRadius
    )
    const { nearbyPrey, nearbyPredators } = getNearbyBoidsByRole(
      boid,
      nearbyBoids,
      context.config.species
    )
    const localContext = {
      ...context,
      nearbyBoids,
      nearbyFoodSources,
      nearbyObstacles,
      nearbyDeathMarkers,
      nearbyPrey,
      nearbyPredators,
    } satisfies BoidUpdateContext
    handlers.updateBoid(boid, localContext)

    const shouldUpdateTrail =
      boid.index % context.staggerFrames.tail ===
      context.currentFrame % context.staggerFrames.tail
    if (shouldUpdateTrail) {
      handlers.updateTrail(boid, {
        x: boid.position.x,
        y: boid.position.y,
      })
    }

    const shouldUpdateBehavior =
      boid.index % context.staggerFrames.behavior ===
      context.currentFrame % context.staggerFrames.behavior
    if (shouldUpdateBehavior) {
      handlers.evaluateBoidBehavior(boid, localContext)
    }

    const shouldUpdateLifecycle =
      boid.index % context.staggerFrames.lifecycle ===
      context.currentFrame % context.staggerFrames.lifecycle

    if (shouldUpdateLifecycle) {
      handlers.checkBoidLifecycle(
        boid,
        localContext,
        context.staggerFrames.lifecycle,
        context.lifecycleCollector?.collect ?? (() => {}),
        context.matedBoidsThisFrame ?? new Set()
      )
    }
  }
}

/**
 * Compatibility layer for the old frame update context
 * Will be removed in the future
 */
export const createBaseFrameUpdateContext = ({
  frame,
  config,
  profiler,
  simulation,
  boidsCount,
  boidsStore,
  deltaSeconds,
  forcesCollector,
  lifecycleCollector,
  boidSpatialHash,
  obstacleSpatialHash,
  foodSourceSpatialHash,
  deathMarkerSpatialHash,
}: {
  frame: number
  config: ConfigContext
  profiler: Profiler | undefined
  simulation: SimulationContext
  boidsCount: number
  boidsStore: LocalBoidStore
  deltaSeconds: number
  forcesCollector: ForceCollector
  lifecycleCollector: LifecycleCollector
  boidSpatialHash: SpatialHash<Boid>
  obstacleSpatialHash: SpatialHash<Obstacle>
  foodSourceSpatialHash: SpatialHash<FoodSource>
  deathMarkerSpatialHash: SpatialHash<DeathMarker>
}): EngineUpdateContext => {
  profiler?.start(profilerKeywords.engine.createFrameUpdateContext)
  const maxBoidCrowdTolerance = getMaxCrowdTolerance(config.species)
  const maxNeighborsLookup = Math.ceil(maxBoidCrowdTolerance * 1.3)
  const boids = boidsStore.boids

  profiler?.start(profilerKeywords.engine.buildFrameUpdateContext)
  const baseUpdateContext = {
    simulation: {
      obstacles: simulation.obstacles,
      deathMarkers: simulation.deathMarkers,
      foodSources: simulation.foodSources,
    },
    config: {
      parameters: config.parameters,
      world: config.world,
      species: config.species,
    },
    deltaSeconds,
    profiler,
    boidsById: boids,
    boidIds: Object.keys(boids),
    scaledTime: deltaSeconds * 30,
    boidsByRole: getBoidsByRole(boids, config.species),
    currentFrame: frame,
    boidsCount,
    forcesCollector,
    lifecycleCollector,
    boidSpatialHash,
    foodSourceSpatialHash,
    obstacleSpatialHash,
    deathMarkerSpatialHash,
    staggerFrames: {
      tail: 3,
      behavior: 20,
      lifecycle: 25,
    },
    constraints: {
      maxNeighborsLookup,
    },
  } satisfies EngineUpdateContext
  profiler?.end(profilerKeywords.engine.buildFrameUpdateContext)

  return baseUpdateContext
}
