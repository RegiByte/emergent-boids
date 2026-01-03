import { iterateBoids, iterateBoidsWithIndex } from "@/boids/iterators.ts";
import type { CatchEvent } from "@/boids/vocabulary/schemas/events.ts";
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
  swapBuffers,
} from "@/lib/sharedMemory.ts";
import { sharedMemoryKeywords } from "@/lib/workerTasks/vocabulary.ts";
import { queue } from "@tanstack/pacer";
import { defineResource } from "braided";
import { getMaxCrowdTolerance } from "../../boids/affinity.ts";
import {
  applyBehaviorDecision,
  buildBehaviorContext,
  evaluateBehavior,
} from "../../boids/behavior/evaluator.ts";
import {
  createBehaviorRuleset,
  MINIMUM_STANCE_DURATION,
} from "../../boids/behavior/rules";
import { createBoid, updateBoid } from "../../boids/boid.ts";
import type {
  BoidUpdateContext,
  ConfigContext,
  FrameUpdateContext,
  SimulationContext,
} from "../../boids/context.ts";
import { defaultWorldPhysics } from "../../boids/defaultPhysics.ts";
import { getBoidsByRole, getPredators, getPrey } from "../../boids/filters.ts";
import { FOOD_CONSTANTS } from "../../boids/food.ts";
import { isDead } from "../../boids/lifecycle/health.ts";
import { isReadyToMate, isWithinRadius } from "../../boids/predicates.ts";
import { createSpatialHash, SpatialHash } from "../../boids/spatialHash.ts";
import * as vec from "../../boids/vector.ts";
import {
  eventKeywords,
  profilerKeywords,
  roleKeywords,
} from "../../boids/vocabulary/keywords.ts";
import {
  Boid,
  BoidsById,
  DeathMarker,
  FoodSource,
  Obstacle,
} from "../../boids/vocabulary/schemas/entities.ts";
import type { Profiler } from "../shared/profiler.ts";
import { RandomnessResource } from "../shared/randomness.ts";
import { SharedMemoryManager } from "../shared/sharedMemoryManager.ts";
import type { TimeResource } from "../shared/time.ts";
import {
  initializeBoidsStats,
  LocalBoidStore,
  LocalBoidStoreResource,
  syncBoidsToSharedMemory,
} from "./localBoidStore.ts";
import type { RuntimeStoreResource } from "./runtimeStore.ts";
import { getNearbyBoidsByRole } from "@/boids/mappings.ts";
import { createForceCollector, ForceCollector } from "@/boids/collectors.ts";
import { FrameRaterAPI } from "../shared/frameRater.ts";
import {
  computeOpsLayout,
  createBaseFrameUpdateContext,
  FrameUpdateOpsLayout,
  getActiveOperation,
  OperationContext,
  updateBoids,
  updateBoidSpatialHash,
  updateDeathMarkers,
  updateEngine,
  updateFoodSources,
  updateObstacles,
} from "./engine/update.ts";
import { Role, Vector2 } from "@/boids/vocabulary/schemas/primitives.ts";

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
      createBoid(preyTypeIds, creationContext, 0, boidsStore.nextIndex())
    );
  }
  for (let i = 0; i < predatorCount; i++) {
    boidsStore.addBoid(
      createBoid(predatorTypeIds, creationContext, 0, boidsStore.nextIndex())
    );
  }
};

const createFrameUpdateContext = ({
  runtimeStore,
  time,
  boidsStore,
  sharedMemoryManager,
  deltaSeconds,
  profiler,
  boidSpatialHash,
  foodSpatialHash,
  obstacleSpatialHash,
  deathMarkerSpatialHash,
  boidsCount,
  forcesCollector,
}: {
  runtimeStore: RuntimeStoreResource;
  time: TimeResource;
  boidsStore: LocalBoidStore;
  sharedMemoryManager: SharedMemoryManager;
  deltaSeconds: number;
  profiler: Profiler | undefined;
  boidSpatialHash: SpatialHash<Boid>;
  foodSpatialHash: SpatialHash<FoodSource>;
  obstacleSpatialHash: SpatialHash<Obstacle>;
  deathMarkerSpatialHash: SpatialHash<DeathMarker>;
  boidsCount: number;
  forcesCollector: ForceCollector;
}) => {
  profiler?.start(profilerKeywords.engine.createFrameUpdateContext);
  const { config, simulation } = runtimeStore.store.getState();
  const maxBoidCrowdTolerance = getMaxCrowdTolerance(config.species);
  // Max neighbors lookup is 25% more than the max crowd tolerance to prevent concentration bottleneck
  // but still allow for some extra crowd tolerance
  // we need to ensure the maxNeighbors is at least the maxBoidCrowdTolerance
  // this is because, if it's lower, we will never reach the aversion threshold
  // since we will always consider less neighbors than the maxBoidCrowdTolerance
  const maxNeighborsLookup = Math.ceil(maxBoidCrowdTolerance * 1.25);
  const boids = boidsStore.boids;
  const frame = time.getFrame();

  // Build update context from state slices
  profiler?.start(profilerKeywords.engine.buildFrameUpdateContext);
  const context = {
    simulation: {
      obstacles: simulation.obstacles,
      deathMarkers: simulation.deathMarkers,
      foodSources: simulation.foodSources,
      tick: 0, // Engine doesn't track lifecycle ticks (only lifecycleManager does)
      frame,
    },
    config: {
      parameters: config.parameters,
      world: config.world,
      species: config.species,
    },
    deltaSeconds,
    profiler,
    maxNeighborsLookup,
    boids,
    scaledTime: deltaSeconds * 30,
    boidsByRole: getBoidsByRole(boids, config.species),
    currentFrame: frame,
    boidsCount,
    forcesCollector,
  } satisfies FrameUpdateContext;
  profiler?.end(profilerKeywords.engine.buildFrameUpdateContext);

  // Insert items into spatial hashes for efficient neighbor lookups
  profiler?.start(profilerKeywords.engine.insertBoidSpatialHash);
  boidSpatialHash.insertItems(boids);
  profiler?.end(profilerKeywords.engine.insertBoidSpatialHash);

  profiler?.start(profilerKeywords.engine.insertFoodSpatialHash);
  foodSpatialHash.insertItems(simulation.foodSources);
  profiler?.end(profilerKeywords.engine.insertFoodSpatialHash);

  profiler?.start(profilerKeywords.engine.insertObstacleSpatialHash);
  obstacleSpatialHash.insertItems(simulation.obstacles);
  profiler?.end(profilerKeywords.engine.insertObstacleSpatialHash);

  profiler?.start(profilerKeywords.engine.insertDeathMarkerSpatialHash);
  deathMarkerSpatialHash.insertItems(simulation.deathMarkers);
  profiler?.end(profilerKeywords.engine.insertDeathMarkerSpatialHash);

  profiler?.end(profilerKeywords.engine.createFrameUpdateContext);
  return context;
};

type CreateFrameUpdateContext = Parameters<typeof createFrameUpdateContext>[0];

export const engine = defineResource({
  dependencies: [
    "runtimeStore",
    "profiler",
    "randomness",
    "time",
    "localBoidStore",
    "sharedMemoryManager",
    "frameRater",
  ],
  start: ({
    runtimeStore,
    profiler,
    randomness,
    time,
    localBoidStore,
    sharedMemoryManager,
    frameRater,
  }: {
    runtimeStore: RuntimeStoreResource;
    profiler: Profiler;
    randomness: RandomnessResource;
    time: TimeResource;
    localBoidStore: LocalBoidStoreResource;
    sharedMemoryManager: SharedMemoryManager;
    frameRater: FrameRaterAPI;
  }) => {
    const { config: initialConfig } = runtimeStore.store.getState();
    const { world: initialWorld, species: initialSpecies } = initialConfig;

    const spatialHashExecutor = frameRater.throttled("spatialHash", {
      intervalMs: 1000 / 20, // 20Hz
    });

    const boidsStore = localBoidStore.store;

    // Get available type IDs (prey for initial spawn, predators from profile)
    let preyTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "prey"
    );
    let predatorTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === "predator"
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
      initialConfig.parameters.maxBoids
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
      initialConfig.parameters.perceptionRadius
    );

    const foodSourceSpatialHash = createSpatialHash<FoodSource>(
      initialWorld.width,
      initialWorld.height,
      FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5
    );
    const obstacleSpatialHash = createSpatialHash<Obstacle>(
      initialWorld.width,
      initialWorld.height,
      initialConfig.parameters.perceptionRadius
    );
    const deathMarkerSpatialHash = createSpatialHash<DeathMarker>(
      initialWorld.width,
      initialWorld.height,
      initialConfig.parameters.perceptionRadius
    );

    // Create behavior ruleset for stance evaluation (Session 76)
    const behaviorRuleset = createBehaviorRuleset();
    const forcesCollector = createForceCollector();
    const BEHAVIOR_STAGGER_FRAMES = 30;
    const TAIL_STAGGER_FRAMES = 2;

    // Frame counter for trail sampling (update trails every other frame)
    let frameCounter = 0;

    const update = (deltaSeconds: number) => {
      profiler.start(profilerKeywords.engine.update);

      // Increment frame counter for trail sampling
      frameCounter++;

      const ctx = {
        runtimeStore,
        time,
        boidsStore,
        sharedMemoryManager,
        deltaSeconds,
        profiler,
        boidSpatialHash,
        foodSpatialHash: foodSourceSpatialHash,
        obstacleSpatialHash,
        deathMarkerSpatialHash,
        boidsCount: boidsStore.count(),
        forcesCollector,
      } satisfies CreateFrameUpdateContext;
      const updateContext = createFrameUpdateContext(ctx);
      // const simulation = updateContext.simulation;
      // const opsLayout = computeOpsLayout({
      //   deathMarkersCount: simulation.deathMarkers.length,
      //   obstaclesCount: simulation.obstacles.length,
      //   foodSourcesCount: simulation.foodSources.length,
      //   boidsCount: updateContext.boidsCount,
      // });
      // if (frameCounter % 10 === 0 && opsLayout.totalOps > 0) {
      //   const lines = [];
      //   lines.push("Running ops:");
      //   lines.push("--------------------------------");
      //   lines.push(
      //     `Food sources: ${opsLayout.foodSourcesToUpdate} [${opsLayout.opsRanges.foodSources[0]}, ${opsLayout.opsRanges.foodSources[1]}]`
      //   );
      //   lines.push(
      //     `Obstacles: ${opsLayout.obstaclesToUpdate} [${opsLayout.opsRanges.obstacles[0]}, ${opsLayout.opsRanges.obstacles[1]}]`
      //   );
      //   lines.push(
      //     `Death markers: ${opsLayout.deathMarkersToUpdate} [${opsLayout.opsRanges.deathMarkers[0]}, ${opsLayout.opsRanges.deathMarkers[1]}]`
      //   );
      //   lines.push(
      //     `Boids: ${opsLayout.boidsToUpdate} [${opsLayout.opsRanges.boids[0]}, ${opsLayout.opsRanges.boids[1]}]`
      //   );
      //   lines.push("--------------------------------");
      //   console.log(lines.join("\n"));
      //   for (let i = 0; i < opsLayout.totalOps; i++) {
      //     const op = getActiveOperation(opsLayout.opsRanges, i);
      //     if (op) {
      //       const [key, range] = op;
      //       // compute index for inner
      //       const index = i - range[0];
      //       if (index >= 0 && index < range[1] - range[0]) {
      //         console.log(`${key}: ${index}`);
      //       }
      //     }
      //   }
      // }

      // Update each boid with only nearby boids (O(n) instead of O(n²))
      profiler.start(profilerKeywords.engine.updateBoids);
      for (const boid of iterateBoids(boidsStore.boids)) {
        profiler.start(profilerKeywords.boids.getNeighbors);
        const nearbyBoids = boidSpatialHash.getNearbyItems(
          boid.position,
          updateContext.config.world,
          updateContext.maxNeighborsLookup,
          updateContext.config.parameters.perceptionRadius // Only consider boids within perception radius
        );
        profiler.end(profilerKeywords.boids.getNeighbors);
        const nearbyFoodSources = foodSourceSpatialHash.getNearbyItems(
          boid.position,
          updateContext.config.world,
          updateContext.maxNeighborsLookup,
          FOOD_CONSTANTS.FOOD_EATING_RADIUS * 2
        );
        const nearbyObstacles = obstacleSpatialHash.getNearbyItems(
          boid.position,
          updateContext.config.world,
          updateContext.maxNeighborsLookup
        );
        const nearbyDeathMarkers = deathMarkerSpatialHash.getNearbyItems(
          boid.position,
          updateContext.config.world,
          updateContext.maxNeighborsLookup,
          initialConfig.parameters.perceptionRadius
        );
        const { nearbyPrey, nearbyPredators } = getNearbyBoidsByRole(
          boid,
          nearbyBoids
        );

        const boidUpdateContext = {
          ...updateContext,
          nearbyBoids,
          nearbyPrey,
          nearbyPredators,
          nearbyFoodSources,
          nearbyObstacles,
          nearbyDeathMarkers,
          forcesCollector,
        } satisfies BoidUpdateContext;

        profiler.start(profilerKeywords.engine.updateBoid);
        updateBoid(boid, boidUpdateContext);
        profiler.end(profilerKeywords.engine.updateBoid);

        // Update position history for motion trails (every 3rd frame for performance)
        profiler.start(profilerKeywords.engine.updateTrail);
        const speciesConfig = updateContext.config.species[boid.typeId];
        /**
         * Performance optimization
         * Distribute trail updates across 3 frames instead of 2
         * Each boid updates on its designated frame (i % 3 === frameCounter % 3)
         * This reduces trail update cost by 33% with minimal visual impact
         */
        const shouldUpdateTrail =
          boid.index % TAIL_STAGGER_FRAMES ===
          frameCounter % TAIL_STAGGER_FRAMES;
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
        profiler.end(profilerKeywords.engine.updateTrail);
        // if (frameCounter % 10 === 0) {
        //   profiler.start(profilerKeywords.boids.syncSharedMemory);
        //   queueSyncToSharedMemory({
        //     bufferViews: boidsPhysicsMemory.views,
        //     boids: boidsStore.boids,
        //   });
        //   profiler.end(profilerKeywords.boids.syncSharedMemory);
        // }
      }
      profiler.end(profilerKeywords.engine.updateBoids);

      // Session 76: Behavior evaluation at frame rate (30-60 Hz) with staggering
      profiler.start(profilerKeywords.behavior.evaluate);
      const currentFrame = time.getFrame();
      const boids = boidsStore.boids;
      const predators = getPredators(boids, updateContext.config.species);
      const prey = getPrey(boids, updateContext.config.species);

      for (const [boid, index] of iterateBoidsWithIndex(boids)) {
        // Staggered: each boid checks every 30 frames
        if (
          currentFrame % BEHAVIOR_STAGGER_FRAMES ===
          index % BEHAVIOR_STAGGER_FRAMES
        ) {
          evaluateBoidBehavior(
            boid,
            index,
            boids,
            predators,
            prey,
            updateContext.config,
            updateContext.simulation,
            currentFrame
          );
        }
      }
      profiler.end(profilerKeywords.behavior.evaluate);

      profiler.end(profilerKeywords.engine.update);
    };

    const { baseUpdateContext, baseBoidUpdateContext } =
      createBaseFrameUpdateContext({
        runtimeStore,
        time,
        boidsStore,
        sharedMemoryManager,
        deltaSeconds: 0,
        profiler,
        boidSpatialHash,
        foodSpatialHash: foodSourceSpatialHash,
        obstacleSpatialHash,
        deathMarkerSpatialHash,
        boidsCount: boidsStore.count(),
        forcesCollector,
      });
    const newUpdate = (deltaSeconds: number) => {
      profiler.start(profilerKeywords.engine.update);
      const { simulation, config } = runtimeStore.store.getState();
      frameCounter++;
      time.incrementFrame();
      const opsLayout = computeOpsLayout({
        deathMarkersCount: simulation.deathMarkers.length,
        obstaclesCount: simulation.obstacles.length,
        foodSourcesCount: simulation.foodSources.length,
        boidsCount: boidsStore.count(),
      });

      // Cleanup things
      boidSpatialHash.grid.clear();
      foodSourceSpatialHash.grid.clear();
      obstacleSpatialHash.grid.clear();
      deathMarkerSpatialHash.grid.clear();

      const localFrameUpdateContext = {
        ...baseUpdateContext,
        simulation: {
          obstacles: simulation.obstacles,
          deathMarkers: simulation.deathMarkers,
          foodSources: simulation.foodSources,
          tick: 0,
          frame: time.getFrame(),
        },
        config: {
          parameters: config.parameters,
          world: config.world,
          species: config.species,
        },
        deltaSeconds,
        boids: boidsStore.boids,
        scaledTime: deltaSeconds * 30,
        currentFrame: time.getFrame(),
      } satisfies FrameUpdateContext;
      const localBoidUpdateContext = {
        ...localFrameUpdateContext,
        nearbyBoids: baseBoidUpdateContext.nearbyBoids,
        nearbyPrey: baseBoidUpdateContext.nearbyPrey,
        nearbyPredators: baseBoidUpdateContext.nearbyPredators,
        nearbyFoodSources: baseBoidUpdateContext.nearbyFoodSources,
        nearbyObstacles: baseBoidUpdateContext.nearbyObstacles,
        nearbyDeathMarkers: baseBoidUpdateContext.nearbyDeathMarkers,
      } satisfies BoidUpdateContext;
      const operationsContext = {
        boidUpdateContext: localBoidUpdateContext,
        obstacleSpatialHash,
        deathMarkerSpatialHash,
        foodSourceSpatialHash,
        boidSpatialHash,
        boidsById: boidsStore.boids,
        forcesCollector,
        profiler,
        deathMarkers: simulation.deathMarkers,
        obstacles: simulation.obstacles,
        foodSources: simulation.foodSources,
        boidIds: Object.keys(boidsStore.boids),
        staggerFrames: {
          tail: TAIL_STAGGER_FRAMES,
          behavior: BEHAVIOR_STAGGER_FRAMES,
        },
        frameCounter: localFrameUpdateContext.currentFrame,
      } satisfies OperationContext;

      updateEngine(
        opsLayout,
        operationsContext,
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
            const index = boid.index;
            evaluateBoidBehavior(
              boid,
              index,
              boidsStore.boids,
              Object.values(context.nearbyPredators).map((p) => p.item),
              Object.values(context.nearbyPrey).map((p) => p.item),
              context.config,
              context.simulation,
              context.currentFrame
            );
          },
        }
      );
    };

    // Evaluate behavior for a single boid (Session 76: Frame-rate evaluation)
    const evaluateBoidBehavior = (
      boid: Boid,
      boidIndex: number,
      allBoids: BoidsById,
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

      const nearbyFlock: Boid[] = [];
      // iterator, zero allocations
      for (const b of iterateBoids(allBoids)) {
        if (
          b.typeId === boid.typeId &&
          b.id !== boid.id &&
          isWithinRadius(boid.position, b.position, parameters.perceptionRadius)
        ) {
          nearbyFlock.push(b);
        }
      }

      const populationRatio = boidsStore.count() / parameters.maxBoids;
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
            cfg.world.height
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
        boidsStore.addBoid(
          createBoid(
            currentPreyTypeIds,
            creationContext,
            0,
            boidsStore.nextIndex()
          )
        );
      }

      // Respawn predators (if any)
      for (let i = 0; i < (world.initialPredatorCount || 0); i++) {
        boidsStore.addBoid(
          createBoid(
            currentPredatorTypeIds,
            creationContext,
            0,
            boidsStore.nextIndex()
          )
        );
      }

      console.log(
        `[engine.reset] Respawned ${boidsStore.boids.length} boids (${currentPreyTypeIds.length} prey species, ${currentPredatorTypeIds.length} predator species)`
      );
    };

    const addBoid = (boid: Boid) => {
      const { config } = runtimeStore.store.getState();
      boidsStore.addBoid(boid);
      const speciesConfig = config.species[boid.typeId];
      if (speciesConfig) {
        const role = speciesConfig.role;
        baseBoidUpdateContext.boidsByRole[role].push(boid);
      }
    };

    const removeBoid = (boidId: string) => {
      const { config } = runtimeStore.store.getState();
      const boid = boidsStore.getBoidById(boidId);
      if (boid) {
        const speciesConfig = config.species[boid.typeId];
        if (speciesConfig) {
          const role = speciesConfig.role;
          const roleArray = baseBoidUpdateContext.boidsByRole[role];
          const index = roleArray.indexOf(boid);
          if (index !== -1) {
            roleArray.splice(index, 1);
          }
        }
        boidsStore.removeBoid(boidId);
      }
    };

    const getBoidById = (boidId: string) => {
      return boidsStore.getBoidById(boidId);
    };

    // const queuedUpdate = queue(
    //   (deltaSeconds: number) => {
    //     update(deltaSeconds);
    //   },
    //   {
    //     maxSize: 10,
    //     // wait: 1000 / 60,
    //     wait: 0,
    //   }
    // );

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
