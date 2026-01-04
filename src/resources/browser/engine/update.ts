import { getMaxCrowdTolerance } from "@/boids/affinity";
import { ForceCollector } from "@/boids/collectors";
import {
  BoidUpdateContext,
  ConfigContext,
  EngineUpdateContext,
  SimulationContext,
} from "@/boids/context";
import { getBoidsByRole } from "@/boids/filters";
import { FOOD_CONSTANTS } from "@/boids/food";
import { getNearbyBoidsByRole } from "@/boids/mappings";
import { SpatialHash } from "@/boids/spatialHash";
import { profilerKeywords } from "@/boids/vocabulary/keywords";
import {
  Boid,
  DeathMarker,
  FoodSource,
  Obstacle,
} from "@/boids/vocabulary/schemas/entities";
import { Vector2 } from "@/boids/vocabulary/schemas/primitives";
import { Profiler } from "@/resources/shared/profiler";
import { LocalBoidStore } from "../localBoidStore";

export type FrameUpdateOpsLayout = {
  boidsToUpdate: number;
  foodSourcesToUpdate: number;
  boidSpatialHashToUpdate: number;
  obstaclesToUpdate: number;
  deathMarkersToUpdate: number;
  totalOps: number;
  opsRanges: {
    deathMarkers: [number, number];
    obstacles: [number, number];
    foodSources: [number, number];
    boids: [number, number];
    boidSpatialHash: [number, number];
  };
};

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
  deathMarkersCount: number;
  obstaclesCount: number;
  foodSourcesCount: number;
  boidsCount: number;
}): FrameUpdateOpsLayout => {
  const layout = {
    opsRanges: {
      boids: [0, 0],
      foodSources: [0, 0],
      obstacles: [0, 0],
      deathMarkers: [0, 0],
    },
  } as FrameUpdateOpsLayout;

  let totalOps = 0;

  // First update death markers
  layout.deathMarkersToUpdate = deathMarkersCount;
  layout.opsRanges.deathMarkers = [
    totalOps,
    totalOps + layout.deathMarkersToUpdate - 1,
  ];
  totalOps += layout.deathMarkersToUpdate;

  // Then update obstacles
  layout.obstaclesToUpdate = obstaclesCount;
  layout.opsRanges.obstacles = [totalOps, totalOps + layout.obstaclesToUpdate];
  totalOps += layout.obstaclesToUpdate;

  // Then update food sources
  layout.foodSourcesToUpdate = foodSourcesCount;
  layout.opsRanges.foodSources = [
    totalOps,
    totalOps + layout.foodSourcesToUpdate - 1,
  ];
  totalOps += layout.foodSourcesToUpdate;

  // Then update boid spatial hash
  layout.boidSpatialHashToUpdate = boidsCount;
  layout.opsRanges.boidSpatialHash = [
    totalOps,
    totalOps + layout.boidSpatialHashToUpdate - 1,
  ];
  totalOps += layout.boidSpatialHashToUpdate;

  // Then update boids
  layout.boidsToUpdate = boidsCount;
  layout.opsRanges.boids = [totalOps, totalOps + layout.boidsToUpdate - 1];
  totalOps += layout.boidsToUpdate;

  layout.totalOps = totalOps;

  return layout;
};

const rangeToOperationMap = {
  boidSpatialHash: "updateBoidSpatialHash",
  deathMarkers: "updateDeathMarkers",
  obstacles: "updateObstacles",
  foodSources: "updateFoodSources",
  boids: "updateBoids",
} as const;

export const getActiveOperation = (
  opsRanges: FrameUpdateOpsLayout["opsRanges"],
  index: number,
): [string, [number, number]] | null => {
  for (const key in opsRanges) {
    const range = opsRanges[key as keyof FrameUpdateOpsLayout["opsRanges"]];
    // Skip inactive ops
    if (range[0] <= 0 && range[1] <= 0) continue;
    if (index >= range[0] && index < range[1]) {
      const operation =
        rangeToOperationMap[key as keyof typeof rangeToOperationMap];
      if (operation) {
        return [operation, range];
      } else {
        console.error("operation not found", key, index, range);
        return null;
      }
    }
  }
  return null;
};

type EnvironmentHandlers = {
  updateTrail: (boid: Boid, position: Vector2) => void;
  evaluateBoidBehavior: (boid: Boid, context: BoidUpdateContext) => void;
  updateBoid: (boid: Boid, context: BoidUpdateContext) => void;
};

type OperationFn = (index: number, context: EngineUpdateContext) => void;
type OperationsMap<Fn = OperationFn> = {
  updateDeathMarkers: Fn;
  updateObstacles: Fn;
  updateFoodSources: Fn;
  updateBoidSpatialHash: Fn;
  updateBoids: Fn;
};
type OperationFnWithHandlers = (
  index: number,
  context: EngineUpdateContext,
  handlers: EnvironmentHandlers,
) => void;
type OperationsMapWithHandlers<Fn = OperationFnWithHandlers> =
  OperationsMap<Fn>;

export const updateEngine = (
  opsLayout: FrameUpdateOpsLayout,
  operationContext: EngineUpdateContext,
  operations: OperationsMapWithHandlers,
  handlers: EnvironmentHandlers,
) => {
  for (let i = 0; i < opsLayout.totalOps; i++) {
    const op = getActiveOperation(opsLayout.opsRanges, i);
    if (op) {
      const key = op[0];
      const range = op[1];
      const index = i - range[0];
      if (index >= 0 && index < range[1] - range[0]) {
        const operationHandler =
          operations[key as keyof OperationsMapWithHandlers];
        if (operationHandler) {
          operationHandler(index, operationContext, handlers);
        } else {
          console.error("operationHandler not found", key, index, range);
        }
      }
    }
  }
};

export const updateDeathMarkers = (
  index: number,
  context: EngineUpdateContext,
) => {
  context.deathMarkerSpatialHash.insertItem(
    context.simulation.deathMarkers[index],
  );
};

export const updateObstacles = (
  index: number,
  context: EngineUpdateContext,
) => {
  context.obstacleSpatialHash.insertItem(context.simulation.obstacles[index]);
};

export const updateFoodSources = (
  index: number,
  context: EngineUpdateContext,
) => {
  context.foodSourceSpatialHash.insertItem(
    context.simulation.foodSources[index],
  );
};

export const updateBoidSpatialHash = (
  index: number,
  context: EngineUpdateContext,
) => {
  context.boidSpatialHash.insertItem(context.boidsById[context.boidIds[index]]);
};

export const updateBoids = (
  index: number,
  context: EngineUpdateContext,
  handlers: EnvironmentHandlers,
) => {
  const boidKey = context.boidIds[index];
  const boid = context.boidsById[boidKey];
  if (boid) {
    const maxNeighborsLookup = context.constraints.maxNeighborsLookup;
    const nearbyBoids = context.boidSpatialHash.getNearbyItems(
      boid.position,
      context.config.world,
      maxNeighborsLookup,
      context.config.parameters.perceptionRadius,
    );
    const nearbyFoodSources = context.foodSourceSpatialHash.getNearbyItems(
      boid.position,
      context.config.world,
      maxNeighborsLookup,
      FOOD_CONSTANTS.FOOD_EATING_RADIUS * 2,
    );
    const nearbyObstacles = context.obstacleSpatialHash.getNearbyItems(
      boid.position,
      context.config.world,
      maxNeighborsLookup,
    );
    const nearbyDeathMarkers = context.deathMarkerSpatialHash.getNearbyItems(
      boid.position,
      context.config.world,
      maxNeighborsLookup,
      context.config.parameters.perceptionRadius,
    );
    const { nearbyPrey, nearbyPredators } = getNearbyBoidsByRole(
      boid,
      nearbyBoids,
    );
    // Buildup local context for boid update
    const localContext = {
      ...context,
      nearbyBoids,
      nearbyFoodSources,
      nearbyObstacles,
      nearbyDeathMarkers,
      nearbyPrey,
      nearbyPredators,
    } satisfies BoidUpdateContext;
    // Update boid
    handlers.updateBoid(boid, localContext);

    // Update trail
    const shouldUpdateTrail =
      boid.index % context.staggerFrames.tail ===
      context.currentFrame % context.staggerFrames.tail;
    if (shouldUpdateTrail) {
      handlers.updateTrail(boid, { x: boid.position.x, y: boid.position.y });
    }

    // Update behavior
    const shouldUpdateBehavior =
      boid.index % context.staggerFrames.behavior ===
      context.currentFrame % context.staggerFrames.behavior;
    if (shouldUpdateBehavior) {
      handlers.evaluateBoidBehavior(boid, localContext);
    }
  }
};

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
  boidSpatialHash,
  obstacleSpatialHash,
  foodSourceSpatialHash,
  deathMarkerSpatialHash,
}: {
  frame: number;
  config: ConfigContext;
  profiler: Profiler | undefined;
  simulation: SimulationContext;
  boidsCount: number;
  boidsStore: LocalBoidStore;
  deltaSeconds: number;
  forcesCollector: ForceCollector;
  boidSpatialHash: SpatialHash<Boid>;
  obstacleSpatialHash: SpatialHash<Obstacle>;
  foodSourceSpatialHash: SpatialHash<FoodSource>;
  deathMarkerSpatialHash: SpatialHash<DeathMarker>;
}): EngineUpdateContext => {
  profiler?.start(profilerKeywords.engine.createFrameUpdateContext);
  // const { config, simulation } = runtimeStore.store.getState();
  const maxBoidCrowdTolerance = getMaxCrowdTolerance(config.species);
  // Max neighbors lookup is 30% more than the max crowd tolerance to prevent concentration bottleneck
  // but still allow for some extra crowd tolerance
  // we need to ensure the maxNeighbors is at least the maxBoidCrowdTolerance
  // this is because, if it's lower, we will never reach the aversion threshold
  // since we will always consider less neighbors than the maxBoidCrowdTolerance
  const maxNeighborsLookup = Math.ceil(maxBoidCrowdTolerance * 1.3);
  const boids = boidsStore.boids;

  // Build update context from state slices
  profiler?.start(profilerKeywords.engine.buildFrameUpdateContext);
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
    boidSpatialHash,
    foodSourceSpatialHash,
    obstacleSpatialHash,
    deathMarkerSpatialHash,
    staggerFrames: {
      tail: 3,
      behavior: 20,
    },
    constraints: {
      maxNeighborsLookup,
    },
  } satisfies EngineUpdateContext;
  profiler?.end(profilerKeywords.engine.buildFrameUpdateContext);

  return baseUpdateContext;
};
