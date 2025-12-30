import type {
  SimulationParameters,
  SpeciesConfig,
  WorldConfig,
  FoodSource,
  DeathMarker,
} from "./vocabulary/schemas/prelude.ts";
import type { Obstacle } from "./vocabulary/schemas/prelude.ts";
import type { Profiler } from "../resources/profiler";

/**
 * Simulation state context - dynamic world state that changes every frame
 */
export type SimulationContext = {
  obstacles: Obstacle[];
  deathMarkers: DeathMarker[];
  foodSources: FoodSource[];
  tick: number; // Current simulation tick (NEW - Session 73: for behavior system)
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
};
