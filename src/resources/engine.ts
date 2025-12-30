import { defineResource } from "braided";
import { getMaxCrowdTolerance } from "../boids/affinity";
import { createBoid, updateBoid } from "../boids/boid";
import type {
  BoidUpdateContext,
  ConfigContext,
  SimulationContext,
} from "../boids/context";
import { getPredators, getPrey } from "../boids/filters";
import { isDead } from "../boids/lifecycle/health";
import {
  createSpatialHash,
  getNearbyBoids,
  insertBoids,
} from "../boids/spatialHash";
import * as vec from "../boids/vector";
import { Boid } from "../boids/vocabulary/schemas/prelude";
import type { Profiler } from "./profiler";
import { RandomnessResource } from "./randomness";
import type { RuntimeStoreResource } from "./runtimeStore";
import { defaultWorldPhysics } from "./defaultPhysics";
import { WorldPhysics } from "@/boids/vocabulary/schemas/genetics";
import {
  createBehaviorRuleset,
  MINIMUM_STANCE_DURATION,
} from "../boids/behavior/rules";
import {
  evaluateBehavior,
  applyBehaviorDecision,
  buildBehaviorContext,
} from "../boids/behavior/evaluator";
import { isWithinRadius, isReadyToMate } from "../boids/predicates";
import { FOOD_CONSTANTS } from "../boids/food";
import { roleKeywords } from "../boids/vocabulary/keywords";
import type { TimeResource } from "./time";

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
  dependencies: ["runtimeStore", "profiler", "randomness", "time"],
  start: ({
    runtimeStore,
    profiler,
    randomness,
    time,
  }: {
    runtimeStore: RuntimeStoreResource;
    profiler: Profiler;
    randomness: RandomnessResource;
    time: TimeResource;
  }) => {
    const { config: initialConfig } = runtimeStore.store.getState();
    const { world: initialWorld, species: initialSpecies } = initialConfig;

    // Get available type IDs (prey for initial spawn, predators from profile)
    let preyTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "prey"
    );
    let predatorTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "predator"
    );

    // Initialize boids with prey and predators from profile
    const boids: Boid[] = [];

    // Get physics from config (or use defaults)
    const physics =
      (initialConfig as unknown as { physics?: WorldPhysics }).physics ||
      defaultWorldPhysics;

    // Build creation context
    const creationContext = {
      world: {
        width: initialWorld.width,
        height: initialWorld.height,
      },
      species: initialSpecies,
      rng: randomness.domain("spawning"),
      physics,
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
      initialWorld.width,
      initialWorld.height,
      initialConfig.parameters.perceptionRadius
    );

    // Create behavior ruleset for stance evaluation (Session 76)
    const behaviorRuleset = createBehaviorRuleset();
    const BEHAVIOR_STAGGER_FRAMES = 30;

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
          tick: 0, // Engine doesn't track lifecycle ticks (only lifecycleManager does)
          frame: time.getFrame(), // Physics frame for behavior evaluation (Session 76)
        },
        config: {
          parameters: config.parameters,
          world: config.world,
          species: config.species,
        },
        deltaSeconds,
        profiler,
        frame: time.getFrame(),
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
          maxNeighborsLookup,
          config.parameters.perceptionRadius // Only consider boids within perception radius
        );
        profiler.end("boid.spatial.query");

        profiler.start("boid.rules.apply");
        updateBoid(boid, nearbyBoids, context);
        profiler.end("boid.rules.apply");

        // Update position history for motion trails (every 3rd frame for performance)
        profiler.start("boid.trail.update");
        const speciesConfig = config.species[boid.typeId];
        /**
         * Performance optimization (Session 71):
         * Distribute trail updates across 3 frames instead of 2
         * Each boid updates on its designated frame (i % 3 === frameCounter % 3)
         * This reduces trail update cost by 33% with minimal visual impact
         */
        const shouldUpdateTrail = i % 3 === frameCounter % 3;
        if (speciesConfig && shouldUpdateTrail) {
          // Add current position to history
          boid.positionHistory.push({ x: boid.position.x, y: boid.position.y });

          // Keep only the last N positions based on type config
          if (
            boid.positionHistory.length > speciesConfig.visualConfig.trailLength
          ) {
            boid.positionHistory.shift(); // Remove oldest position
          }
        }
        profiler.end("boid.trail.update");
      }
      profiler.end("boids.update.loop");

      // Session 76: Behavior evaluation at frame rate (30-60 Hz) with staggering
      profiler.start("behavior.evaluate");
      const currentFrame = time.getFrame();
      const predators = getPredators(boids, config.species);
      const prey = getPrey(boids, config.species);

      for (let i = 0; i < boids.length; i++) {
        const boid = boids[i];

        // Staggered: each boid checks every 30 frames
        if (
          currentFrame % BEHAVIOR_STAGGER_FRAMES ===
          i % BEHAVIOR_STAGGER_FRAMES
        ) {
          evaluateBoidBehavior(
            boid,
            i,
            boids,
            predators,
            prey,
            context.config,
            context.simulation,
            currentFrame
          );
        }
      }
      profiler.end("behavior.evaluate");

      profiler.end("engine.update");
    };

    // Evaluate behavior for a single boid (Session 76: Frame-rate evaluation)
    const evaluateBoidBehavior = (
      boid: Boid,
      boidIndex: number,
      allBoids: Boid[],
      predators: Boid[],
      prey: Boid[],
      config: ConfigContext,
      simulation: SimulationContext,
      currentFrame: number
    ) => {
      const speciesConfig = config.species[boid.typeId];
      if (!speciesConfig) return;

      const role = speciesConfig.role;
      const parameters = config.parameters;

      // Gather nearby entities
      const nearbyPredators =
        role === roleKeywords.prey
          ? predators.filter((p) => {
              const fearRadius =
                speciesConfig.limits.fearRadius ?? parameters.fearRadius;
              return isWithinRadius(boid.position, p.position, fearRadius);
            })
          : [];

      const nearbyPrey =
        role === roleKeywords.predator
          ? prey.filter((p) =>
              isWithinRadius(boid.position, p.position, parameters.chaseRadius)
            )
          : [];

      const nearbyFood = simulation.foodSources.filter((f) => {
        if (f.sourceType !== role || f.energy <= 0) return false;
        const detectionRadius = FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5;
        return isWithinRadius(boid.position, f.position, detectionRadius);
      });

      const nearbyFlock = allBoids.filter(
        (b) =>
          b.typeId === boid.typeId &&
          b.id !== boid.id &&
          isWithinRadius(boid.position, b.position, parameters.perceptionRadius)
      );

      const populationRatio = allBoids.length / parameters.maxBoids;
      const readyToMate = isReadyToMate(boid, parameters, speciesConfig);

      // Build context
      const behaviorContext = buildBehaviorContext(
        boid,
        boidIndex,
        nearbyPredators,
        nearbyPrey,
        nearbyFood,
        nearbyFlock,
        simulation.tick,
        role,
        speciesConfig.reproduction.type,
        readyToMate,
        populationRatio
      );

      // Evaluate and apply
      const decision = evaluateBehavior(behaviorContext, behaviorRuleset, role);

      if (decision) {
        applyBehaviorDecision(
          boid,
          decision,
          simulation.tick,
          currentFrame, // Use frame for stance tracking!
          MINIMUM_STANCE_DURATION
        );
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
        // Skip if predator is still on attack cooldown
        if (predator.attackCooldown > 0) continue;

        for (const preyBoid of prey) {
          // Skip if already caught this frame
          if (caughtPreyIds.includes(preyBoid.id)) continue;

          const dist = vec.toroidalDistance(
            predator.position,
            preyBoid.position,
            cfg.world.width,
            cfg.world.height
          );

          if (dist < parameters.catchRadius) {
            // Attack! Deal damage based on predator's attack power
            const damage = predator.phenotype.attackDamage;

            // Apply damage to prey
            preyBoid.health -= damage;

            // Knockback: Push prey away from predator (gives escape chance)
            const knockbackStrength = 15;
            const dx = preyBoid.position.x - predator.position.x;
            const dy = preyBoid.position.y - predator.position.y;
            const pushDist = Math.sqrt(dx * dx + dy * dy);
            if (pushDist > 0) {
              const nx = dx / pushDist;
              const ny = dy / pushDist;
              preyBoid.velocity.x += nx * knockbackStrength;
              preyBoid.velocity.y += ny * knockbackStrength;
            }

            // Set attack cooldown (prevents spam attacks)
            predator.attackCooldown = parameters.attackCooldownTicks;

            // Check if prey died from attack
            if (isDead(preyBoid)) {
              // Store prey data BEFORE removing it
              // Use maxEnergy instead of current energy for food balance
              // (prey lose energy while fleeing, would create too little food)
              const preyEnergy = preyBoid.phenotype.maxEnergy;
              const preyPosition = {
                x: preyBoid.position.x,
                y: preyBoid.position.y,
              };
              const preyTypeId = preyBoid.typeId;

              // Remove dead prey
              removeBoid(preyBoid.id);
              caughtPreyIds.push(preyBoid.id);

              // Create food source from corpse
              catches.push({
                predatorId: predator.id,
                preyId: preyBoid.id,
                preyTypeId,
                preyEnergy,
                preyPosition,
              });
            }

            break; // Predator can only attack one prey per frame
          }
        }
      }

      return catches;
    };

    const reset = () => {
      const { config: cfg } = runtimeStore.store.getState();
      const { world, species } = cfg;

      boids.length = 0;

      // Recalculate type IDs from current species config
      // (Species change when profile switches, so we need fresh IDs)
      const currentPreyTypeIds = Object.keys(species).filter(
        (id) => species[id].role === "prey"
      );
      const currentPredatorTypeIds = Object.keys(species).filter(
        (id) => species[id].role === "predator"
      );

      // Update module-level type ID arrays for future spawns
      preyTypeIds = [...currentPreyTypeIds];
      predatorTypeIds = [...currentPredatorTypeIds];

      // Get physics from config (or use defaults)
      const resetPhysics =
        (cfg as unknown as { physics?: WorldPhysics }).physics ||
        defaultWorldPhysics;

      // Build creation context
      const creationContext = {
        world: {
          width: world.width,
          height: world.height,
        },
        species,
        rng: randomness.domain("spawning"),
        physics: resetPhysics,
      };

      // Respawn prey
      for (let i = 0; i < world.initialPreyCount; i++) {
        boids.push(createBoid(currentPreyTypeIds, creationContext));
      }

      // Respawn predators (if any)
      for (let i = 0; i < (world.initialPredatorCount || 0); i++) {
        boids.push(createBoid(currentPredatorTypeIds, creationContext));
      }

      console.log(
        `[engine.reset] Respawned ${boids.length} boids (${currentPreyTypeIds.length} prey species, ${currentPredatorTypeIds.length} predator species)`
      );
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
