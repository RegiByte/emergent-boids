import { getMaxCrowdTolerance } from "@/boids/affinity";
import { createBoidOfType, updateBoid } from "@/boids/boid";
import { createEventCollector, createForceCollector } from "@/boids/collectors";
import { BoidUpdateContext, EngineUpdateContext } from "@/boids/context";
import { defaultWorldPhysics } from "@/boids/defaultPhysics";
import { getBoidsByRole } from "@/boids/filters";
import { FOOD_CONSTANTS } from "@/boids/food";
import { LifecycleEvent } from "@/boids/vocabulary/schemas/events";
import { createSpatialHash } from "@/boids/spatialHash";
import { eventKeywords, lifecycleKeywords, simulationKeywords } from "@/boids/vocabulary/keywords";
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
  checkBoidLifecycle,
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
import { RandomnessResource } from "../shared/randomness";
import { TimeAPI } from "../shared/time";
import { WorkerStoreResource } from "./workerStore";
import {
  SimulationCommand,
  SimulationEvent,
} from "@/boids/vocabulary/schemas/simulation";
import { Channel } from "@/lib/channels";

/**
 * Worker Engine Resource
 *
 * Mirrors the main engine.ts but runs in worker thread.
 * Maintains full Boid[] array and syncs positions/velocities to SharedArrayBuffer.
 *
 * Philosophy: Reuse existing boid behavior code, don't reimplement physics!
 */
export const workerEngine = defineResource({
  dependencies: [
    "workerStore",
    "workerProfiler",
    "workerTime",
    "workerRandomness",
  ],
  start: ({
    workerStore,
    workerProfiler,
    workerTime,
    workerRandomness,
  }: {
    workerStore: WorkerStoreResource;
    workerProfiler: Profiler;
    workerTime: TimeAPI;
    workerRandomness: RandomnessResource;
  }) => {
    const boidsStore = workerStore.boids;

    let simulationChannel: Channel<SimulationCommand, SimulationEvent> | null =
      null;
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
     * Attach shared memory buffer and initial boids to the engine
     */
    const attach = (input: {
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

    const initialize = (
      channel: Channel<SimulationCommand, SimulationEvent>
    ) => {
      // Bind simulation channel so we can send events to it
      simulationChannel = channel;
    };

    /**
     * Update physics using existing boid behavior code
     * This is the main update loop - mirrors engine.ts with single-pass approach
     *
     * Session 116: Full feature parity with main engine
     * Session 119: Added lifecycle integration
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

      // Create lifecycle collector for this frame (Session 119)
      const lifecycleCollector = createEventCollector<LifecycleEvent>();
      const matedBoidsThisFrame = new Set<string>();

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
        // Add lifecycle tracking to context (Session 119)
        lifecycleCollector,
        matedBoidsThisFrame,
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
          // Session 119: Enable lifecycle checks (matches browser engine pattern)
          checkBoidLifecycle: checkBoidLifecycle,
        }
      );

      // Apply lifecycle events collected during the frame (Session 119)
      workerProfiler.start("lifecycle.apply");
      if (lifecycleCollector.items.length > 0) {
        // Process deaths FIRST (remove boids from worker)
        for (const event of lifecycleCollector.items) {
          if (event.type === lifecycleKeywords.events.death) {
            // Remove boid from worker store
            boidsStore.removeBoid(event.boidId);

            // Notify browser
            console.log("[WorkerEngine] Notifying browser of boid death:", event.boidId);
            simulationChannel?.out.notify({
              type: simulationKeywords.events.boidsDied,
              boidIds: [event.boidId],
            });
          }
        }

        // Process reproductions (spawn boids in worker)
        for (const event of lifecycleCollector.items) {
          if (event.type === lifecycleKeywords.events.reproduction) {
            const offspring = event.offspring;
            const speciesConfig = config.species[offspring.typeId];

            if (speciesConfig) {
              // Spawn offspring in worker (this will add to SharedArrayBuffer)
              const physics = config.physics || defaultWorldPhysics;
              const parent = boidsStore.getBoidById(offspring.parent1Id);

              if (parent) {
                // Create offspring using existing helper
                const creationContext = {
                  world: {
                    width: config.world.width,
                    height: config.world.height,
                  },
                  species: config.species,
                  rng: workerRandomness.domain("reproduction"),
                  physics,
                };

                const parentGenomes = parent.genome
                  ? {
                      parent1: parent.genome,
                    }
                  : undefined;

                const result = createBoidOfType(
                  offspring.position,
                  offspring.typeId,
                  creationContext,
                  speciesConfig.reproduction.offspringEnergyBonus || 0,
                  boidsStore.nextIndex(), // Get proper unique index
                  parentGenomes
                );

                // Add to worker's boid store (will sync to SharedArrayBuffer)
                boidsStore.addBoid(result.boid);

                // Notify browser with the actual spawned boid
                simulationChannel?.out.notify({
                  type: simulationKeywords.events.boidsReproduced,
                  boids: [
                    {
                      parentId1: offspring.parent1Id,
                      parentId2: offspring.parent2Id,
                      offspring: [result.boid],
                    },
                  ],
                });
              }
            }
          }
        }

        lifecycleCollector.reset();
      }
      workerProfiler.end("lifecycle.apply");

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
      cleanup: () => {
        simulationChannel?.clear();
      },
      attach,
    } satisfies BoidEngine & {
      attach: typeof attach;
    };

    return api;
  },
  halt: () => {},
});

export type WorkerEngineResource = StartedResource<typeof workerEngine>;
