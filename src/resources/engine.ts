import { defineResource } from "braided";
import { createBoid, updateBoid } from "../boids/boid";
import type { BoidUpdateContext } from "../boids/context";
import { getPredators, getPrey } from "../boids/filters";
import {
  createSpatialHash,
  getNearbyBoids,
  insertBoids,
} from "../boids/spatialHash";
import * as vec from "../boids/vector";
import type { StartedRuntimeStore } from "./runtimeStore";
import type { Profiler } from "./profiler";
import { getMaxCrowdTolerance } from "../boids/affinity";
import { Boid } from "../boids/vocabulary/schemas/prelude";

export type CatchEvent = {
  predatorId: string;
  preyId: string;
  preyTypeId: string; // Type of prey that was caught
  preyEnergy: number;
  preyPosition: { x: number; y: number };
};

export type BoidEngine = {
  boids: Boid[];
  update: (deltaSeconds: number) => void;
  reset: () => void;
  addBoid: (boid: Boid) => void;
  removeBoid: (boidId: string) => void;
  getBoidById: (boidId: string) => Boid | undefined;
  checkCatches: () => CatchEvent[]; // Returns list of catches, doesn't dispatch
};

export const engine = defineResource({
  dependencies: ["runtimeStore", "profiler"],
  start: ({
    runtimeStore,
    profiler,
  }: {
    runtimeStore: StartedRuntimeStore;
    profiler: Profiler;
  }) => {
    const { config: initialConfig } = runtimeStore.store.getState();
    const { world: initialWorld, species: initialSpecies } = initialConfig;

    // Get available type IDs (prey for initial spawn, predators from profile)
    const preyTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "prey"
    );
    const predatorTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "predator"
    );

    // Initialize boids with prey and predators from profile
    const boids: Boid[] = [];

    // Build creation context
    const creationContext = {
      world: {
        canvasWidth: initialWorld.canvasWidth,
        canvasHeight: initialWorld.canvasHeight,
      },
      species: initialSpecies,
    };

    // Spawn initial prey
    for (let i = 0; i < initialWorld.initialPreyCount; i++) {
      boids.push(createBoid(preyTypeIds, creationContext));
    }

    // Spawn initial predators (if any)
    for (let i = 0; i < (initialWorld.initialPredatorCount || 0); i++) {
      boids.push(createBoid(predatorTypeIds, creationContext));
    }

    // Create spatial hash (cell size = perception radius for optimal performance)
    const spatialHash = createSpatialHash(
      initialWorld.canvasWidth,
      initialWorld.canvasHeight,
      initialConfig.parameters.perceptionRadius
    );

    // Frame counter for trail sampling (update trails every other frame)
    let frameCounter = 0;

    const update = (deltaSeconds: number) => {
      profiler.start("engine.update");

      // Increment frame counter for trail sampling
      frameCounter++;

      // Get current runtime state from store
      const { config, simulation } = runtimeStore.store.getState();

      const maxBoidCrowdTolerance = getMaxCrowdTolerance(config.species);
      // Max neighbors lookup is 25% more than the max crowd tolerance to prevent concentration bottleneck
      // but still allow for some extra crowd tolerance
      // we need to ensure the maxNeighbors is at least the maxBoidCrowdTolerance
      // this is because, if it's lower, we will never reach the aversion threshold
      // since we will always consider less neighbors than the maxBoidCrowdTolerance
      const maxNeighborsLookup = Math.ceil(maxBoidCrowdTolerance * 1.25);

      // Build update context from state slices
      const context: BoidUpdateContext = {
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
      };

      // Insert all boids into spatial hash for efficient neighbor queries
      profiler.start("spatial.insert");
      insertBoids(spatialHash, boids);
      profiler.end("spatial.insert");

      // Update each boid with only nearby boids (O(n) instead of O(n²))
      profiler.start("boids.update.loop");
      for (let i = 0; i < boids.length; i++) {
        const boid = boids[i];
        profiler.start("boid.spatial.query");
        const nearbyBoids = getNearbyBoids(
          spatialHash,
          boid.position,
          maxNeighborsLookup
        );
        profiler.end("boid.spatial.query");

        profiler.start("boid.rules.apply");
        updateBoid(boid, nearbyBoids, context);
        profiler.end("boid.rules.apply");

        // Update position history for motion trails (every other frame for performance)
        profiler.start("boid.trail.update");
        const speciesConfig = config.species[boid.typeId];
        /**
         * Performance optimization:
         * Distribute the trail update workload evenly across all boids
         * This ensures that even boids update on even frames and odd boids update on odd frames
         * Instead of trying to update them all in one frame, we distribute the load evenly across time
         */
        const isBoidEven = i % 2 === 0;
        const isFrameEven = frameCounter % 2 === 0;
        const shouldUpdateTrail =
          (isBoidEven && isFrameEven) || (!isBoidEven && !isFrameEven);
        if (speciesConfig && shouldUpdateTrail) {
          // Add current position to history (only on even frames)
          boid.positionHistory.push({ x: boid.position.x, y: boid.position.y });

          // Keep only the last N positions based on type config
          if (
            boid.positionHistory.length > speciesConfig.movement.trailLength
          ) {
            boid.positionHistory.shift(); // Remove oldest position
          }
        }
        profiler.end("boid.trail.update");
      }
      profiler.end("boids.update.loop");

      profiler.end("engine.update");
    };

    // Check for catches - returns list of catches without side effects
    // Called by renderer which will dispatch events
    const checkCatches = (): CatchEvent[] => {
      const { config: cfg } = runtimeStore.store.getState();
      const { parameters } = cfg;

      // Use pure filters
      const predators = getPredators(boids, cfg.species);
      const prey = getPrey(boids, cfg.species);

      const catches: CatchEvent[] = [];
      const caughtPreyIds: string[] = [];

      for (const predator of predators) {
        // Skip if predator is still eating (cooldown active)
        if (predator.eatingCooldown > 0) continue;

        for (const preyBoid of prey) {
          // Skip if already caught this frame
          if (caughtPreyIds.includes(preyBoid.id)) continue;

          const dist = vec.toroidalDistance(
            predator.position,
            preyBoid.position,
            cfg.world.canvasWidth,
            cfg.world.canvasHeight
          );

          if (dist < parameters.catchRadius) {
            // Caught! Food source will be created by lifecycleManager
            // No instant energy gain - predator must eat from food source

            // Store prey data BEFORE removing it
            const preyEnergy = preyBoid.energy;
            const preyPosition = {
              x: preyBoid.position.x,
              y: preyBoid.position.y,
            };
            const preyTypeId = preyBoid.typeId; // Capture typeId before removal

            // Set eating cooldown (prevents monopolizing food)
            predator.eatingCooldown = parameters.eatingCooldownTicks;

            caughtPreyIds.push(preyBoid.id);
            removeBoid(preyBoid.id);

            catches.push({
              predatorId: predator.id,
              preyId: preyBoid.id,
              preyTypeId, // Include prey type for death tracking
              preyEnergy,
              preyPosition,
            });

            break; // Predator can only catch one prey per frame
          }
        }
      }

      return catches;
    };

    const reset = () => {
      const { config: cfg } = runtimeStore.store.getState();
      const { world, species } = cfg;

      boids.length = 0;

      // Build creation context
      const creationContext = {
        world: {
          canvasWidth: world.canvasWidth,
          canvasHeight: world.canvasHeight,
        },
        species,
      };

      // Respawn prey
      for (let i = 0; i < world.initialPreyCount; i++) {
        boids.push(createBoid(preyTypeIds, creationContext));
      }

      // Respawn predators (if any)
      for (let i = 0; i < (world.initialPredatorCount || 0); i++) {
        boids.push(createBoid(predatorTypeIds, creationContext));
      }
    };

    const addBoid = (boid: Boid) => {
      boids.push(boid);
    };

    const removeBoid = (boidId: string) => {
      const index = boids.findIndex((b) => b.id === boidId);
      if (index !== -1) {
        boids.splice(index, 1);
      }
    };

    const getBoidById = (boidId: string) => {
      return boids.find((b) => b.id === boidId);
    };

    return {
      boids,
      update,
      reset,
      addBoid,
      removeBoid,
      getBoidById,
      checkCatches,
    } satisfies BoidEngine;
  },
  halt: () => {
    // No cleanup needed
  },
});
