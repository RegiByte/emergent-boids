import { getMaxCrowdTolerance } from "@/boids/affinity";
import { updateBoid } from "@/boids/boid";
import { createForceCollector } from "@/boids/collectors";
import { BoidUpdateContext, EngineUpdateContext } from "@/boids/context";
import { getBoidsByRole } from "@/boids/filters";
import { FOOD_CONSTANTS } from "@/boids/food";
import { createSpatialHash } from "@/boids/spatialHash";
import {
  Boid,
  DeathMarker,
  FoodSource,
  Obstacle,
} from "@/boids/vocabulary/schemas/entities";
import { AllEvents, CatchEvent } from "@/boids/vocabulary/schemas/events";
import {
  SharedBoidBufferLayout,
  StatsIndex,
  swapBuffers,
} from "@/lib/sharedMemory";
import { createSubscription } from "@/lib/state";
import { defineResource, StartedResource } from "braided";
import { BoidEngine } from "../browser/engine";
import {
  computeOpsLayout,
  updateBoids,
  updateBoidSpatialHash,
  updateDeathMarkers,
  updateEngine,
  updateFoodSources,
  updateObstacles,
} from "../browser/engine/update";
import { initializeBoidsStats } from "../browser/localBoidStore";
import { Profiler } from "../shared/profiler";
import { TimeAPI } from "../shared/time";
import { WorkerStoreResource } from "./workerStore";
import { CollectLifecycleEvent } from "@/boids/lifecycle/events";

/**
 * Worker Engine Resource
 *
 * Mirrors the main engine.ts but runs in worker thread.
 * Maintains full Boid[] array and syncs positions/velocities to SharedArrayBuffer.
 *
 * Philosophy: Reuse existing boid behavior code, don't reimplement physics!
 */
export const workerEngine = defineResource({
  dependencies: ["workerStore", "workerProfiler", "workerTime"],
  start: ({
    workerStore,
    workerProfiler,
    workerTime,
  }: {
    workerStore: WorkerStoreResource;
    workerProfiler: Profiler;
    workerTime: TimeAPI;
  }) => {
    const boidsStore = workerStore.boids;

    const engineEventSubscription = createSubscription<AllEvents>();

    // Spatial hashes for efficient neighbor queries
    let spatialHash: ReturnType<typeof createSpatialHash<Boid>> | null = null;
    let foodSourceSpatialHash: ReturnType<
      typeof createSpatialHash<FoodSource>
    > | null = null;
    let obstacleSpatialHash: ReturnType<
      typeof createSpatialHash<Obstacle>
    > | null = null;
    let deathMarkerSpatialHash: ReturnType<
      typeof createSpatialHash<DeathMarker>
    > | null = null;
    const forcesCollector = createForceCollector();

    /**
     * Initialize engine with boids and SharedArrayBuffer
     */
    const initialize = (input: {
      buffer: SharedArrayBuffer;
      layout: SharedBoidBufferLayout;
      initialBoids: Boid[];
    }) => {
      // Attach to SharedArrayBuffer via sharedMemoryManager
      boidsStore.setSharedBuffer(input.buffer, input.layout);

      // Store boids
      boidsStore.setBoids(input.initialBoids);

      // Create spatial hashes (Session 116: Complete parity with main engine)
      const state = workerStore.getState();
      const config = state.config;
      spatialHash = createSpatialHash<Boid>(
        config.world.width,
        config.world.height,
        config.parameters.perceptionRadius
      );
      foodSourceSpatialHash = createSpatialHash<FoodSource>(
        config.world.width,
        config.world.height,
        FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5
      );
      obstacleSpatialHash = createSpatialHash<Obstacle>(
        config.world.width,
        config.world.height,
        config.parameters.perceptionRadius
      );
      deathMarkerSpatialHash = createSpatialHash<DeathMarker>(
        config.world.width,
        config.world.height,
        config.parameters.perceptionRadius
      );

      // Sync initial positions/velocities to SharedArrayBuffer
      boidsStore.syncToSharedMemory();

      // Initialize stats
      const bufferViews = boidsStore.getBufferViews();
      if (!bufferViews) return;
      initializeBoidsStats(bufferViews, {
        aliveCount: boidsStore.count(),
        frameCount: 0,
        simulationTimeMs: 0,
      });

      console.log(
        `[WorkerEngine] Initialized with ${boidsStore.count()} boids via sharedMemoryManager`
      );
    };

    /**
     * Update physics using existing boid behavior code
     * This is the main update loop - mirrors engine.ts with single-pass approach
     *
     * Session 116: Full feature parity with main engine
     */
    const update = (deltaSeconds: number) => {
      const bufferViews = boidsStore.getBufferViews();
      if (
        !spatialHash ||
        !foodSourceSpatialHash ||
        !obstacleSpatialHash ||
        !deathMarkerSpatialHash ||
        !bufferViews
      )
        return;

      workerProfiler.start("engine.update");

      // Increment frame counter
      workerTime.incrementFrame();
      const currentFrame = workerTime.getFrame();

      // Get current config from store
      const state = workerStore.getState();
      const config = state.config;
      const boids = boidsStore.getBoids();
      const simulation = state.simulation;

      // Compute operations layout for single-pass update (Session 116: Parity with main engine)
      const opsLayout = computeOpsLayout({
        deathMarkersCount: simulation.deathMarkers.length,
        obstaclesCount: simulation.obstacles.length,
        foodSourcesCount: simulation.foodSources.length,
        boidsCount: boidsStore.count(),
      });

      // Compute max neighbors lookup based on crowd tolerance
      const maxBoidCrowdTolerance = getMaxCrowdTolerance(config.species);
      const maxNeighborsLookup = Math.ceil(maxBoidCrowdTolerance * 1.3);

      // Build engine update context (Session 116: Full parity with main engine)
      const updateContext: EngineUpdateContext = {
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
        profiler: workerProfiler,
        boidsById: boids,
        boidIds: Object.keys(boids),
        scaledTime: deltaSeconds * 30,
        boidsByRole: getBoidsByRole(boids, config.species),
        currentFrame,
        boidsCount: boidsStore.count(),
        forcesCollector,
        boidSpatialHash: spatialHash,
        foodSourceSpatialHash,
        obstacleSpatialHash,
        deathMarkerSpatialHash,
        staggerFrames: {
          tail: 3,
          behavior: 20,
          lifecycle: 60, // Check each boid once every 60 frames
        },
        constraints: {
          maxNeighborsLookup,
        },
      };

      // Clear all spatial hashes before single-pass update
      spatialHash.grid.clear();
      foodSourceSpatialHash.grid.clear();
      obstacleSpatialHash.grid.clear();
      deathMarkerSpatialHash.grid.clear();

      // Single-pass update engine (Session 116: Full parity with main engine)
      updateEngine(
        opsLayout,
        updateContext,
        {
          updateBoids,
          updateDeathMarkers,
          updateObstacles,
          updateFoodSources,
          updateBoidSpatialHash,
        },
        {
          updateBoid: (boid: Boid, context: BoidUpdateContext) => {
            updateBoid(boid, context);
          },
          updateTrail: (boid: Boid, position: { x: number; y: number }) => {
            // Update trail (staggered based on boid index)
            boid.positionHistory.push({ x: position.x, y: position.y });
            const speciesConfig = config.species[boid.typeId];
            if (
              speciesConfig &&
              boid.positionHistory.length >
                speciesConfig.visualConfig.trailLength
            ) {
              boid.positionHistory.shift();
            }
          },
          evaluateBoidBehavior: (_boid: Boid, _context: BoidUpdateContext) => {
            // TODO: Port behavior evaluation from main engine
            // For now, skip behavior evaluation in worker
            // This will be added in a future session
          },
          checkBoidLifecycle: (
            _boid: Boid,
            _context: BoidUpdateContext,
            _staggerRate: number,
            _collectEvent: CollectLifecycleEvent,
            _matedBoidsThisFrame: Set<string>
          ) => {
            // TODO: Port lifecycle check from main engine
            // For now, skip lifecycle check in worker
            // This will be added in a future session
          },
        }
      );

      // Sync updated positions/velocities to SharedArrayBuffer
      workerProfiler.start("sync.toSharedMemory");
      boidsStore.syncToSharedMemory();
      workerProfiler.end("sync.toSharedMemory");

      // Swap buffers so main thread sees updated data
      swapBuffers(bufferViews);

      // Update stats
      const frame = Atomics.load(bufferViews.stats, StatsIndex.FRAME_COUNT) + 1;
      Atomics.store(bufferViews.stats, StatsIndex.FRAME_COUNT, frame);

      workerProfiler.end("engine.update");
    };

    const api = {
      getBufferViews: () => {
        const bufferViews = boidsStore.getBufferViews();
        if (!bufferViews) throw new Error("Buffer views not found");
        return bufferViews;
      },
      initialize,
      update,
      reset: () => {
        boidsStore.reset();
      },
      addBoid: (boid: Boid) => {
        boidsStore.addBoid(boid);
      },
      removeBoid: (boidId: string) => {
        boidsStore.removeBoid(boidId);
      },
      getBoidById: (boidId: string): Boid | undefined => {
        return boidsStore.getBoidById(boidId);
      },
      checkCatches: (): CatchEvent[] => {
        // TODO: Implement predator-prey catch detection
        return [];
      },
      eventSubscription: engineEventSubscription,
    } satisfies BoidEngine & {
      initialize: typeof initialize;
    };

    return api;
  },
  halt: () => {},
});

export type WorkerEngineResource = StartedResource<typeof workerEngine>;
