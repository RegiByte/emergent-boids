import { defineResource } from "braided";
import type { BoidEngine } from "./engine";
import type { RuntimeController } from "./runtimeController";
import type { StartedRuntimeStore } from "./runtimeStore";
import { eventKeywords } from "../vocabulary/keywords";
import { createBoidOfType } from "../boids/boid";
import type { BoidUpdateContext } from "../boids/context";
import { countPrey, countPredators } from "../boids/filters";
import { processLifecycleUpdates } from "../boids/lifecycle/orchestration";
import { canSpawnOffspring } from "../boids/lifecycle/population";
import { FOOD_CONSTANTS } from "../boids/food";
import {
  createPredatorFood,
  canCreatePredatorFood,
  generatePreyFood,
  processFoodConsumption,
  applyEnergyGains,
  haveFoodSourcesChanged,
} from "../boids/foodManager";
import { processDeathMarkers, fadeDeathMarkers } from "../boids/deathMarkers";

/**
 * Lifecycle Manager
 *
 * Manages the full lifecycle of boids:
 * - Energy updates (gain/loss)
 * - Aging and death (old age, starvation)
 * - Stance updates (behavioral states)
 * - Reproduction (mate-seeking, pairing, offspring)
 * - Population management (caps, culling)
 * - Predator spawning (user-triggered)
 */
export const lifecycleManager = defineResource({
  dependencies: ["engine", "runtimeController", "runtimeStore"],
  start: ({
    engine,
    runtimeController,
    runtimeStore,
  }: {
    engine: BoidEngine;
    runtimeController: RuntimeController;
    runtimeStore: StartedRuntimeStore;
  }) => {
    const store = runtimeStore.store;
    // Tick counter for periodic events
    let tickCounter = 0;

    // Subscribe to events
    const unsubscribe = runtimeController.subscribe((event) => {
      if (event.type === eventKeywords.time.passed) {
        handleLifecycleUpdate(event.deltaMs);
      } else if (event.type === eventKeywords.boids.spawnPredator) {
        handleSpawnPredator(event.x, event.y);
      } else if (event.type === eventKeywords.boids.caught) {
        handlePreyCaught(
          event.predatorId,
          event.preyId,
          event.preyTypeId,
          event.preyEnergy,
          event.preyPosition
        );
      }
    });

    const handleLifecycleUpdate = (deltaMs: number) => {
      tickCounter++;
      const deltaSeconds = deltaMs / 1000;
      const { config, simulation } = store.getState();

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
      };

      // Process all lifecycle updates (pure logic)
      const changes = processLifecycleUpdates(engine.boids, context);

      // Apply changes (side effects)
      applyLifecycleChanges(changes);

      // Fade death markers over time
      applyDeathMarkersFade();

      // Consume food sources
      consumeFoodSources();

      // Spawn prey food periodically
      if (tickCounter % FOOD_CONSTANTS.PREY_FOOD_SPAWN_INTERVAL_TICKS === 0) {
        spawnPreyFoodSources();
      }
    };

    const applyDeathMarkersFade = () => {
      const { simulation } = runtimeStore.store.getState();

      // Fade markers (pure function)
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
    };

    const applyLifecycleChanges = (changes: {
      boidsToRemove: string[];
      boidsToAdd: Array<{
        parent1Id: string;
        parent2Id?: string;
        typeId: string;
        position: { x: number; y: number };
      }>;
      deathEvents: Array<{ boidId: string; reason: "old_age" | "starvation" }>;
      reproductionEvents: Array<{
        parent1Id: string;
        parent2Id?: string;
        typeId: string;
      }>;
    }) => {
      const { config, simulation } = runtimeStore.store.getState();
      const speciesTypes = config.species;

      // Process death markers (pure function)
      const { markers: updatedMarkers, shouldUpdate } = processDeathMarkers(
        simulation.deathMarkers,
        changes.deathEvents,
        (id) => engine.getBoidById(id)
      );

      // Update store if markers changed
      if (shouldUpdate) {
        runtimeStore.store.setState({
          simulation: {
            ...simulation,
            deathMarkers: updatedMarkers,
          },
        });
      }

      // Dispatch death events BEFORE removing boids (so we can get typeId)
      for (const { boidId, reason } of changes.deathEvents) {
        const boid = engine.getBoidById(boidId);
        if (boid) {
          runtimeController.dispatch({
            type: eventKeywords.boids.died,
            boidId,
            typeId: boid.typeId, // Include typeId for analytics tracking
            reason, // Include death reason (old_age, starvation, predation)
          });
        }
      }

      // Remove dead boids AFTER dispatching events
      for (const boidId of changes.boidsToRemove) {
        engine.removeBoid(boidId);
      }

      // Count current populations for cap checking
      const currentPreyCount = countPrey(engine.boids, speciesTypes);
      const currentPredatorCount = countPredators(engine.boids, speciesTypes);

      // Add new boids (check population caps)
      for (const offspring of changes.boidsToAdd) {
        const speciesConfig = speciesTypes[offspring.typeId];
        const offspringCount = speciesConfig.reproduction.offspringCount || 1;
        const energyBonus =
          speciesConfig.reproduction.offspringEnergyBonus || 0;

        // Spawn multiple offspring if configured
        for (let i = 0; i < offspringCount; i++) {
          // Count current population of this specific type
          const currentTypeCount = engine.boids.filter(
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
              totalBoids: engine.boids.length,
              totalPrey: currentPreyCount,
              totalPredators: currentPredatorCount,
            },
            currentTypeCount // Pass current type count
          );

          if (canSpawn) {
            const creationContext = {
              world: {
                canvasWidth: store.getState().config.world.canvasWidth,
                canvasHeight: store.getState().config.world.canvasHeight,
              },
              species: speciesTypes,
            };
            const newBoid = createBoidOfType(
              offspring.position,
              offspring.typeId,
              creationContext,
              energyBonus // Apply energy bonus
            );
            engine.addBoid(newBoid);

            // Dispatch reproduction event (only for first offspring to avoid spam)
            if (i === 0) {
              const reproductionEvent = changes.reproductionEvents.find(
                (e) => e.parent1Id === offspring.parent1Id
              );
              if (reproductionEvent) {
                runtimeController.dispatch({
                  type: eventKeywords.boids.reproduced,
                  parentId: reproductionEvent.parent1Id,
                  childId: newBoid.id,
                  typeId: reproductionEvent.typeId,
                  offspringCount, // Include actual offspring count (1-2)
                  ...(reproductionEvent.parent2Id && {
                    parent2Id: reproductionEvent.parent2Id,
                  }),
                });
              }
            }
          }
        }
      }

      // Handle global population cap (cull random boids if over limit)
      const maxBoids = store.getState().config.parameters.maxBoids;
      if (engine.boids.length > maxBoids) {
        const excessCount = engine.boids.length - maxBoids;
        for (let i = 0; i < excessCount; i++) {
          const randomIndex = Math.floor(Math.random() * engine.boids.length);
          const boid = engine.boids[randomIndex];
          engine.removeBoid(boid.id);
        }
      }
    };

    const handleSpawnPredator = (x: number, y: number) => {
      const { config } = runtimeStore.store.getState();
      const runtimeTypes = config.species;

      // Find the predator type
      const predatorTypeId = Object.keys(runtimeTypes).find(
        (id) => runtimeTypes[id].role === "predator"
      );

      if (!predatorTypeId) {
        console.warn("No predator type found in config");
        return;
      }

      if (engine.boids.length >= store.getState().config.parameters.maxBoids) {
        console.warn("Max boids reached, cannot spawn predator");
        return;
      }

      const creationContext = {
        world: {
          canvasWidth: store.getState().config.world.canvasWidth,
          canvasHeight: store.getState().config.world.canvasHeight,
        },
        species: runtimeTypes,
      };
      const newPredator = createBoidOfType(
        { x, y },
        predatorTypeId,
        creationContext
      );

      engine.addBoid(newPredator);
    };

    const handlePreyCaught = (
      _predatorId: string,
      _preyId: string,
      _preyTypeId: string,
      preyEnergy: number,
      preyPosition: { x: number; y: number }
    ) => {
      const { simulation } = runtimeStore.store.getState();

      // Check if we can create food (pure function)
      if (!canCreatePredatorFood(simulation.foodSources)) {
        return;
      }

      // Create food source (pure function)
      const foodSource = createPredatorFood(
        preyEnergy,
        preyPosition,
        tickCounter
      );

      // Apply side effects
      runtimeStore.store.setState({
        simulation: {
          ...simulation,
          foodSources: [...simulation.foodSources, foodSource],
        },
      });

      runtimeController.dispatch({
        type: eventKeywords.boids.foodSourceCreated,
        foodSource,
      });
    };

    const spawnPreyFoodSources = () => {
      const { simulation, config } = runtimeStore.store.getState();

      // Generate new prey food (pure function)
      const { newFoodSources, shouldUpdate } = generatePreyFood(
        simulation.foodSources,
        config.world,
        tickCounter
      );

      if (!shouldUpdate) {
        return;
      }

      // Apply side effects
      const updatedFoodSources = [...simulation.foodSources, ...newFoodSources];

      runtimeStore.store.setState({
        simulation: {
          ...simulation,
          foodSources: updatedFoodSources,
        },
      });

      // Dispatch events for each new food source
      for (const foodSource of newFoodSources) {
        runtimeController.dispatch({
          type: eventKeywords.boids.foodSourceCreated,
          foodSource,
        });
      }
    };

    const consumeFoodSources = () => {
      const { simulation, config } = runtimeStore.store.getState();

      // Process food consumption (pure function)
      const { foodSources: updatedFoodSources, boidsToUpdate } =
        processFoodConsumption(
          simulation.foodSources,
          engine.boids,
          config.species
        );

      // Apply energy gains to boids (impure but isolated)
      applyEnergyGains(boidsToUpdate, config.species);

      // Update store if food sources changed
      if (haveFoodSourcesChanged(simulation.foodSources, updatedFoodSources)) {
        runtimeStore.store.setState({
          simulation: {
            ...simulation,
            foodSources: updatedFoodSources,
          },
        });
      }
    };

    return { unsubscribe };
  },
  halt: ({ unsubscribe }) => {
    unsubscribe();
  },
});
