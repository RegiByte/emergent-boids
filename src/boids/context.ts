import { ExpandType } from '@/utils/types.ts'
import type { Profiler } from '../resources/shared/profiler.ts'
import { ForceCollector, LifecycleCollector } from './collectors.ts'
import { ItemWithDistance, SpatialHash } from './spatialHash.ts'
import type {
  Boid,
  BoidsById,
  DeathMarker,
  FoodSource,
  Obstacle,
} from './vocabulary/schemas/entities'
import { Role } from './vocabulary/schemas/primitives.ts'
import type { SpeciesRecord } from './vocabulary/schemas/species'
import type {
  SimulationParameters,
  WorldConfig,
  WorldPhysics,
} from './vocabulary/schemas/world'

/**
 * Simulation state context - dynamic world state that changes every frame
 */
export type SimulationContext = {
  obstacles: Obstacle[]
  deathMarkers: DeathMarker[]
  foodSources: FoodSource[]
}

/**
 * Configuration context - relatively static configuration from profiles
 */
export type ConfigContext = {
  parameters: SimulationParameters
  world: WorldConfig
  species: SpeciesRecord
  physics?: WorldPhysics
}

export type FrameUpdateContext = {
  simulation: SimulationContext
  config: ConfigContext
  deltaSeconds: number
  currentFrame: number
  profiler?: Profiler
  maxNeighborsLookup: number
  boids: BoidsById
  scaledTime: number
  boidsByRole: Record<Role, Boid[]>
  boidsCount: number
  forcesCollector: ForceCollector
}

/**
 * Complete boid update context - everything needed to update boid behavior
 * Combines simulation state, configuration, and time delta
 */

export type EngineUpdateContext = {
  currentFrame: number
  deltaSeconds: number
  scaledTime: number

  simulation: SimulationContext
  config: ConfigContext

  boidsById: BoidsById
  boidIds: string[]
  boidsCount: number
  boidsByRole: Record<Role, Boid[]>

  boidSpatialHash: SpatialHash<Boid>
  foodSourceSpatialHash: SpatialHash<FoodSource>
  obstacleSpatialHash: SpatialHash<Obstacle>
  deathMarkerSpatialHash: SpatialHash<DeathMarker>

  forcesCollector: ForceCollector
  lifecycleCollector: LifecycleCollector
  profiler?: Profiler

  staggerFrames: {
    tail: number
    behavior: number
    lifecycle: number
  }

  constraints: {
    maxNeighborsLookup: number
  }

  matedBoidsThisFrame?: Set<string>
}

export type BoidUpdateContext = ExpandType<
  Pick<
    EngineUpdateContext,
    | 'currentFrame'
    | 'simulation'
    | 'config'
    | 'boidsById'
    | 'boidIds'
    | 'boidsCount'
    | 'boidsByRole'
    | 'forcesCollector'
    | 'profiler'
    | 'scaledTime'
  > & {
    nearbyBoids: ItemWithDistance<Boid>[]
    nearbyPrey: ItemWithDistance<Boid>[]
    nearbyPredators: ItemWithDistance<Boid>[]
    nearbyFoodSources: ItemWithDistance<FoodSource>[]
    nearbyObstacles: ItemWithDistance<Obstacle>[]
    nearbyDeathMarkers: ItemWithDistance<DeathMarker>[]
  }
>

export type LifecycleUpdateContext = ExpandType<
  Pick<
    EngineUpdateContext,
    | 'simulation'
    | 'config'
    | 'boidsById'
    | 'boidIds'
    | 'boidsCount'
    | 'boidsByRole'
    | 'forcesCollector'
    | 'profiler'
    | 'deltaSeconds'
  > & {
    tick: number
  }
>
