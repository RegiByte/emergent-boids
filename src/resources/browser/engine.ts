import { createBoidOfType } from "@/boids/boid.ts";
import {
  createForceCollector,
  createLifecycleCollector,
} from "@/boids/collectors.ts";
import { fadeDeathMarkers } from "@/boids/deathMarkers.ts";
import { countBoidsByRole } from "@/boids/filters.ts";
import {
  canCreatePredatorFood,
  createPredatorFood,
  generatePreyFood,
} from "@/boids/foodManager.ts";
import { filterBoidsWhere } from "@/boids/iterators.ts";
import { canSpawnOffspring } from "@/boids/lifecycle/population.ts";
import type {
  AllEvents,
  CatchEvent,
} from "@/boids/vocabulary/schemas/events.ts";
import { LifecycleEvent } from "@/boids/vocabulary/schemas/events.ts";
import { Vector2 } from "@/boids/vocabulary/schemas/primitives.ts";
import {
  SimulationCommand,
  SimulationEvent,
} from "@/boids/vocabulary/schemas/simulation.ts";
import { SpeciesConfig } from "@/boids/vocabulary/schemas/species.ts";
import type {
  WorldConfig,
  WorldPhysics,
} from "@/boids/vocabulary/schemas/world.ts";
import { Channel } from "@/lib/channels.ts";
import { DomainRNG } from "@/lib/seededRandom.ts";
import {
  bufferViewIndexes,
  setActiveBufferIndex,
  SharedBoidViews,
} from "@/lib/sharedMemory.ts";
import { createSubscription } from "@/lib/state.ts";
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
  lifecycleKeywords,
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
  checkBoidLifecycle, computeOpsLayout,
  createBaseFrameUpdateContext,
  updateBoids,
  updateBoidSpatialHash,
  updateDeathMarkers,
  updateEngine,
  updateFoodSources,
  updateObstacles
} from "./engine/update.ts";
import {
  initializeBoidsStats,
  LocalBoidStore,
  LocalBoidStoreResource,
  syncBoidsToSharedMemory,
} from "./localBoidStore.ts";
import type { RuntimeStoreResource } from "./runtimeStore.ts";

export type BoidEngine = {
  initialize: (channel: Channel<SimulationCommand, SimulationEvent>) => void;
  update: (deltaSeconds: number) => void;
  reset: () => void;
  addBoid: (boid: Boid) => void;
  removeBoid: (boidId: string) => void;
  getBoidById: (boidId: string) => Boid | undefined;
  checkCatches: () => CatchEvent[];
  getBufferViews: () => SharedBoidViews;
  cleanup: () => void;
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
    frameRater: ReturnType<
      typeof import("../shared/frameRater").frameRater.start
    >;
  }) => {
    const { config: initialConfig } = runtimeStore.store.getState();
    const { world: initialWorld, species: initialSpecies } = initialConfig;

    const boidsStore = localBoidStore.store;
    // TODO: make the engine propagate events to the simulation channel
    // let simulationChannel: Channel<SimulationCommand, SimulationEvent> | null =
    //   null;

    const engineEventSubscription = createSubscription<AllEvents>();

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
    const lifecycleCollector = createLifecycleCollector()

    // Create throttled executors for periodic tasks (Session 117)
    const foodSpawnExecutor = frameRater.throttled("foodSpawning", {
      intervalMs: FOOD_CONSTANTS.PREY_FOOD_SPAWN_INTERVAL_TICKS * (1000 / 60), // Convert ticks to ms
    });
    const deathMarkerFadeExecutor = frameRater.throttled("deathMarkerFading", {
      intervalMs: 1000, // Fade every 1 second
    });

    // Tick counter for food source IDs
    let tickCounter = 0;

    const initialize = (_channel: Channel<SimulationCommand, SimulationEvent>) => {
      // Bind simulation channel so we can send events to it
      // simulationChannel = channel;
    };

    /**
     * Apply lifecycle events collected during the frame
     *
     * Processes deaths and reproductions in batch after all boids have been updated.
     * This ensures consistent state and proper population cap enforcement.
     *
     * Events are dispatched through the engine's event subscription (no circular dependency).
     */
    const applyLifecycleEvents = (events: LifecycleEvent[]) => {
      profiler.start("lifecycle.applyEvents");
      const { config } = runtimeStore.store.getState();
      const speciesTypes = config.species;

      // Phase 1: Process deaths FIRST (before reproductions)
      profiler.start("lifecycle.processDeaths");
      for (const event of events) {
        if (event.type === "lifecycle:death") {
          const boid = boidsStore.getBoidById(event.boidId);
          if (boid) {
            // Dispatch death event through engine's event subscription
            engineEventSubscription.notify({
              type: eventKeywords.boids.died,
              boidId: event.boidId,
              typeId: event.typeId,
              reason: event.reason,
            });
          }
          // Remove boid from engine
          removeBoid(event.boidId);
        }
      }
      profiler.end("lifecycle.processDeaths");

      // Phase 1.5: Process food consumption (deplete food sources)
      profiler.start("lifecycle.processFoodConsumption");
      const foodConsumptionMap = new Map<string, number>();
      for (const event of events) {
        if (event.type === lifecycleKeywords.events.foodConsumed) {
          const current = foodConsumptionMap.get(event.foodId) || 0;
          foodConsumptionMap.set(event.foodId, current + event.energyConsumed);
        }
      }

      if (foodConsumptionMap.size > 0) {
        const { simulation: currentSimulation } = runtimeStore.store.getState();
        const updatedFoodSources = currentSimulation.foodSources.map((food) => {
          const consumed = foodConsumptionMap.get(food.id);
          if (consumed) {
            return {
              ...food,
              energy: Math.max(0, food.energy - consumed),
            };
          }
          return food;
        });

        runtimeStore.store.setState({
          simulation: {
            ...currentSimulation,
            foodSources: updatedFoodSources,
          },
        });
      }
      profiler.end("lifecycle.processFoodConsumption");

      // Phase 2: Process reproductions (with population caps)
      profiler.start("lifecycle.processReproductions");
      const counts = countBoidsByRole(boidsStore.boids, speciesTypes);
      let currentPreyCount = counts.prey;
      let currentPredatorCount = counts.predator;

      for (const event of events) {
        if (event.type === "lifecycle:reproduction") {
          const offspring = event.offspring;
          const speciesConfig = speciesTypes[offspring.typeId];
          const offspringCount = speciesConfig.reproduction.offspringCount || 1;
          const energyBonus =
            speciesConfig.reproduction.offspringEnergyBonus || 0;

          // Get parent genomes for inheritance
          const parent1 = boidsStore.getBoidById(offspring.parent1Id);
          const parent2 = offspring.parent2Id
            ? boidsStore.getBoidById(offspring.parent2Id)
            : undefined;

          // Spawn multiple offspring if configured
          for (let i = 0; i < offspringCount; i++) {
            // Count current population of this specific type
            const currentTypeCount = filterBoidsWhere(
              boidsStore.boids,
              (b) => b.typeId === offspring.typeId
            ).length;

            const canSpawn = canSpawnOffspring(
              offspring.typeId,
              speciesTypes,
              {
                maxBoids: config.parameters.maxBoids,
                maxPreyBoids: config.parameters.maxPreyBoids,
                maxPredatorBoids: config.parameters.maxPredatorBoids,
              },
              {
                totalBoids: boidsStore.count(),
                totalPrey: currentPreyCount,
                totalPredators: currentPredatorCount,
              },
              currentTypeCount
            );

            if (canSpawn) {
              const { width, height } = config.world;
              const physics = config.physics || defaultWorldPhysics;
              const creationContext = {
                world: { width, height },
                species: speciesTypes,
                rng: randomness.domain("reproduction"),
                physics,
              };

              // Build parent genomes for inheritance (if parents exist)
              const parentGenomes =
                parent1 && parent1.genome
                  ? {
                      parent1: parent1.genome,
                      parent2: parent2?.genome,
                    }
                  : undefined;

              const result = createBoidOfType(
                offspring.position,
                offspring.typeId,
                creationContext,
                energyBonus,
                boidsStore.nextIndex(),
                parentGenomes
              );
              const newBoid = result.boid;
              addBoid(newBoid);
              // console.log("spawned offspring", {
              //   boidId: newBoid.id,
              //   parent1Id: offspring.parent1Id,
              //   parent2Id: offspring.parent2Id,
              //   typeId: offspring.typeId,
              //   offspringCount,
              //   energyBonus,
              //   frame: time.getFrame(),
              // });

              // Update counts
              if (speciesConfig.role === "prey") {
                currentPreyCount++;
              } else if (speciesConfig.role === "predator") {
                currentPredatorCount++;
              }

              // Dispatch reproduction event (only for first offspring to avoid spam)
              if (i === 0) {
                engineEventSubscription.notify({
                  type: eventKeywords.boids.reproduced,
                  parentId: offspring.parent1Id,
                  childId: newBoid.id,
                  typeId: offspring.typeId,
                  offspringCount,
                  ...(offspring.parent2Id && {
                    parent2Id: offspring.parent2Id,
                  }),
                });
              }
            }
          }
        }
      }
      profiler.end("lifecycle.processReproductions");
      profiler.end("lifecycle.applyEvents");
    };

    const update = (deltaSeconds: number) => {
      profiler.start(profilerKeywords.engine.update);
      const { simulation, config } = runtimeStore.store.getState();
      time.incrementFrame();

      // Create lifecycle collector for this frame
      const matedBoidsThisFrame = new Set<string>();

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
        lifecycleCollector,
        obstacleSpatialHash,
      });

      // Add lifecycle tracking to context
      updateContext.lifecycleCollector = lifecycleCollector;
      updateContext.matedBoidsThisFrame = matedBoidsThisFrame;

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
          checkBoidLifecycle: checkBoidLifecycle,
        }
      );

      // Apply lifecycle events collected during the frame
      profiler.start("lifecycle.apply");
      if (lifecycleCollector.items.length > 0) {
        applyLifecycleEvents(lifecycleCollector.items);
        lifecycleCollector.reset();
      }
      profiler.end("lifecycle.apply");

      // Periodic tasks (throttled)
      tickCounter++;

      // Spawn prey food periodically
      if (foodSpawnExecutor.shouldExecute(deltaSeconds * 1000)) {
        profiler.start("lifecycle.spawnFood");
        const { newFoodSources, shouldUpdate } = generatePreyFood(
          simulation.foodSources,
          config.world,
          tickCounter,
          randomness.domain("food"),
          time.now()
        );

        if (shouldUpdate) {
          runtimeStore.store.setState({
            simulation: {
              ...simulation,
              foodSources: [...simulation.foodSources, ...newFoodSources],
            },
          });

          // Dispatch events for each new food source
          for (const foodSource of newFoodSources) {
            engineEventSubscription.notify({
              type: eventKeywords.boids.foodSourceCreated,
              foodSource,
            });
          }
        }
        foodSpawnExecutor.recordExecution();
        profiler.end("lifecycle.spawnFood");
      }

      // Fade death markers periodically
      if (deathMarkerFadeExecutor.shouldExecute(deltaSeconds * 1000)) {
        profiler.start("lifecycle.fadeMarkers");
        const { markers: updatedMarkers, shouldUpdate } = fadeDeathMarkers(
          simulation.deathMarkers
        );

        if (shouldUpdate) {
          runtimeStore.store.setState({
            simulation: {
              ...simulation,
              deathMarkers: updatedMarkers,
            },
          });
        }
        deathMarkerFadeExecutor.recordExecution();
        profiler.end("lifecycle.fadeMarkers");
      }

      // Remove exhausted food sources (every frame, cheap check)
      profiler.start("lifecycle.cleanupFood");
      const activeFoodSources = simulation.foodSources.filter(
        (food) => food.energy > 0
      );
      if (activeFoodSources.length !== simulation.foodSources.length) {
        runtimeStore.store.setState({
          simulation: {
            ...simulation,
            foodSources: activeFoodSources,
          },
        });
      }
      profiler.end("lifecycle.cleanupFood");

      // Check for catches and create predator food (every frame)
      profiler.start("lifecycle.catches");
      const catches = checkCatches();
      if (catches.length > 0) {
        const newFoodFromCatches: FoodSource[] = [];
        const currentFoodSources =
          runtimeStore.store.getState().simulation.foodSources;
        const allFood = [...currentFoodSources];

        for (const catchEvent of catches) {
          // Check if we can create more predator food
          if (canCreatePredatorFood(allFood)) {
            const foodSource = createPredatorFood(
              catchEvent.preyEnergy,
              catchEvent.preyPosition,
              tickCounter,
              randomness.domain("food"),
              time.now()
            );
            newFoodFromCatches.push(foodSource);
            allFood.push(foodSource);

            // Dispatch food created event
            engineEventSubscription.notify({
              type: eventKeywords.boids.foodSourceCreated,
              foodSource,
            });
          }

          // Dispatch catch event
          engineEventSubscription.notify(catchEvent);
        }

        // Add new food sources
        if (newFoodFromCatches.length > 0) {
          const currentSimulation = runtimeStore.store.getState().simulation;
          runtimeStore.store.setState({
            simulation: {
              ...currentSimulation,
              foodSources: allFood,
            },
          });
        }
      }
      profiler.end("lifecycle.catches");
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
                parameters.chaseRadius
              )
            )
          : [];

      const nearbyFlock: ItemWithDistance<Boid>[] = [];
      const boidsToCheck =
        role === roleKeywords.predator ? nearbyPredators : nearbyPrey;

      for (const nearbyBoid of boidsToCheck) {
        if (
          nearbyBoid.item.typeId === boid.typeId && // same species
          nearbyBoid.item.id !== boid.id // not self
        ) {
          nearbyFlock.push(nearbyBoid);
        }
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
          profiler
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
        if (predator.attackCooldownFrames > 0) continue;

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

            const knockbackDirection = vec.toroidalSubtract(
              preyBoid.position,
              predator.position,
              cfg.world.width,
              cfg.world.height
            );
            const pushDist = vec.magnitude(knockbackDirection);
            if (pushDist > 0) {
              // Normalize the direction
              const nx = knockbackDirection.x / pushDist;
              const ny = knockbackDirection.y / pushDist;

              // Knockback strength scales with
              // - Attack damage (harder hits push harder)
              // - Size ratio (bigger predators push smaller prey further)
              // - Minimum separation should be sum of their radii
              const sizeRatio =
                predator.phenotype.baseSize / preyBoid.phenotype.baseSize;
              const baseKnockback = predator.phenotype.maxSpeed * 1.5; // slightly faster than predator
              const damageMultipler =
                1 + (damage / preyBoid.phenotype.maxHealth) * 3; // up to 3x
              const knockbackStrength =
                baseKnockback * damageMultipler * sizeRatio;

              // console.log("knocking back prey", {
              //   knockbackStrength,
              //   nx,
              //   ny,
              //   sizeRatio,
              //   baseKnockback,
              //   damageMultipler,
              // });

              // Apply velocity override (not addition) to avoid immediate clamping
              // This temporarily allows prey to exceed maxSpeed, giving them escape momentum
              // preyBoid.velocity.x = nx * knockbackStrength;
              // preyBoid.velocity.y = ny * knockbackStrength;
              preyBoid.knockbackVelocity = {
                x: nx * knockbackStrength,
                y: ny * knockbackStrength,
              };
              preyBoid.knockbackFramesRemaining = 3;
            }

            // Knockback: Push prey away from predator (gives escape chance)
            // const knockbackStrength = 40;
            // const dx = preyBoid.position.x - predator.position.x;
            // const dy = preyBoid.position.y - predator.position.y;
            // const pushDist = Math.sqrt(dx * dx + dy * dy);
            // if (pushDist > 0) {
            //   const nx = dx / pushDist;
            //   const ny = dy / pushDist;
            //   preyBoid.velocity.x += nx * knockbackStrength;
            //   preyBoid.velocity.y += ny * knockbackStrength;
            // }

            // Set attack cooldown (prevents spam attacks)
            predator.attackCooldownFrames = parameters.attackCooldownFrames;

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

    const api = {
      initialize,
      update: update,
      cleanup: () => {
        engineEventSubscription.clear();
      },
      reset,
      addBoid,
      removeBoid,
      getBoidById,
      checkCatches,
      getBufferViews: () => boidsPhysicsMemory.views,
    } satisfies BoidEngine;

    return api;
  },
  halt: ({ cleanup }) => {
    cleanup();
  },
});
