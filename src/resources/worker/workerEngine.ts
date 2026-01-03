import { updateBoid } from "@/boids/boid";
import { BoidUpdateContext } from "@/boids/context";
import {
  createSpatialHash,
  getNearbyBoids,
  insertGridItems,
} from "@/boids/spatialHash";
import { Boid } from "@/boids/vocabulary/schemas/entities";
import { CatchEvent } from "@/boids/vocabulary/schemas/events";
import {
  SharedBoidBufferLayout,
  StatsIndex,
  swapBuffers,
} from "@/lib/sharedMemory";
import { defineResource, StartedResource } from "braided";
import { Profiler } from "../shared/profiler";
import { TimeAPI } from "../shared/time";
import { WorkerStoreResource } from "./workerStore";
import { iterateBoids } from "@/boids/iterators";
import { initializeBoidsStats } from "../browser/localBoidStore";

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

    // Spatial hash for efficient neighbor queries
    let spatialHash: ReturnType<typeof createSpatialHash> | null = null;

    /**
     * Initialize engine with boids and SharedArrayBuffer
     */
    const initialize = (input: {
      buffer: SharedArrayBuffer;
      layout: SharedBoidBufferLayout;
      initialBoids: Boid[];
    }) => {
      // Store SharedArrayBuffer references
      boidsStore.setSharedBuffer(input.buffer, input.layout);

      // Store boids
      boidsStore.setBoids(input.initialBoids);

      // Create spatial hash
      const state = workerStore.getState();
      const config = state.config;
      spatialHash = createSpatialHash(
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
        `[WorkerEngine] Initialized with ${boidsStore.count()} boids`
      );
    };

    /**
     * Update physics using existing boid behavior code
     * This is the main update loop - mirrors engine.ts
     */
    const update = (deltaSeconds: number) => {
      const bufferViews = boidsStore.getBufferViews();
      if (!spatialHash || !bufferViews) return;

      workerProfiler.start("engine.update");

      // Get current config from store
      const state = workerStore.getState();
      const config = state.config;
      const boids = boidsStore.getBoids();
      const simulation = state.simulation;

      // Build update context (same as main engine)
      const context: BoidUpdateContext = {
        simulation: {
          obstacles: simulation.obstacles,
          deathMarkers: simulation.deathMarkers,
          foodSources: simulation.foodSources,
          tick: 0, // Worker doesn't track lifecycle ticks
          frame: workerTime.getFrame(),
        },
        config: {
          parameters: config.parameters,
          world: config.world,
          species: config.species,
        },
        deltaSeconds,
        profiler: workerProfiler,
        frame: workerTime.getFrame(),
      };

      // Insert boids into spatial hash
      workerProfiler.start("spatial.insert");
      insertGridItems(spatialHash, boids);
      workerProfiler.end("spatial.insert");

      // Update each boid using existing behavior code
      workerProfiler.start("boids.update.loop");
      for (const boid of iterateBoids(boids)) {
        // Get nearby boids from spatial hash
        workerProfiler.start("boid.spatial.query");
        const nearbyBoids = getNearbyBoids(
          spatialHash,
          boid.position,
          50, // maxNeighbors
          config.parameters.perceptionRadius
        );
        workerProfiler.end("boid.spatial.query");

        // Update boid using existing rules (separation, alignment, cohesion, etc.)
        workerProfiler.start("boid.rules.apply");
        updateBoid(boid, nearbyBoids, context);
        workerProfiler.end("boid.rules.apply");
      }
      workerProfiler.end("boids.update.loop");

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
      get boids() {
        return boidsStore.getBoids();
      }, // Expose boids array (like main engine)
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
    };

    return api;
  },
  halt: () => {},
});

export type WorkerEngineResource = StartedResource<typeof workerEngine>;
