import { defineResource } from "braided";
import type { BoidEngine } from "./engine";
import type { RuntimeController } from "./runtimeController";
import type { StartedRuntimeStore } from "./runtimeStore";
import { eventKeywords } from "../vocabulary/keywords";
import { createBoidOfType } from "../boids/boid";
import { countPrey, countPredators } from "../boids/filters";
import { processLifecycleUpdates } from "../boids/lifecycle/orchestration";
import { canSpawnOffspring } from "../boids/lifecycle/population";
import { FOOD_CONSTANTS } from "../boids/food";

import {FoodSource} from "../vocabulary/schemas/prelude.ts";

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
      if (event.type === eventKeywords.time.passage) {
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
      const speciesTypes = config.species;

      // Process all lifecycle updates (pure logic)
      const changes = processLifecycleUpdates(
        engine.boids,
        config.parameters,
        speciesTypes,
        deltaSeconds,
        simulation.foodSources
      );

      // Apply changes (side effects)
      applyLifecycleChanges(changes);

      // Fade death markers over time
      fadeDeathMarkers();

      // Consume food sources
      consumeFoodSources();

      // Spawn prey food periodically
      if (tickCounter % FOOD_CONSTANTS.PREY_FOOD_SPAWN_INTERVAL_TICKS === 0) {
        spawnPreyFoodSources();
      }
    };

    const fadeDeathMarkers = () => {
      const { simulation } = runtimeStore.store.getState();

      // Skip if no markers
      if (simulation.deathMarkers.length === 0) {
        return;
      }

      // Decrement remainingTicks for all markers and filter out expired ones
      const updatedMarkers = simulation.deathMarkers
        .map((marker) => ({
          ...marker,
          remainingTicks: marker.remainingTicks - 1,
        }))
        .filter((marker) => marker.remainingTicks > 0);

      // Always update store (ticks change even if length doesn't)
      runtimeStore.store.setState({
        simulation: {
          ...simulation,
          deathMarkers: updatedMarkers,
        },
      });
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

      // Create death markers for natural deaths (starvation/old age only)
      // Predator catches will create food sources in next session
      // Consolidate nearby markers (100px radius) to prevent flooding
      const CONSOLIDATION_RADIUS = 100;
      const INITIAL_STRENGTH = 1.0;
      const STRENGTH_INCREMENT = 0.5;
      const MAX_STRENGTH = 5.0;
      const INITIAL_TICKS = 10;
      const MAX_LIFETIME_TICKS = 20;

      const currentState = runtimeStore.store.getState();
      const updatedMarkers = [...simulation.deathMarkers];

      for (const { boidId, reason } of changes.deathEvents) {
        // Only create markers for starvation and old age
        if (reason !== "starvation" && reason !== "old_age") {
          continue;
        }

        const boid = engine.getBoidById(boidId);
        if (!boid) continue;

        // Check if there's an existing marker nearby (within 100px)
        const nearbyMarkersIndexes = [];
        for (let i = 0; i < updatedMarkers.length; i++) {
          const marker = updatedMarkers[i];
          const dx = Math.abs(marker.position.x - boid.position.x);
          const dy = Math.abs(marker.position.y - boid.position.y);
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONSOLIDATION_RADIUS) {
            // within consolidation radius?
            // increase strength
            nearbyMarkersIndexes.push(i);
          }
        }

        if (nearbyMarkersIndexes.length > 0) {
          // Strengthen existing markers and restore ticks
          for (const nearbyMarkerIndex of nearbyMarkersIndexes) {
            const existingMarker = updatedMarkers[nearbyMarkerIndex];
            updatedMarkers[nearbyMarkerIndex] = {
              ...existingMarker,
              strength: Math.min(
                existingMarker.strength + STRENGTH_INCREMENT,
                MAX_STRENGTH
              ),
              remainingTicks: Math.min(
                existingMarker.remainingTicks + INITIAL_TICKS,
                existingMarker.maxLifetimeTicks
              ),
            };
          }
        } else {
          // Create new marker
          updatedMarkers.push({
            position: { x: boid.position.x, y: boid.position.y },
            remainingTicks: INITIAL_TICKS,
            strength: INITIAL_STRENGTH,
            maxLifetimeTicks: MAX_LIFETIME_TICKS,
            typeId: boid.typeId,
          });
        }
      }

      // Update store if markers changed
      if (
        updatedMarkers.length !== currentState.simulation.deathMarkers.length
      ) {
        runtimeStore.store.setState({
          simulation: {
            ...currentState.simulation,
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
            const newBoid = createBoidOfType(
              offspring.position,
              offspring.typeId,
              speciesConfig,
              store.getState().config.world.canvasWidth,
              store.getState().config.world.canvasHeight,
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

      const speciesConfig = runtimeTypes[predatorTypeId];
      const newPredator = createBoidOfType(
        { x, y },
        predatorTypeId,
        speciesConfig,
        store.getState().config.world.canvasWidth,
        store.getState().config.world.canvasHeight
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

      // Count existing predator food sources
      const existingPredatorFoodCount = simulation.foodSources.filter(
        (food) => food.sourceType === "predator"
      ).length;

      // Don't create food if we're at or above the cap
      if (
        existingPredatorFoodCount >= FOOD_CONSTANTS.MAX_PREDATOR_FOOD_SOURCES
      ) {
        return;
      }

      // Create predator food source from caught prey
      const foodEnergy =
        preyEnergy * FOOD_CONSTANTS.PREDATOR_FOOD_FROM_PREY_MULTIPLIER;

      const foodSource: FoodSource = {
        id: `food-predator-${Date.now()}-${Math.random()}`,
        position: preyPosition,
        energy: foodEnergy,
        maxEnergy: foodEnergy,
        sourceType: "predator",
        createdTick: tickCounter,
      };

      // Add to runtime state
      runtimeStore.store.setState({
        simulation: {
          ...simulation,
          foodSources: [...simulation.foodSources, foodSource],
        },
      });

      // Dispatch event
      runtimeController.dispatch({
        type: eventKeywords.boids.foodSourceCreated,
        foodSource,
      });
    };

    const spawnPreyFoodSources = () => {
      const { simulation } = runtimeStore.store.getState();

      // Count existing prey food sources
      const existingPreyFoodCount = simulation.foodSources.filter(
        (food) => food.sourceType === "prey"
      ).length;

      // Don't spawn if we're at or above the cap
      if (existingPreyFoodCount >= FOOD_CONSTANTS.MAX_PREY_FOOD_SOURCES) {
        return;
      }

      const newFoodSources = [...simulation.foodSources];

      // Calculate how many we can spawn without exceeding the cap
      const maxToSpawn = Math.min(
        FOOD_CONSTANTS.PREY_FOOD_SPAWN_COUNT,
        FOOD_CONSTANTS.MAX_PREY_FOOD_SOURCES - existingPreyFoodCount
      );

      for (let i = 0; i < maxToSpawn; i++) {
        const foodSource: FoodSource = {
          id: `food-prey-${Date.now()}-${Math.random()}-${i}`,
          position: {
            x: Math.random() * store.getState().config.world.canvasWidth,
            y: Math.random() * store.getState().config.world.canvasHeight,
          },
          energy: FOOD_CONSTANTS.PREY_FOOD_INITIAL_ENERGY,
          maxEnergy: FOOD_CONSTANTS.PREY_FOOD_INITIAL_ENERGY,
          sourceType: "prey",
          createdTick: tickCounter,
        };

        newFoodSources.push(foodSource);

        runtimeController.dispatch({
          type: eventKeywords.boids.foodSourceCreated,
          foodSource,
        });
      }

      runtimeStore.store.setState({
        simulation: {
          ...simulation,
          foodSources: newFoodSources,
        },
      });
    };

    const consumeFoodSources = () => {
      const { simulation, config } = runtimeStore.store.getState();
      const runtimeTypes = config.species;
      const updatedFoodSources = [...simulation.foodSources];

      // For each food source, find nearby eating boids
      for (let i = updatedFoodSources.length - 1; i >= 0; i--) {
        const food = updatedFoodSources[i];

        if (food.energy <= 0) {
          // Remove exhausted food
          updatedFoodSources.splice(i, 1);
          continue;
        }

        // Find boids eating from this source
        const eatingBoids = engine.boids.filter((boid) => {
          const speciesConfig = runtimeTypes[boid.typeId];
          if (!speciesConfig) return false;

          // Must be correct role
          if (food.sourceType === "prey" && speciesConfig.role !== "prey")
            return false;
          if (
            food.sourceType === "predator" &&
            speciesConfig.role !== "predator"
          )
            return false;

          // Must be in eating stance
          if (boid.stance !== "eating") return false;

          // Must NOT have eating cooldown (respects turn-taking)
          if (boid.eatingCooldown > 0) return false;

          // Must be close enough
          const dx = boid.position.x - food.position.x;
          const dy = boid.position.y - food.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < FOOD_CONSTANTS.FOOD_CONSUMPTION_RADIUS;
        });

        if (eatingBoids.length > 0) {
          // Distribute energy among eating boids
          const consumptionRate =
            food.sourceType === "prey"
              ? FOOD_CONSTANTS.PREY_FOOD_CONSUMPTION_RATE
              : FOOD_CONSTANTS.PREDATOR_FOOD_CONSUMPTION_RATE;

          const totalConsumption = consumptionRate * eatingBoids.length;
          const actualConsumption = Math.min(totalConsumption, food.energy);
          const perBoidGain = actualConsumption / eatingBoids.length;

          // Give energy to boids
          for (const boid of eatingBoids) {
            const speciesConfig = runtimeTypes[boid.typeId];
            if (speciesConfig) {
              boid.energy = Math.min(
                boid.energy + perBoidGain,
                speciesConfig.lifecycle.maxEnergy
              );
            }
          }

          // Reduce food energy
          updatedFoodSources[i] = {
            ...food,
            energy: food.energy - actualConsumption,
          };
        }
      }

      // Update store if food sources changed
      if (
        updatedFoodSources.length !== simulation.foodSources.length ||
        updatedFoodSources.some(
          (food, idx) => food.energy !== simulation.foodSources[idx]?.energy
        )
      ) {
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
