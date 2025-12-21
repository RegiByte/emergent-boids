import { defineResource } from "braided";
import { createBoid, updateBoid } from "../boids/boid";
import { getPredators, getPrey } from "../boids/filters";
import {
  createSpatialHash,
  getNearbyBoids,
  insertBoids,
} from "../boids/spatialHash";
import type { Boid } from "../boids/types";
import * as vec from "../boids/vector";
import type { StartedRuntimeStore } from "./runtimeStore";

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
  dependencies: ["runtimeStore"],
  start: ({ runtimeStore }: { runtimeStore: StartedRuntimeStore }) => {
    const { config: initialConfig } = runtimeStore.store.getState();
    const { world: initialWorld, species: initialSpecies } = initialConfig;

    // Convert species configs to flat BoidTypeConfig for backwards compatibility
    // const flatTypes = convertSpeciesConfigs(initialState.config.species);

    // Get available type IDs (prey for initial spawn, predators from profile)
    const preyTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "prey"
    );
    const predatorTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "predator"
    );

    // Initialize boids with prey and predators from profile
    const boids: Boid[] = [];

    // Spawn initial prey
    for (let i = 0; i < initialWorld.initialPreyCount; i++) {
      boids.push(
        createBoid(
          initialWorld.canvasWidth,
          initialWorld.canvasHeight,
          preyTypeIds,
          initialSpecies
        )
      );
    }

    // Spawn initial predators (if any)
    for (let i = 0; i < (initialWorld.initialPredatorCount || 0); i++) {
      boids.push(
        createBoid(
          initialWorld.canvasWidth,
          initialWorld.canvasHeight,
          predatorTypeIds,
          initialSpecies
        )
      );
    }

    // Create spatial hash (cell size = perception radius for optimal performance)
    const spatialHash = createSpatialHash(
      initialWorld.canvasWidth,
      initialWorld.canvasHeight,
      initialConfig.parameters.perceptionRadius
    );

    const update = (deltaSeconds: number) => {
      // Get current runtime state from store
      const { config: cfg, simulation } = runtimeStore.store.getState();
      const { parameters, species: speciesTypes, world } = cfg;

      // Insert all boids into spatial hash for efficient neighbor queries
      insertBoids(spatialHash, boids);

      // Update each boid with only nearby boids (O(n) instead of O(n²))
      for (const boid of boids) {
        const nearbyBoids = getNearbyBoids(spatialHash, boid.position);
        updateBoid(
          boid,
          nearbyBoids,
          simulation.obstacles,
          simulation.deathMarkers,
          simulation.foodSources,
          parameters,
          world,
          speciesTypes,
          deltaSeconds
        );

        // Update position history for motion trails
        const speciesConfig = speciesTypes[boid.typeId];
        if (speciesConfig) {
          // Add current position to history
          boid.positionHistory.push({ x: boid.position.x, y: boid.position.y });

          // Keep only the last N positions based on type config
          if (
            boid.positionHistory.length > speciesConfig.movement.trailLength
          ) {
            boid.positionHistory.shift(); // Remove oldest position
          }
        }
      }
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

      // Respawn prey
      for (let i = 0; i < world.initialPreyCount; i++) {
        boids.push(
          createBoid(
            world.canvasWidth,
            world.canvasHeight,
            preyTypeIds,
            species
          )
        );
      }

      // Respawn predators (if any)
      for (let i = 0; i < (world.initialPredatorCount || 0); i++) {
        boids.push(
          createBoid(
            world.canvasWidth,
            world.canvasHeight,
            predatorTypeIds,
            species
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
