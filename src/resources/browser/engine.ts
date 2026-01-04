import { createForceCollector } from "@/boids/collectors.ts";
import type { CatchEvent } from "@/boids/vocabulary/schemas/events.ts";
import { Vector2 } from "@/boids/vocabulary/schemas/primitives.ts";
import { SpeciesConfig } from "@/boids/vocabulary/schemas/species.ts";
import type {
  WorldConfig,
  WorldPhysics,
} from "@/boids/vocabulary/schemas/world.ts";
import { DomainRNG } from "@/lib/seededRandom.ts";
import {
  bufferViewIndexes,
  setActiveBufferIndex,
  SharedBoidViews,
} from "@/lib/sharedMemory.ts";
import { sharedMemoryKeywords } from "@/lib/workerTasks/vocabulary.ts";
import { defineResource } from "braided";
import {
  applyBehaviorDecision,
  buildBehaviorContext,
  evaluateBehavior,
} from "../../boids/behavior/evaluator.ts";
import {
  createBehaviorRuleset,
  MINIMUM_STANCE_DURATION_FRAMES,
} from "../../boids/behavior/rules";
import { createBoid, updateBoid } from "../../boids/boid.ts";
import type { BoidUpdateContext } from "../../boids/context.ts";
import { defaultWorldPhysics } from "../../boids/defaultPhysics.ts";
import { getPredators, getPrey } from "../../boids/filters.ts";
import { FOOD_CONSTANTS } from "../../boids/food.ts";
import { isDead } from "../../boids/lifecycle/health.ts";
import { isReadyToMate, isWithinRadius } from "../../boids/predicates.ts";
import {
  createSpatialHash,
  ItemWithDistance,
} from "../../boids/spatialHash.ts";
import * as vec from "../../boids/vector.ts";
import {
  eventKeywords,
  profilerKeywords,
  roleKeywords,
} from "../../boids/vocabulary/keywords.ts";
import {
  Boid,
  DeathMarker,
  FoodSource,
  Obstacle,
} from "../../boids/vocabulary/schemas/entities.ts";
import type { Profiler } from "../shared/profiler.ts";
import { RandomnessResource } from "../shared/randomness.ts";
import { SharedMemoryManager } from "../shared/sharedMemoryManager.ts";
import type { TimeResource } from "../shared/time.ts";
import {
  computeOpsLayout,
  createBaseFrameUpdateContext,
  updateBoids,
  updateBoidSpatialHash,
  updateDeathMarkers,
  updateEngine,
  updateFoodSources,
  updateObstacles,
} from "./engine/update.ts";
import {
  initializeBoidsStats,
  LocalBoidStore,
  LocalBoidStoreResource,
  syncBoidsToSharedMemory,
} from "./localBoidStore.ts";
import type { RuntimeStoreResource } from "./runtimeStore.ts";

export type BoidEngine = {
  // boids: Boid[];
  update: (deltaSeconds: number) => void;
  reset: () => void;
  addBoid: (boid: Boid) => void;
  removeBoid: (boidId: string) => void;
  getBoidById: (boidId: string) => Boid | undefined;
  checkCatches: () => CatchEvent[]; // Returns list of catches, doesn't dispatch
  getBufferViews: () => SharedBoidViews;
};

/**
 * Effectful function to create boids based on minimal parameters.
 */
const createBoids = ({
  preyCount,
  preyTypeIds,
  predatorCount,
  predatorTypeIds,
  species,
  rng,
  physics,
  boidsStore,
  world,
}: {
  preyCount: number;
  predatorCount: number;
  world: Pick<WorldConfig, "width" | "height">;
  species: Record<string, SpeciesConfig>;
  rng: DomainRNG;
  physics: WorldPhysics;
  boidsStore: LocalBoidStore;
  preyTypeIds: string[];
  predatorTypeIds: string[];
}) => {
  const creationContext = {
    world: {
      width: world.width,
      height: world.height,
    },
    species,
    rng,
    physics,
  };
  for (let i = 0; i < preyCount; i++) {
    boidsStore.addBoid(
      createBoid(preyTypeIds, creationContext, 0, boidsStore.nextIndex()),
    );
  }
  for (let i = 0; i < predatorCount; i++) {
    boidsStore.addBoid(
      createBoid(predatorTypeIds, creationContext, 0, boidsStore.nextIndex()),
    );
  }
};

export const engine = defineResource({
  dependencies: [
    "runtimeStore",
    "profiler",
    "randomness",
    "time",
    "localBoidStore",
    "sharedMemoryManager",
  ],
  start: ({
    runtimeStore,
    profiler,
    randomness,
    time,
    localBoidStore,
    sharedMemoryManager,
  }: {
    runtimeStore: RuntimeStoreResource;
    profiler: Profiler;
    randomness: RandomnessResource;
    time: TimeResource;
    localBoidStore: LocalBoidStoreResource;
    sharedMemoryManager: SharedMemoryManager;
  }) => {
    const { config: initialConfig } = runtimeStore.store.getState();
    const { world: initialWorld, species: initialSpecies } = initialConfig;

    const boidsStore = localBoidStore.store;

    // Get available type IDs (prey for initial spawn, predators from profile)
    let preyTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "prey",
    );
    let predatorTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "predator",
    );

    // Get physics from config (or use defaults)
    const physics = initialConfig.physics || defaultWorldPhysics;

    const rng = randomness.domain("spawning");
    createBoids({
      preyCount: initialWorld.initialPreyCount,
      preyTypeIds,
      predatorCount: initialWorld.initialPredatorCount ?? 0,
      predatorTypeIds,
      species: initialSpecies,
      rng,
      physics,
      boidsStore,
      world: initialWorld,
    });

    // Create SharedArrayBuffer
    const boidsPhysicsMemory = sharedMemoryManager.initialize(
      sharedMemoryKeywords.boidsPhysics,
      initialConfig.parameters.maxBoids,
    );
    syncBoidsToSharedMemory(boidsPhysicsMemory.views, boidsStore.boids);
    initializeBoidsStats(boidsPhysicsMemory.views, {
      aliveCount: boidsStore.count(),
      frameCount: 0,
      simulationTimeMs: 0,
    });
    setActiveBufferIndex(boidsPhysicsMemory.views, bufferViewIndexes.front);

    // Create spatial hash (cell size = perception radius for optimal performance)
    const boidSpatialHash = createSpatialHash<Boid>(
      initialWorld.width,
      initialWorld.height,
      initialConfig.parameters.perceptionRadius,
    );

    const foodSourceSpatialHash = createSpatialHash<FoodSource>(
      initialWorld.width,
      initialWorld.height,
      FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5,
    );
    const obstacleSpatialHash = createSpatialHash<Obstacle>(
      initialWorld.width,
      initialWorld.height,
      initialConfig.parameters.perceptionRadius,
    );
    const deathMarkerSpatialHash = createSpatialHash<DeathMarker>(
      initialWorld.width,
      initialWorld.height,
      initialConfig.parameters.perceptionRadius,
    );

    // Create behavior ruleset for stance evaluation (Session 76)
    const behaviorRuleset = createBehaviorRuleset();
    const forcesCollector = createForceCollector();

    const newUpdate = (deltaSeconds: number) => {
      profiler.start(profilerKeywords.engine.update);
      const { simulation, config } = runtimeStore.store.getState();
      time.incrementFrame();
      const opsLayout = computeOpsLayout({
        deathMarkersCount: simulation.deathMarkers.length,
        obstaclesCount: simulation.obstacles.length,
        foodSourcesCount: simulation.foodSources.length,
        boidsCount: boidsStore.count(),
      });

      const updateContext = createBaseFrameUpdateContext({
        frame: time.getFrame(),
        config,
        profiler,
        simulation,
        boidsCount: boidsStore.count(),
        boidsStore,
        deltaSeconds,
        boidSpatialHash,
        deathMarkerSpatialHash,
        foodSourceSpatialHash,
        forcesCollector,
        obstacleSpatialHash,
      });

      // Cleanup things
      boidSpatialHash.grid.clear();
      foodSourceSpatialHash.grid.clear();
      obstacleSpatialHash.grid.clear();
      deathMarkerSpatialHash.grid.clear();

      updateEngine(
        opsLayout,
        updateContext,
        {
          updateBoids: updateBoids,
          updateDeathMarkers: updateDeathMarkers,
          updateObstacles: updateObstacles,
          updateFoodSources: updateFoodSources,
          updateBoidSpatialHash: updateBoidSpatialHash,
        },
        {
          updateBoid: (boid: Boid, context: BoidUpdateContext) => {
            updateBoid(boid, context);
          },
          updateTrail: (boid: Boid, position: Vector2) => {
            // no op for now
            boid.positionHistory.push({ x: position.x, y: position.y });
            const speciesConfig = config.species[boid.typeId];
            if (
              boid.positionHistory.length >
              speciesConfig.visualConfig.trailLength
            ) {
              boid.positionHistory.shift();
            }
          },
          evaluateBoidBehavior: (boid: Boid, context: BoidUpdateContext) => {
            evaluateBoidBehavior(boid, context);
          },
        },
      );
    };

    // Evaluate behavior for a single boid (Session 76: Frame-rate evaluation)
    const evaluateBoidBehavior = (boid: Boid, context: BoidUpdateContext) => {
      const {
        config,
        currentFrame,
        nearbyPrey: prey,
        nearbyPredators: predators,
      } = context;
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
              return isWithinRadius(boid.position, p.item.position, fearRadius);
            })
          : [];

      const nearbyPrey =
        role === roleKeywords.predator
          ? prey.filter((p) =>
              isWithinRadius(
                boid.position,
                p.item.position,
                parameters.chaseRadius,
              ),
            )
          : [];

      const nearbyFlock: ItemWithDistance<Boid>[] = [];
      const allNearbyBoidsCount = nearbyPredators.length + nearbyPrey.length;
      const preyStartOffset = nearbyPredators.length;
      let offset = 0;
      // iterator, zero allocations
      while (offset < allNearbyBoidsCount) {
        const nearbyBoid =
          offset < preyStartOffset
            ? nearbyPredators[offset]
            : nearbyPrey[offset - preyStartOffset];
        if (nearbyBoid) {
          nearbyFlock.push(nearbyBoid);
        }
        offset += nearbyBoid ? 1 : 0;
      }

      const populationRatio = boidsStore.count() / parameters.maxBoids;
      const readyToMate = isReadyToMate(boid, parameters, speciesConfig);

      // Build context
      const behaviorContext = buildBehaviorContext(boid, speciesConfig, {
        frame: time.getFrame(),
        populationRatio,
        readyToMate,
        nearbyPredators,
        nearbyPrey,
        nearbyFood: context.nearbyFoodSources,
        nearbyFlock,
      });

      // Evaluate and apply
      const decision = evaluateBehavior(behaviorContext, behaviorRuleset, role);

      if (decision) {
        applyBehaviorDecision(
          boid,
          decision,
          currentFrame, // Use frame for stance tracking!
          MINIMUM_STANCE_DURATION_FRAMES,
          profiler,
        );
      }
    };

    // Check for catches - returns list of catches without side effects
    // Called by renderer which will dispatch events
    const checkCatches = (): CatchEvent[] => {
      const { config: cfg } = runtimeStore.store.getState();
      const { parameters } = cfg;
      const boids = boidsStore.boids;

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
            cfg.world.height,
          );

          if (dist < parameters.catchRadius) {
            // Attack! Deal damage based on predator's attack power
            const damage = predator.phenotype.attackDamage;

            // Apply damage to prey
            preyBoid.health -= damage;

            // Knockback: Push prey away from predator (gives escape chance)
            const knockbackStrength = 40;
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
                type: eventKeywords.boids.caught,
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

      boidsStore.clear();

      // Recalculate type IDs from current species config
      // (Species change when profile switches, so we need fresh IDs)
      const currentPreyTypeIds = Object.keys(species).filter(
        (id) => species[id].role === "prey",
      );
      const currentPredatorTypeIds = Object.keys(species).filter(
        (id) => species[id].role === "predator",
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
        boidsStore.addBoid(
          createBoid(
            currentPreyTypeIds,
            creationContext,
            0,
            boidsStore.nextIndex(),
          ),
        );
      }

      // Respawn predators (if any)
      for (let i = 0; i < (world.initialPredatorCount || 0); i++) {
        boidsStore.addBoid(
          createBoid(
            currentPredatorTypeIds,
            creationContext,
            0,
            boidsStore.nextIndex(),
          ),
        );
      }

      console.log(
        `[engine.reset] Respawned ${boidsStore.boids.length} boids (${currentPreyTypeIds.length} prey species, ${currentPredatorTypeIds.length} predator species)`,
      );
    };

    const addBoid = (boid: Boid) => {
      profiler.start(profilerKeywords.engine.addBoid);
      boidsStore.addBoid(boid);
      profiler.end(profilerKeywords.engine.addBoid);
    };

    const removeBoid = (boidId: string) => {
      profiler.start(profilerKeywords.engine.removeBoid);
      boidsStore.removeBoid(boidId);
      profiler.end(profilerKeywords.engine.removeBoid);
    };

    const getBoidById = (boidId: string) => {
      return boidsStore.getBoidById(boidId);
    };

    return {
      update: newUpdate,
      reset,
      addBoid,
      removeBoid,
      getBoidById,
      checkCatches,
      getBufferViews: () => boidsPhysicsMemory.views,
    } satisfies BoidEngine;
  },
  halt: () => {
    // No cleanup needed
  },
});
