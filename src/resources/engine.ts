import { defineResource } from "braided";
import type { Boid, BoidConfig } from "../boids/types";
import { createBoid, updateBoid } from "../boids/boid";
import {
  createSpatialHash,
  insertBoids,
  getNearbyBoids,
} from "../boids/spatialHash";
import type { StartedRuntimeStore } from "./runtimeStore";

export type BoidEngine = {
  boids: Boid[];
  update: () => void;
  reset: () => void;
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
    // Get available type IDs
    const typeIds = Object.keys(config.types);

    // Initialize boids with random types
    const boids: Boid[] = [];
    for (let i = 0; i < config.count; i++) {
      boids.push(
        createBoid(
          config.canvasWidth,
          config.canvasHeight,
          typeIds
        )
      );
    }

    // Create spatial hash (cell size = perception radius for optimal performance)
    const spatialHash = createSpatialHash(
      config.canvasWidth,
      config.canvasHeight,
      config.perceptionRadius
    );

    const update = () => {
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
        updateBoid(boid, nearbyBoids, runtimeParams.obstacles, dynamicConfig);
      }
    };

    const reset = () => {
      boids.length = 0;
      for (let i = 0; i < config.count; i++) {
        boids.push(
          createBoid(
            config.canvasWidth,
            config.canvasHeight,
            typeIds
          )
        );
      }
    };

    return { boids, update, reset } satisfies BoidEngine;
  },
  halt: () => {
    // No cleanup needed
  },
});
