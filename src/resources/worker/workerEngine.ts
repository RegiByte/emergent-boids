import { getMaxCrowdTolerance } from "@/boids/affinity";
import {
  applyBehaviorDecision,
  buildBehaviorContext,
  evaluateBehavior,
} from "@/boids/behavior/evaluator";
import {
  createBehaviorRuleset,
  MINIMUM_STANCE_DURATION_FRAMES,
} from "@/boids/behavior/rules";
import { createBoidOfType, updateBoid } from "@/boids/boid";
import { createEventCollector, createForceCollector } from "@/boids/collectors";
import { BoidUpdateContext, EngineUpdateContext } from "@/boids/context";
import { defaultWorldPhysics } from "@/boids/defaultPhysics";
import { getBoidsByRole } from "@/boids/filters";
import { FOOD_CONSTANTS } from "@/boids/food";
import { isDead } from "@/boids/lifecycle/health";
import { canSpawnOffspring } from "@/boids/lifecycle/population";
import { isReadyToMate } from "@/boids/predicates";
import { createSpatialHash, ItemWithDistance } from "@/boids/spatialHash";
import { eventKeywords, lifecycleKeywords, profilerKeywords, simulationKeywords } from "@/boids/vocabulary/keywords";
import * as vec from "@/boids/vector";
import {
  Boid,
  DeathMarker,
  FoodSource,
  Obstacle,
} from "@/boids/vocabulary/schemas/entities";
import { CatchEvent, LifecycleEvent } from "@/boids/vocabulary/schemas/events";
import {
  SharedBoidBufferLayout,
  StatsIndex,
  swapBuffers,
} from "@/lib/sharedMemory";
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
import { iterateBoids } from "@/boids/iterators";
import { FrameRaterAPI } from "../shared/frameRater";

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
    "workerFrameRater",
  ],
  start: ({
    workerStore,
    workerProfiler,
    workerTime,
    workerRandomness,
    workerFrameRater,
  }: {
    workerStore: WorkerStoreResource;
    workerProfiler: Profiler;
    workerTime: TimeAPI;
    workerRandomness: RandomnessResource;
    workerFrameRater: FrameRaterAPI;
  }) => {
    const boidsStore = workerStore.boids;

    let simulationChannel: Channel<SimulationCommand, SimulationEvent> | null =
      null;

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
    
    // Session 121: Create behavior ruleset for stance evaluation
    const behaviorRuleset = createBehaviorRuleset();

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
        FOOD_CONSTANTS.FOOD_DETECTION_RADIUS // Session 123: Use detection radius for proper food sensing!
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
    const lifecycleCollector = createEventCollector<LifecycleEvent>();
    const timePassedRater = workerFrameRater.throttled("timePassed", {
      intervalMs: 1000,
    });
    let lastTimePassed = 0;

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

      workerProfiler.start(profilerKeywords.engine.update);

      // Increment frame counter
      workerTime.incrementFrame();
      const currentFrame = workerTime.getFrame();

      // Get current config from store
      const state = workerStore.getState();
      const config = state.config;
      const boids = boidsStore.getBoids();
      const simulation = state.simulation;

      // Create lifecycle collector for this frame (Session 119)
      const matedBoidsThisFrame = new Set<string>();

      // Session 124: Population tracking (removed logging for performance)

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
          behavior: 20, // Session 122: Behavior checks every 20 frames
          lifecycle: 2, // Session 128: Lifecycle checks every 25 frames (restored after finding real bug)
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

            // Session 122: Cooldowns MUST tick every frame for responsiveness
            // But we need to make sure checkBoidLifecycle doesn't ALSO reduce them
            // Solution: Only reduce here, remove from checkBoidLifecycle
            if (boid.attackCooldownFrames > 0) {
              boid.attackCooldownFrames--;
            }
            if (boid.eatingCooldownFrames > 0) {
              boid.eatingCooldownFrames--;
            }
            if (boid.reproductionCooldown > 0) {
              boid.reproductionCooldown--;
              
              // Session 128: CRITICAL - Update seekingMate flag when cooldown reaches 0
              // Without this, boids reproduce once then never again!
              if (boid.reproductionCooldown === 0) {
                const speciesConfig = config.species[boid.typeId];
                if (speciesConfig) {
                  boid.seekingMate = isReadyToMate(boid, config.parameters, speciesConfig);
                }
              }
            }
            if (boid.knockbackFramesRemaining > 0) {
              boid.knockbackFramesRemaining--;
            }
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
          evaluateBoidBehavior: (boid: Boid, context: BoidUpdateContext) => {
            // Session 121: Full behavior evaluation (ported from browser engine)
            // This handles ALL behaviors: eating, fleeing, hunting, mating, flocking
            const speciesConfig = config.species[boid.typeId];
            if (!speciesConfig) return;

            const role = speciesConfig.role;
            const parameters = config.parameters;

            // Gather nearby entities for behavior evaluation
            const nearbyPredators = role === "prey"
              ? context.nearbyPredators.filter((p) => {
                  const fearRadius = speciesConfig.limits.fearRadius ?? parameters.fearRadius;
                  return p.distance < fearRadius;
                })
              : [];

            const nearbyPrey = role === "predator"
              ? context.nearbyPrey.filter((p) => p.distance < parameters.chaseRadius)
              : [];

            // Find nearby flock (same species)
            const nearbyFlock: ItemWithDistance<Boid>[] = [];
            const boidsToCheck = role === "predator" ? context.nearbyPredators : context.nearbyPrey;
            
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

            // Build behavior context
            const behaviorContext = buildBehaviorContext(boid, speciesConfig, {
              frame: currentFrame,
              populationRatio,
              readyToMate,
              nearbyPredators,
              nearbyPrey,
              nearbyFood: context.nearbyFoodSources,
              nearbyFlock,
            });

            // Evaluate behavior using ruleset
            const decision = evaluateBehavior(behaviorContext, behaviorRuleset, role);

            if (decision) {
              applyBehaviorDecision(
                boid,
                decision,
                currentFrame,
                MINIMUM_STANCE_DURATION_FRAMES,
                workerProfiler
              );
            }

            // Session 120/121: Predator attack logic (after stance evaluation)
            if (speciesConfig.role === "predator" && boid.attackCooldownFrames === 0) {
              for (const { item: potentialPrey, distance } of context.nearbyPrey) {
                if (distance < config.parameters.catchRadius) {
                  // Attack! Deal damage
                  const damage = boid.phenotype.attackDamage;
                  potentialPrey.health -= damage;

                  // Apply knockback
                  const knockbackDirection = vec.toroidalSubtract(
                    potentialPrey.position,
                    boid.position,
                    config.world.width,
                    config.world.height
                  );
                  const pushDist = vec.magnitude(knockbackDirection);
                  if (pushDist > 0) {
                    const nx = knockbackDirection.x / pushDist;
                    const ny = knockbackDirection.y / pushDist;
                    const sizeRatio = boid.phenotype.baseSize / potentialPrey.phenotype.baseSize;
                    const baseKnockback = boid.phenotype.maxSpeed * 2.2;
                    const damageMultiplier = 1 + (damage / potentialPrey.phenotype.maxHealth) * 3;
                    const knockbackStrength = baseKnockback * damageMultiplier * sizeRatio;

                    potentialPrey.knockbackVelocity = {
                      x: nx * knockbackStrength,
                      y: ny * knockbackStrength,
                    };
                    potentialPrey.knockbackFramesRemaining = 3;
                  }

                  // Set attack cooldown
                  boid.attackCooldownFrames = config.parameters.attackCooldownFrames;

                  // Check if prey died from attack
                  if (isDead(potentialPrey)) {
                    lifecycleCollector.collect({
                      type: lifecycleKeywords.events.death,
                      boidId: potentialPrey.id,
                      typeId: potentialPrey.typeId,
                      reason: "predation",
                    });
                  }

                  break; // One attack per frame
                }
              }
            }
          },
          // Session 119: Enable lifecycle checks (matches browser engine pattern)
          checkBoidLifecycle: checkBoidLifecycle,
        }
      );

      // Apply lifecycle events collected during the frame (Session 119 + 120)
      workerProfiler.start("lifecycle.apply");
      
      // Session 121/125: Declare these outside the if block so food management can access them
      const deathData: Array<{
        id: string;
        typeId: string;
        reason: "old_age" | "starvation" | "predation";
        position: { x: number; y: number };
      }> = [];

      const catchData: Array<{
        predatorId: string;
        preyId: string;
        preyTypeId: string;
        position: { x: number; y: number };
      }> = [];
      
      // Session 125: Food consumption events (needs to be in outer scope for later processing)
      let foodConsumptionEvents: Array<{
        type: typeof lifecycleKeywords.events.foodConsumed;
        foodId: string;
        energyConsumed: number;
      }> = [];
      
      if (lifecycleCollector.items.length > 0) {
        // Process deaths FIRST (remove boids from worker)
        for (const event of lifecycleCollector.items) {
          if (event.type === lifecycleKeywords.events.death) {
            // Get boid data BEFORE removal
            const boid = boidsStore.getBoidById(event.boidId);
            if (boid) {
              deathData.push({
                id: event.boidId,
                typeId: event.typeId,
                reason: event.reason,
                position: { x: boid.position.x, y: boid.position.y },
              });

              // Session 120: If death by predation, we need to emit a catch event too
              // Find which predator killed this prey (check attack cooldowns)
              if (event.reason === "predation") {
                // Find predator that just attacked (has attack cooldown active)
                const predator = Object.values(boids).find(b =>
                  config.species[b.typeId]?.role === "predator" &&
                  b.attackCooldownFrames === config.parameters.attackCooldownFrames
                );

                if (predator) {
                  catchData.push({
                    predatorId: predator.id,
                    preyId: event.boidId,
                    preyTypeId: event.typeId,
                    position: { x: boid.position.x, y: boid.position.y },
                  });
                }
              }
            }

            // Remove boid from worker store
            boidsStore.removeBoid(event.boidId);
          }
        }

        // Notify browser with batched death event
        if (deathData.length > 0) {
          // Deaths processed (Session 124)
          simulationChannel?.out.notify({
            type: simulationKeywords.events.boidsDied,
            boids: deathData,
          });

          // Session 128: Create death markers for non-predation deaths
          // Death markers are only created for starvation and old age (not predation)
          // This creates "danger zones" that prey learn to avoid
          const newMarkers: DeathMarker[] = [];
          const CONSOLIDATION_RADIUS = 100; // Merge deaths within this radius
          const MAX_LIFETIME_FRAMES = 600; // 20 seconds at 30 UPS

          for (const death of deathData) {
            // Skip predation deaths (no marker)
            if (death.reason === "predation") continue;

            // Check for nearby existing markers to consolidate
            const existingMarkers = simulation.deathMarkers;
            let consolidated = false;

            for (const marker of existingMarkers) {
              const dx = death.position.x - marker.position.x;
              const dy = death.position.y - marker.position.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              if (distance < CONSOLIDATION_RADIUS && marker.typeId === death.typeId) {
                // Strengthen existing marker instead of creating new one
                marker.strength = Math.min(5.0, marker.strength + 0.5);
                marker.remainingFrames = MAX_LIFETIME_FRAMES; // Reset lifetime
                consolidated = true;
                break;
              }
            }

            // Create new marker if no consolidation happened
            if (!consolidated) {
              newMarkers.push({
                id: `death-${currentFrame}-${death.id}`,
                position: { x: death.position.x, y: death.position.y },
                remainingFrames: MAX_LIFETIME_FRAMES,
                strength: 1.0, // Initial strength
                maxLifetimeFrames: MAX_LIFETIME_FRAMES,
                typeId: death.typeId,
              });
            }
          }

          // Add new markers to worker store
          if (newMarkers.length > 0) {
            workerStore.updateState((state) => ({
              ...state,
              simulation: {
                ...state.simulation,
                deathMarkers: [...state.simulation.deathMarkers, ...newMarkers],
              },
            }));

            // Notify browser
            simulationChannel?.out.notify({
              type: simulationKeywords.events.deathMarkersAdded,
              markers: newMarkers,
            });
          }
        }

        // Notify browser with batched catch event (Session 120)
        if (catchData.length > 0) {
          simulationChannel?.out.notify({
            type: simulationKeywords.events.boidsCaught,
            catches: catchData,
          });
        }

        // Process reproductions (spawn boids in worker)
        // Session 121: Added population cap enforcement
        const boidsByRole = getBoidsByRole(boids, config.species);
        const currentPreyCount = boidsByRole.prey.length;
        const currentPredatorCount = boidsByRole.predator.length;
        
        for (const event of lifecycleCollector.items) {
          if (event.type === lifecycleKeywords.events.reproduction) {
            const offspring = event.offspring;
            const speciesConfig = config.species[offspring.typeId];

            if (speciesConfig) {
              // Session 123: Count current population of this specific type for per-species cap
              let currentTypeCount = 0;
              for (const boid of iterateBoids(boids)) {
                if (boid.typeId === offspring.typeId) {
                  currentTypeCount++;
                }
              }
              
              // Session 121: Check population caps BEFORE spawning
              const canSpawn = canSpawnOffspring(
                offspring.typeId,
                config.species,
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
                currentTypeCount // Session 123: Fixed - was hardcoded to 0, per-species caps were never enforced!
              );

              if (!canSpawn) {
                // Population cap reached, skip reproduction
                continue;
              }

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

                // Offspring spawned (Session 124)

                // Notify browser with the actual spawned boid and mutation metadata
                simulationChannel?.out.notify({
                  type: simulationKeywords.events.boidsReproduced,
                  boids: [
                    {
                      parentId1: offspring.parent1Id,
                      parentId2: offspring.parent2Id,
                      offspring: [result.boid],
                      // Session 124: Include mutation data for analytics
                      // Convert boolean flags to counts (1 or 0)
                      mutations: result.mutationMetadata ? {
                        traitMutations: result.mutationMetadata.hadTraitMutation ? 1 : 0,
                        colorMutations: result.mutationMetadata.hadColorMutation ? 1 : 0,
                        bodyPartMutations: result.mutationMetadata.hadBodyPartMutation ? 1 : 0,
                      } : undefined,
                    },
                  ],
                });
              }
            }
          }
        }

        // Session 125: Process food consumption events (CRITICAL FIX!)
        // Collect consumption events and store for later processing
        foodConsumptionEvents = lifecycleCollector.items.filter(
          event => event.type === lifecycleKeywords.events.foodConsumed
        ) as typeof foodConsumptionEvents;

        lifecycleCollector.reset();
      }
      workerProfiler.end("lifecycle.apply");

      // Session 121: Food management (CRITICAL - was missing!)
      // This handles prey food spawning, predator food from catches, and food cleanup
      workerProfiler.start("lifecycle.foodManagement");
      
      // 1. Spawn prey food periodically
      if (currentFrame % 90 === 0) { // Every 3 seconds at 30 FPS
        const foodState = workerStore.getState();
        const { simulation: foodSimulation } = foodState;
        
        // Count existing prey food
        const preyFoodCount = foodSimulation.foodSources.filter(f => f.sourceType === "prey").length;
        
        // Spawn if below cap
        if (preyFoodCount < 15) { // MAX_PREY_FOOD_SOURCES
          const toSpawn = Math.min(5, 15 - preyFoodCount); // Spawn 5, max cap 15
          const newFoodSources: FoodSource[] = [];
          
          for (let i = 0; i < toSpawn; i++) {
            const rng = workerRandomness.domain("food");
            newFoodSources.push({
              id: `food-prey-${workerTime.now()}-${Math.floor(rng.next() * 1000000)}-${i}`,
              position: {
                x: rng.range(0, config.world.width),
                y: rng.range(0, config.world.height),
              },
              energy: 80, // PREY_FOOD_INITIAL_ENERGY
              maxEnergy: 80,
              sourceType: "prey",
              createdFrame: currentFrame,
            });
          }
          
          if (newFoodSources.length > 0) {
            workerStore.setState({
              ...foodState,
              simulation: {
                ...foodSimulation,
                foodSources: [...foodSimulation.foodSources, ...newFoodSources],
              },
            });
            
            // Notify browser
            simulationChannel?.out.notify({
              type: simulationKeywords.events.foodSourcesCreated,
              foodSources: newFoodSources,
            });
          }
        }
      }
      
      // 2. Create predator food from catches
      if (catchData.length > 0) {
        const predatorFoodState = workerStore.getState();
        const { simulation: predatorFoodSimulation } = predatorFoodState;
        const predatorFoodCount = predatorFoodSimulation.foodSources.filter(f => f.sourceType === "predator").length;
        const newPredatorFood: FoodSource[] = [];
        
        for (const catchEvent of catchData) {
          // Check if we can create more predator food
          if (predatorFoodCount + newPredatorFood.length < 25) { // MAX_PREDATOR_FOOD_SOURCES
            const rng = workerRandomness.domain("food");
            const preyBoid = deathData.find((d: { id: string }) => d.id === catchEvent.preyId);
            
            if (preyBoid) {
              // Assume prey had ~50 energy remaining (rough estimate)
              const foodEnergy = 50 * 0.8; // 80% of prey energy
              
              newPredatorFood.push({
                id: `food-predator-${workerTime.now()}-${Math.floor(rng.next() * 1000000)}`,
                position: catchEvent.position,
                energy: foodEnergy,
                maxEnergy: foodEnergy,
                sourceType: "predator",
                createdFrame: currentFrame,
              });
            }
          }
        }
        
        if (newPredatorFood.length > 0) {
          workerStore.setState({
            ...predatorFoodState,
            simulation: {
              ...predatorFoodSimulation,
              foodSources: [...predatorFoodSimulation.foodSources, ...newPredatorFood],
            },
          });
          
          // Notify browser
          simulationChannel?.out.notify({
            type: simulationKeywords.events.foodSourcesCreated,
            foodSources: newPredatorFood,
          });
        }
      }
      
      // 3. Process food consumption and clean up exhausted sources (Session 125: CRITICAL FIX!)
      if (foodConsumptionEvents.length > 0) {
        const cleanupState = workerStore.getState();
        const { simulation: cleanupSimulation } = cleanupState;
        
        // Group consumption by food ID
        const consumptionByFood = new Map<string, number>();
        for (const event of foodConsumptionEvents) {
          if (event.type === lifecycleKeywords.events.foodConsumed) {
            const current = consumptionByFood.get(event.foodId) || 0;
            consumptionByFood.set(event.foodId, current + event.energyConsumed);
          }
        }
        
        // Update food energy and track exhausted sources + changes for browser
        const exhaustedFoodIds: string[] = [];
        const changedFoodSources: FoodSource[] = []; // Session 125: Track changed foods for browser update
        
        const updatedFoodSources = cleanupSimulation.foodSources
          .map(food => {
            const consumed = consumptionByFood.get(food.id);
            if (consumed) {
              const newEnergy = Math.max(0, food.energy - consumed);
              // Food energy updated (Session 125)
              
              const updatedFood = { ...food, energy: newEnergy };
              
              // Track if this food source is exhausted
              if (newEnergy <= 0) {
                exhaustedFoodIds.push(food.id);
                // Food exhausted and will be removed (Session 125)
              } else {
                // Only send updates for food sources that still exist (not exhausted)
                changedFoodSources.push(updatedFood);
              }
              
              return updatedFood;
            }
            return food;
          })
          .filter(food => food.energy > 0); // Remove exhausted food sources
        
        // Update state with consumed/filtered food sources
        workerStore.setState({
          ...cleanupState,
          simulation: {
            ...cleanupSimulation,
            foodSources: updatedFoodSources,
          },
        });
        
        // Session 125: Notify browser about food source updates (for visual shrinking)
        if (changedFoodSources.length > 0) {
          simulationChannel?.out.notify({
            type: simulationKeywords.events.foodSourcesUpdated,
            foodSources: changedFoodSources,
          });
        }
        
        // Notify browser about exhausted food sources (Session 125: CRITICAL!)
        // Use "batch-consumption" as boidId since multiple boids may have consumed
        if (exhaustedFoodIds.length > 0) {
          for (const foodId of exhaustedFoodIds) {
            simulationChannel?.out.notify({
              type: simulationKeywords.events.foodSourceConsumed,
              foodSourceId: foodId,
              boidId: "batch-consumption", // Placeholder since multiple boids consumed
            });
          }
        }
      }
      
      workerProfiler.end("lifecycle.foodManagement");

      // Session 128: Death marker decay (fade over time)
      // Markers lose 1 frame per update and are removed when depleted
      workerProfiler.start("lifecycle.deathMarkerDecay");
      const currentSimulation = workerStore.getState().simulation;
      const updatedMarkers: DeathMarker[] = [];
      const expiredMarkerIds: string[] = [];
      
      for (const marker of currentSimulation.deathMarkers) {
        const remainingFrames = marker.remainingFrames - 1;
        
        if (remainingFrames <= 0) {
          expiredMarkerIds.push(marker.id);
        } else {
          updatedMarkers.push({
            ...marker,
            remainingFrames,
          });
        }
      }
      
      // Update worker store with decayed markers
      if (expiredMarkerIds.length > 0 || updatedMarkers.length !== currentSimulation.deathMarkers.length) {
        workerStore.updateState((state) => ({
          ...state,
          simulation: {
            ...state.simulation,
            deathMarkers: updatedMarkers,
          },
        }));
        
        // Notify browser with updated markers
        if (updatedMarkers.length > 0) {
          simulationChannel?.out.notify({
            type: simulationKeywords.events.deathMarkersUpdated,
            markers: updatedMarkers,
          });
        }
      }
      workerProfiler.end("lifecycle.deathMarkerDecay");

      // Sync updated positions/velocities to SharedArrayBuffer
      workerProfiler.start("sync.toSharedMemory");
      boidsStore.syncToSharedMemory();
      workerProfiler.end("sync.toSharedMemory");

      // Swap buffers so main thread sees updated data
      swapBuffers(bufferViews);

      // Session 124: Advance worker time by frame delta
      // Using update() which advances simulation time based on delta
      workerTime.update(deltaSeconds * 1000);

      // Update stats in SharedArrayBuffer for browser to read
      const frame = Atomics.load(bufferViews.stats, StatsIndex.FRAME_COUNT) + 1;
      Atomics.store(bufferViews.stats, StatsIndex.FRAME_COUNT, frame);
      // Session 124: Store simulation time for browser sync
      Atomics.store(
        bufferViews.stats,
        StatsIndex.SIMULATION_TIME_MS,
        Math.floor(workerTime.now())
      );

      if (timePassedRater.shouldExecute(deltaSeconds * 1000)) {
        const currentAccumulatedTime = timePassedRater.getMetrics().accumulatedTime;
        const timeDelta = currentAccumulatedTime - lastTimePassed;
        lastTimePassed = currentAccumulatedTime;
        
        simulationChannel?.out.notify({
          type: eventKeywords.time.passed,
          deltaMs: timeDelta, // Session 124: Send delta since last event, not total
        });
        timePassedRater.recordExecution();
      }

      workerProfiler.end(profilerKeywords.engine.update);
    };

    /**
     * Spawn an obstacle at the specified position
     * Session 127: User-triggered obstacle spawning
     */
    const spawnObstacle = (position: { x: number; y: number }, radius: number) => {
      const currentState = workerStore.getState();
      const newObstacle = {
        id: `obstacle-${workerTime.now()}-${Math.floor(Math.random() * 1000000)}`,
        position,
        radius,
      };
      
      workerStore.setState({
        ...currentState,
        simulation: {
          ...currentState.simulation,
          obstacles: [...currentState.simulation.obstacles, newObstacle],
        },
      });
      
      console.log("[WorkerEngine] Spawned obstacle:", newObstacle);
      
      // Notify browser so it can update its local store
      simulationChannel?.out.notify({
        type: simulationKeywords.events.obstaclesAdded,
        obstacles: [newObstacle],
      });
    };

    /**
     * Spawn a predator at the specified position
     * Session 127: User-triggered predator spawning
     */
    const spawnPredator = (position: { x: number; y: number }) => {
      const currentState = workerStore.getState();
      const { config } = currentState;
      const { species } = config;
      
      // Find predator type IDs
      const predatorTypeIds = Object.keys(species).filter(
        (id) => species[id].role === "predator"
      );
      
      if (predatorTypeIds.length === 0) {
        console.warn("[WorkerEngine] No predator species configured!");
        return;
      }
      
      // Create predator boid
      const physics = config.physics || defaultWorldPhysics;
      const creationContext = {
        world: { width: config.world.width, height: config.world.height },
        species,
        rng: workerRandomness.domain("spawning"),
        physics,
      };
      
      const result = createBoidOfType(
        position,
        predatorTypeIds[0], // Use first predator type
        creationContext,
        0, // No energy bonus
        boidsStore.nextIndex(),
        undefined // No parents
      );
      
      boidsStore.addBoid(result.boid);
      
      console.log("[WorkerEngine] Spawned predator:", result.boid.id);
      
      // Notify browser (so it can update its local store too)
      simulationChannel?.out.notify({
        type: simulationKeywords.events.boidsSpawned,
        boids: [result.boid],
      });
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
      spawnObstacle, // Session 127: New method
      spawnPredator, // Session 127: New method
      clearDeathMarkers: () => {
        // Session 128: Clear all death markers from worker store
        const currentState = workerStore.getState();
        workerStore.setState({
          ...currentState,
          simulation: {
            ...currentState.simulation,
            deathMarkers: [],
          },
        });
        
        console.log("[WorkerEngine] Cleared all death markers");
        
        // Notify browser
        simulationChannel?.out.notify({
          type: simulationKeywords.events.deathMarkersUpdated,
          markers: [],
        });
      },
      cleanup: () => {
        simulationChannel?.clear();
      },
      attach,
    } satisfies BoidEngine & {
      attach: typeof attach;
      spawnObstacle: (position: { x: number; y: number }, radius: number) => void;
      spawnPredator: (position: { x: number; y: number }) => void;
      clearDeathMarkers: () => void;
    };

    return api;
  },
  halt: () => {},
});

export type WorkerEngineResource = StartedResource<typeof workerEngine>;

