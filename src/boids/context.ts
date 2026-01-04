import { ExpandType } from "@/utils/types.ts";
import type { Profiler } from "../resources/shared/profiler.ts";
import { ForceCollector } from "./collectors.ts";
import { ItemWithDistance, SpatialHash } from "./spatialHash.ts";
import type {
  Boid,
  BoidsById,
  DeathMarker,
  FoodSource,
  Obstacle,
} from "./vocabulary/schemas/entities";
import { Role } from "./vocabulary/schemas/primitives.ts";
import type { SpeciesRecord } from "./vocabulary/schemas/species";
import type {
  SimulationParameters,
  WorldConfig,
} from "./vocabulary/schemas/world";

/**
 * Simulation state context - dynamic world state that changes every frame
 */
export type SimulationContext = {
  obstacles: Obstacle[];
  deathMarkers: DeathMarker[];
  foodSources: FoodSource[];
  // tick: number; // Lifecycle tick (1 Hz) - for aging, reproduction
  // frame: number; // Physics frame (30-60 Hz) - for behavior evaluation (Session 76)
};

/**
 * Configuration context - relatively static configuration from profiles
 */
export type ConfigContext = {
  parameters: SimulationParameters;
  world: WorldConfig;
  species: SpeciesRecord;
};

export type FrameUpdateContext = {
  simulation: SimulationContext;
  config: ConfigContext;
  deltaSeconds: number;
  currentFrame: number;
  profiler?: Profiler;
  maxNeighborsLookup: number;
  boids: BoidsById;
  scaledTime: number;
  boidsByRole: Record<Role, Boid[]>;
  boidsCount: number;
  forcesCollector: ForceCollector;
};

/**
 * Complete boid update context - everything needed to update boid behavior
 * Combines simulation state, configuration, and time delta
 */
// export type BoidUpdateContext = FrameUpdateContext & {
//   nearbyBoids: ItemWithDistance<Boid>[];
//   nearbyPrey: ItemWithDistance<Boid>[];
//   nearbyPredators: ItemWithDistance<Boid>[];
//   nearbyFoodSources: ItemWithDistance<FoodSource>[];
//   nearbyObstacles: ItemWithDistance<Obstacle>[];
//   nearbyDeathMarkers: ItemWithDistance<DeathMarker>[];
// };

export type EngineUpdateContext = {
  // Time tracking
  currentFrame: number;
  deltaSeconds: number;
  scaledTime: number;

  // Simulation state
  simulation: SimulationContext;
  config: ConfigContext;

  // Boids data
  boidsById: BoidsById;
  boidIds: string[];
  boidsCount: number;
  boidsByRole: Record<Role, Boid[]>;

  // Spacial hashes
  boidSpatialHash: SpatialHash<Boid>;
  foodSourceSpatialHash: SpatialHash<FoodSource>;
  obstacleSpatialHash: SpatialHash<Obstacle>;
  deathMarkerSpatialHash: SpatialHash<DeathMarker>;

  // Utilities
  forcesCollector: ForceCollector;
  profiler?: Profiler;

  // Staggering config
  staggerFrames: {
    tail: number;
    behavior: number;
  };

  // Constraints (engine limits)
  constraints: {
    maxNeighborsLookup: number;
  };
};

export type BoidUpdateContext = ExpandType<
  Pick<
    EngineUpdateContext,
    | "currentFrame"
    | "simulation"
    | "config"
    | "boidsById"
    | "boidIds"
    | "boidsCount"
    | "boidsByRole"
    | "forcesCollector"
    | "profiler"
  > & {
    nearbyBoids: ItemWithDistance<Boid>[];
    nearbyPrey: ItemWithDistance<Boid>[];
    nearbyPredators: ItemWithDistance<Boid>[];
    nearbyFoodSources: ItemWithDistance<FoodSource>[];
    nearbyObstacles: ItemWithDistance<Obstacle>[];
    nearbyDeathMarkers: ItemWithDistance<DeathMarker>[];
  }
>;

export type LifecycleUpdateContext = ExpandType<
  Pick<
    EngineUpdateContext,
    | "simulation"
    | "config"
    | "boidsById"
    | "boidIds"
    | "boidsCount"
    | "boidsByRole"
    | "forcesCollector"
    | "profiler"
  > & {
    tick: number;
  }
>;
