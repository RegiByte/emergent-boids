// import { defineResource, StartedResource } from "braided";
// import type { BoidEngine } from "./engine.ts";
// import type { RuntimeController } from "./runtimeController.ts";
// import type { RuntimeStoreResource } from "./runtimeStore.ts";
// import type { TimerManager } from "../shared/timer.ts";
// import type { TimeResource } from "../shared/time.ts";
// import { eventKeywords } from "../../boids/vocabulary/keywords.ts";
// import type { Profiler } from "../shared/profiler.ts";
// import { createBoidOfType } from "../../boids/boid.ts";
// import type {
//   BoidUpdateContext,
//   LifecycleUpdateContext,
// } from "../../boids/context.ts";
// import { countBoidsByRole, getBoidsByRole } from "../../boids/filters.ts";
// import {
//   LifecycleUpdates,
//   processLifecycleUpdates,
// } from "../../boids/lifecycle/orchestration.ts";
// import { canSpawnOffspring } from "../../boids/lifecycle/population.ts";
// import { FOOD_CONSTANTS } from "../../boids/food.ts";
// import {
//   createPredatorFood,
//   canCreatePredatorFood,
//   generatePreyFood,
//   processFoodConsumption,
//   applyEnergyGains,
//   haveFoodSourcesChanged,
// } from "../../boids/foodManager.ts";
// import {
//   processDeathMarkers,
//   fadeDeathMarkers,
// } from "../../boids/deathMarkers.ts";
// import { RandomnessResource } from "../shared/randomness.ts";
// import { LocalBoidStoreResource } from "./localBoidStore.ts";
// import {
//   filterBoidsWhere,
//   findBoidWhere,
//   iterateBoids,
// } from "@/boids/iterators.ts";
// import { queue } from "@tanstack/pacer";
// import { createForceCollector } from "@/boids/collectors.ts";

// /**
//  * Lifecycle Manager
//  *
//  * Manages the full lifecycle of boids:
//  * - Energy updates (gain/loss)
//  * - Aging and death (old age, starvation)
//  * - Stance updates (behavioral states)
//  * - Reproduction (mate-seeking, pairing, offspring)
//  * - Population management (caps, culling)
//  * - Predator spawning (user-triggered)
//  */
// export const lifecycleManager = defineResource({
//   dependencies: [
//     "engine",
//     "runtimeController",
//     "runtimeStore",
//     "profiler",
//     "randomness",
//     "timer",
//     "time",
//     "localBoidStore",
//   ],
//   start: ({
//     engine,
//     runtimeController,
//     runtimeStore,
//     profiler,
//     randomness,
//     timer,
//     time,
//     localBoidStore,
//   }: {
//     engine: BoidEngine;
//     runtimeController: RuntimeController;
//     runtimeStore: RuntimeStoreResource;
//     profiler: Profiler;
//     randomness: RandomnessResource;
//     timer: TimerManager;
//     time: TimeResource;
//     localBoidStore: LocalBoidStoreResource;
//   }) => {
//     const store = runtimeStore.store;
//     const boidStore = localBoidStore.store;
//     // Tick counter for periodic events
//     let tickCounter = 0;

//     const lifecycleRng = randomness.domain("lifecycle");

//     // Evolution tracking (temporary for debugging)
//     let totalOffspring = 0;
//     const generationStats = new Map<number, number>(); // generation -> count

//     // Mutation counters per species (reset after each snapshot)
//     const mutationCountersBySpecies: Record<
//       string,
//       {
//         traitMutations: number;
//         colorMutations: number;
//         bodyPartMutations: number;
//         totalOffspring: number;
//       }
//     > = {};

//     // Subscribe to events
//     const unsubscribe = runtimeController.subscribe((event) => {
//       if (event.type === eventKeywords.time.passed) {
//         // scheduleLifecycleUpdate(event.deltaMs);
//       } else if (event.type === eventKeywords.boids.spawnPredator) {
//         handleSpawnPredator(event.x, event.y);
//       } else if (event.type === eventKeywords.boids.caught) {
//         handlePreyCaught(
//           event.predatorId,
//           event.preyId,
//           event.preyTypeId,
//           event.preyEnergy,
//           event.preyPosition
//         );
//       }
//     });

//     const forceCollector = createForceCollector();

//     const handleLifecycleUpdate = (deltaMs: number) => {
//       profiler.start("lifecycle.total");

//       // Update timers (check for expired timers)
//       profiler.start("lifecycle.timers");
//       timer.update();
//       profiler.end("lifecycle.timers");

//       tickCounter++;
//       const deltaSeconds = deltaMs / 1000;
//       const { config, simulation } = store.getState();

//       // Build update context from state slices
//       const context: LifecycleUpdateContext = {
//         simulation: {
//           obstacles: simulation.obstacles,
//           deathMarkers: simulation.deathMarkers,
//           foodSources: simulation.foodSources,
//         },
//         config: {
//           parameters: config.parameters,
//           world: config.world,
//           species: config.species,
//         },
//         boidsById: localBoidStore.store.boids,
//         boidIds: Object.keys(localBoidStore.store.boids),
//         boidsByRole: getBoidsByRole(localBoidStore.store.boids, config.species),
//         boidsCount: localBoidStore.store.count(),
//         forcesCollector: forceCollector,
//         tick: tickCounter,
//         deltaSeconds,
//       };

//       // Process all lifecycle updates (pure logic)
//       profiler.start("lifecycle.process");
//       const changes = processLifecycleUpdates(
//         localBoidStore.store.boids,
//         context
//       );
//       profiler.end("lifecycle.process");

//       // Apply changes (side effects)
//       profiler.start("lifecycle.apply");
//       applyLifecycleChanges(changes);
//       profiler.end("lifecycle.apply");

//       // Fade death markers over time
//       profiler.start("lifecycle.fadeMarkers");
//       applyDeathMarkersFade();
//       profiler.end("lifecycle.fadeMarkers");

//       // Consume food sources
//       profiler.start("lifecycle.consumeFood");
//       consumeFoodSources();
//       profiler.end("lifecycle.consumeFood");

//       // Spawn prey food periodically
//       if (tickCounter % FOOD_CONSTANTS.PREY_FOOD_SPAWN_INTERVAL_TICKS === 0) {
//         profiler.start("lifecycle.spawnFood");
//         spawnPreyFoodSources();
//         profiler.end("lifecycle.spawnFood");
//       }

//       // Log evolution stats every 300 ticks (~5 seconds at 60fps)
//       if (tickCounter % 300 === 0 && totalOffspring > 0) {
//         const genCounts = new Map<number, number>();
//         const colorVariety = new Map<string, number>();

//         for (const boid of iterateBoids(boidStore.boids)) {
//           if (boid.genome) {
//             const gen = boid.genome.generation;
//             genCounts.set(gen, (genCounts.get(gen) || 0) + 1);

//             const color = boid.genome.visual.color;
//             colorVariety.set(color, (colorVariety.get(color) || 0) + 1);
//           }
//         }

//         console.log("📊 EVOLUTION STATS", {
//           tick: tickCounter,
//           totalOffspring: totalOffspring,
//           currentPopulation: boidStore.count(),
//           generationDistribution: Object.fromEntries(genCounts),
//           uniqueColors: colorVariety.size,
//           maxGeneration: Math.max(...Array.from(genCounts.keys())),
//         });
//       }

//       profiler.end("lifecycle.total");
//     };

//     const applyDeathMarkersFade = () => {
//       const { simulation } = runtimeStore.store.getState();

//       // Fade markers (pure function)
//       const { markers: updatedMarkers, shouldUpdate } = fadeDeathMarkers(
//         simulation.deathMarkers
//       );

//       if (shouldUpdate) {
//         runtimeStore.store.setState({
//           simulation: {
//             ...simulation,
//             deathMarkers: updatedMarkers,
//           },
//         });
//       }
//     };

//     const applyLifecycleChanges = (changes: LifecycleUpdates) => {
//       const { config, simulation } = runtimeStore.store.getState();
//       const speciesTypes = config.species;

//       // Process death markers (pure function)
//       profiler.start("lifecycle.process");
//       const { markers: updatedMarkers, shouldUpdate } = processDeathMarkers(
//         simulation.deathMarkers,
//         changes.deathEvents,
//         (id) => engine.getBoidById(id)
//       );
//       profiler.end("lifecycle.process");

//       // Update store if markers changed
//       if (shouldUpdate) {
//         runtimeStore.store.setState({
//           simulation: {
//             ...simulation,
//             deathMarkers: updatedMarkers,
//           },
//         });
//       }

//       // Dispatch death events BEFORE removing boids (so we can get typeId)
//       for (const { boidId, reason } of changes.deathEvents) {
//         const boid = engine.getBoidById(boidId);
//         if (boid) {
//           runtimeController.dispatch({
//             type: eventKeywords.boids.died,
//             boidId,
//             typeId: boid.typeId, // Include typeId for analytics tracking
//             reason, // Include death reason (old_age, starvation, predation)
//           });
//         }
//       }

//       // Remove dead boids AFTER dispatching events
//       for (const boidId of changes.boidsToRemove) {
//         engine.removeBoid(boidId);
//       }

//       // Count current populations for cap checking
//       const counts = countBoidsByRole(boidStore.boids, speciesTypes);
//       const currentPreyCount = counts.prey;
//       const currentPredatorCount = counts.predator;

//       // Add new boids (check population caps)
//       for (const offspring of changes.boidsToAdd) {
//         const speciesConfig = speciesTypes[offspring.typeId];
//         const offspringCount = speciesConfig.reproduction.offspringCount || 1;
//         const energyBonus =
//           speciesConfig.reproduction.offspringEnergyBonus || 0;

//         // Get parent genomes for inheritance
//         const parent1 = engine.getBoidById(offspring.parent1Id);
//         const parent2 = offspring.parent2Id
//           ? engine.getBoidById(offspring.parent2Id)
//           : undefined;

//         // Spawn multiple offspring if configured
//         for (let i = 0; i < offspringCount; i++) {
//           // Count current population of this specific type
//           const currentTypeCount = filterBoidsWhere(
//             boidStore.boids,
//             (b) => b.typeId === offspring.typeId
//           ).length;

//           const canSpawn = canSpawnOffspring(
//             offspring.typeId,
//             speciesTypes,
//             {
//               maxBoids: config.parameters.maxBoids,
//               maxPreyBoids: config.parameters.maxPreyBoids,
//               maxPredatorBoids: config.parameters.maxPredatorBoids,
//             },
//             {
//               totalBoids: boidStore.count(),
//               totalPrey: currentPreyCount,
//               totalPredators: currentPredatorCount,
//             },
//             currentTypeCount // Pass current type count
//           );

//           if (canSpawn) {
//             const { width, height } = store.getState().config.world;
//             const configState = store.getState().config;
//             const physics = configState.physics;
//             const creationContext = {
//               world: {
//                 width,
//                 height,
//               },
//               species: speciesTypes,
//               rng: randomness.domain("reproduction"),
//               physics,
//             };

//             // Build parent genomes for inheritance (if parents exist)
//             const parentGenomes =
//               parent1 && parent1.genome
//                 ? {
//                     parent1: parent1.genome,
//                     parent2: parent2?.genome,
//                   }
//                 : undefined;

//             const result = createBoidOfType(
//               offspring.position,
//               offspring.typeId,
//               creationContext,
//               energyBonus,
//               boidStore.nextIndex(), // Apply energy bonus
//               parentGenomes // Pass parent genomes for inheritance
//             );
//             const newBoid = result.boid;
//             engine.addBoid(newBoid);

//             // Track evolution stats (temporary for debugging)
//             totalOffspring++;
//             const gen = newBoid.genome.generation;
//             generationStats.set(gen, (generationStats.get(gen) || 0) + 1);

//             // Track mutations per species
//             if (result.mutationMetadata) {
//               if (!mutationCountersBySpecies[offspring.typeId]) {
//                 mutationCountersBySpecies[offspring.typeId] = {
//                   traitMutations: 0,
//                   colorMutations: 0,
//                   bodyPartMutations: 0,
//                   totalOffspring: 0,
//                 };
//               }
//               const counters = mutationCountersBySpecies[offspring.typeId];
//               counters.totalOffspring++;
//               if (result.mutationMetadata.hadTraitMutation)
//                 counters.traitMutations++;
//               if (result.mutationMetadata.hadColorMutation)
//                 counters.colorMutations++;
//               if (result.mutationMetadata.hadBodyPartMutation)
//                 counters.bodyPartMutations++;
//             }

//             // Dispatch reproduction event (only for first offspring to avoid spam)
//             if (i === 0) {
//               const reproductionEvent = changes.reproductionEvents.find(
//                 (e) => e.parent1Id === offspring.parent1Id
//               );
//               if (reproductionEvent) {
//                 runtimeController.dispatch({
//                   type: eventKeywords.boids.reproduced,
//                   parentId: reproductionEvent.parent1Id,
//                   childId: newBoid.id,
//                   typeId: reproductionEvent.typeId,
//                   offspringCount, // Include actual offspring count (1-2)
//                   ...(reproductionEvent.parent2Id && {
//                     parent2Id: reproductionEvent.parent2Id,
//                   }),
//                 });
//               }
//             }
//           }
//         }
//       }

//       // Handle global population cap (cull random boids if over limit)
//       const maxBoids = store.getState().config.parameters.maxBoids;
//       if (boidStore.count() > maxBoids) {
//         const excessCount = boidStore.count() - maxBoids;
//         for (let i = 0; i < excessCount; i++) {
//           const randomIndex = lifecycleRng.intRange(0, boidStore.count());
//           const boid = findBoidWhere(
//             boidStore.boids,
//             (b) => b.index === randomIndex
//           );
//           if (boid) {
//             engine.removeBoid(boid.id);
//           }
//         }
//       }
//     };

//     const handleSpawnPredator = (x: number, y: number) => {
//       const { config } = runtimeStore.store.getState();
//       const runtimeTypes = config.species;

//       // Find the predator type
//       const predatorTypeId = Object.keys(runtimeTypes).find(
//         (id) => runtimeTypes[id].role === "predator"
//       );

//       if (!predatorTypeId) {
//         console.warn("No predator type found in config");
//         return;
//       }

//       if (boidStore.count() >= store.getState().config.parameters.maxBoids) {
//         console.warn("Max boids reached, cannot spawn predator");
//         return;
//       }

//       const { width, height } = store.getState().config.world;
//       const creationContext = {
//         world: {
//           width,
//           height,
//         },
//         species: runtimeTypes,
//         rng: randomness.domain("spawning"),
//       };
//       const result = createBoidOfType(
//         { x, y },
//         predatorTypeId,
//         creationContext,
//         0,
//         boidStore.nextIndex()
//       );
//       const newPredator = result.boid;

//       engine.addBoid(newPredator);
//     };

//     const handlePreyCaught = (
//       _predatorId: string,
//       _preyId: string,
//       _preyTypeId: string,
//       preyEnergy: number,
//       preyPosition: { x: number; y: number }
//     ) => {
//       const { simulation } = runtimeStore.store.getState();

//       // Check if we can create food (pure function)
//       if (!canCreatePredatorFood(simulation.foodSources)) {
//         return;
//       }

//       // Create food source (pure function)
//       const foodSource = createPredatorFood(
//         preyEnergy,
//         preyPosition,
//         tickCounter,
//         randomness.domain("food"),
//         time.now() // Pass simulation time for ID generation
//       );

//       // Apply side effects
//       runtimeStore.store.setState({
//         simulation: {
//           ...simulation,
//           foodSources: [...simulation.foodSources, foodSource],
//         },
//       });

//       runtimeController.dispatch({
//         type: eventKeywords.boids.foodSourceCreated,
//         foodSource,
//       });
//     };

//     const spawnPreyFoodSources = () => {
//       const { simulation, config } = runtimeStore.store.getState();

//       // Generate new prey food (pure function)
//       const { newFoodSources, shouldUpdate } = generatePreyFood(
//         simulation.foodSources,
//         config.world,
//         tickCounter,
//         randomness.domain("food"),
//         time.now() // Pass simulation time for ID generation
//       );

//       if (!shouldUpdate) {
//         return;
//       }

//       // Apply side effects
//       const updatedFoodSources = [...simulation.foodSources, ...newFoodSources];

//       runtimeStore.store.setState({
//         simulation: {
//           ...simulation,
//           foodSources: updatedFoodSources,
//         },
//       });

//       // Dispatch events for each new food source
//       for (const foodSource of newFoodSources) {
//         runtimeController.dispatch({
//           type: eventKeywords.boids.foodSourceCreated,
//           foodSource,
//         });
//       }
//     };

//     const consumeFoodSources = () => {
//       const { simulation, config } = runtimeStore.store.getState();

//       // Process food consumption (pure function)
//       const { foodSources: updatedFoodSources, boidsToUpdate } =
//         processFoodConsumption(
//           simulation.foodSources,
//           localBoidStore.store.boids,
//           config.species
//         );

//       // Apply energy gains to boids (impure but isolated)
//       applyEnergyGains(boidsToUpdate, config.species);

//       // Update store if food sources changed
//       if (haveFoodSourcesChanged(simulation.foodSources, updatedFoodSources)) {
//         runtimeStore.store.setState({
//           simulation: {
//             ...simulation,
//             foodSources: updatedFoodSources,
//           },
//         });
//       }
//     };

//     return {
//       unsubscribe,
//       getMutationCounters: () => mutationCountersBySpecies,
//       resetMutationCounters: () => {
//         for (const key of Object.keys(mutationCountersBySpecies)) {
//           delete mutationCountersBySpecies[key];
//         }
//       },
//     };
//   },
//   halt: ({ unsubscribe }) => {
//     unsubscribe();
//   },
// });

// export type LifecycleManagerResource = StartedResource<typeof lifecycleManager>;
