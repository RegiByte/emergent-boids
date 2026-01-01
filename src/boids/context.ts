import type {
  SimulationParameters,
  WorldConfig,
} from "./vocabulary/schemas/world";
import type { SpeciesConfig } from "./vocabulary/schemas/species";
import type { FoodSource, DeathMarker } from "./vocabulary/schemas/entities";
import type { Obstacle } from "./vocabulary/schemas/entities";
import type { Profiler } from "../resources/profiler";

/**
 * Simulation state context - dynamic world state that changes every frame
 */
export type SimulationContext = {
  obstacles: Obstacle[];
  deathMarkers: DeathMarker[];
  foodSources: FoodSource[];
  tick: number; // Lifecycle tick (1 Hz) - for aging, reproduction
  frame: number; // Physics frame (30-60 Hz) - for behavior evaluation (Session 76)
};

/**
 * Configuration context - relatively static configuration from profiles
 */
export type ConfigContext = {
  parameters: SimulationParameters;
  world: WorldConfig;
  species: Record<string, SpeciesConfig>;
};

/**
 * Complete boid update context - everything needed to update boid behavior
 * Combines simulation state, configuration, and time delta
 */
export type BoidUpdateContext = {
  simulation: SimulationContext;
  config: ConfigContext;
  deltaSeconds: number;
  profiler?: Profiler;
  frame: number;
};
