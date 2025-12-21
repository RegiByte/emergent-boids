import { defineResource } from "braided";
import type { Boid, BoidConfig } from "../boids/types";
import { createBoid, updateBoid } from "../boids/boid";
import {
  createSpatialHash,
  insertBoids,
  getNearbyBoids,
} from "../boids/spatialHash";
import type { StartedRuntimeStore } from "./runtimeStore";
import * as vec from "../boids/vector";
import { getPredators, getPrey } from "../boids/filters";

export type CatchEvent = {
  predatorId: string;
  preyId: string;
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
  dependencies: ["config", "runtimeStore"],
  start: ({
    config,
    runtimeStore,
  }: {
    config: BoidConfig;
    runtimeStore: StartedRuntimeStore;
  }) => {
    const store = runtimeStore.store;
    // Get available type IDs (only prey types for initial spawn)
    const preyTypeIds = Object.keys(config.types).filter(
      (id) => config.types[id].role === "prey"
    );

    // Initialize boids with random prey types
    const boids: Boid[] = [];
    for (let i = 0; i < config.count; i++) {
      boids.push(
        createBoid(
          config.canvasWidth,
          config.canvasHeight,
          preyTypeIds,
          config.types
        )
      );
    }

    // Create spatial hash (cell size = perception radius for optimal performance)
    const spatialHash = createSpatialHash(
      config.canvasWidth,
      config.canvasHeight,
      config.perceptionRadius
    );

    const update = (deltaSeconds: number) => {
      // Get current runtime parameters from store
      const runtimeParams = store.getState().state;

      // Build dynamic config with runtime parameters
      const dynamicConfig: BoidConfig = {
        ...config,
        perceptionRadius: runtimeParams.perceptionRadius,
        obstacleAvoidanceWeight: runtimeParams.obstacleAvoidanceWeight,
        types: runtimeParams.types, // Use runtime type configs (mutable)
      };

      // Insert all boids into spatial hash for efficient neighbor queries
      insertBoids(spatialHash, boids);

      // Update each boid with only nearby boids (O(n) instead of O(n²))
      for (const boid of boids) {
        const nearbyBoids = getNearbyBoids(spatialHash, boid.position);
        updateBoid(
          boid,
          nearbyBoids,
          runtimeParams.obstacles,
          runtimeParams.deathMarkers,
          runtimeParams.foodSources,
          dynamicConfig,
          deltaSeconds
        );

        // Update position history for motion trails
        const typeConfig = dynamicConfig.types[boid.typeId];
        if (typeConfig) {
          // Add current position to history
          boid.positionHistory.push({ x: boid.position.x, y: boid.position.y });

          // Keep only the last N positions based on type config
          if (boid.positionHistory.length > typeConfig.trailLength) {
            boid.positionHistory.shift(); // Remove oldest position
          }
        }
      }
    };

    // Check for catches - returns list of catches without side effects
    // Called by renderer which will dispatch events
    const checkCatches = (): CatchEvent[] => {
      const runtimeParams = store.getState().state;
      const dynamicConfig: BoidConfig = {
        ...config,
        perceptionRadius: runtimeParams.perceptionRadius,
        obstacleAvoidanceWeight: runtimeParams.obstacleAvoidanceWeight,
        types: runtimeParams.types,
      };

      // Use pure filters
      const predators = getPredators(boids, dynamicConfig.types);
      const prey = getPrey(boids, dynamicConfig.types);

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
            dynamicConfig.canvasWidth,
            dynamicConfig.canvasHeight
          );

          if (dist < dynamicConfig.catchRadius) {
            // Caught! Food source will be created by lifecycleManager
            // No instant energy gain - predator must eat from food source

            // Store prey data BEFORE removing it
            const preyEnergy = preyBoid.energy;
            const preyPosition = { x: preyBoid.position.x, y: preyBoid.position.y };

            // Set eating cooldown (prevents monopolizing food)
            predator.eatingCooldown = dynamicConfig.eatingCooldownTicks;

            caughtPreyIds.push(preyBoid.id);
            removeBoid(preyBoid.id);

            catches.push({
              predatorId: predator.id,
              preyId: preyBoid.id,
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
      boids.length = 0;
      for (let i = 0; i < config.count; i++) {
        boids.push(
          createBoid(
            config.canvasWidth,
            config.canvasHeight,
            preyTypeIds,
            config.types
          )
        );
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
