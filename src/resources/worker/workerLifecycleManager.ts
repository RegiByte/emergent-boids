import { createBoidOfType } from "@/boids/boid";
import { fadeDeathMarkers, processDeathMarkers } from "@/boids/deathMarkers";
import { CollectEventCallback, createEventCollector } from "@/boids/collectors";
import { countBoidsByRole } from "@/boids/filters";
import { FOOD_CONSTANTS } from "@/boids/food";
import {
  applyEnergyGains,
  generatePreyFood,
  haveFoodSourcesChanged,
  processFoodConsumption,
} from "@/boids/foodManager";
import { filterBoidsWhere, findBoidWhere } from "@/boids/iterators";
import {
  LifecycleUpdates,
  processLifecycleUpdates,
} from "@/boids/lifecycle/orchestration";
import { canSpawnOffspring } from "@/boids/lifecycle/population";
import { eventKeywords } from "@/boids/vocabulary/keywords";
import { AllEvents } from "@/boids/vocabulary/schemas/events";
import { defineResource, StartedResource } from "braided";
import { RandomnessResource } from "../shared/randomness";
import { TimeAPI } from "../shared/time";
import { WorkerStoreResource } from "./workerStore";

export const workerLifecycleManager = defineResource({
  dependencies: ["workerStore", "workerTime", "workerRandomness"],
  start: ({
    workerStore,
    workerTime,
    workerRandomness,
  }: {
    workerStore: WorkerStoreResource;
    workerTime: TimeAPI;
    workerRandomness: RandomnessResource;
  }) => {
    let tickCounter = 0;
    const boidStore = workerStore.boids;
    const lifecycleRng = workerRandomness.domain("lifecycle");
    const eventCollector = createEventCollector<AllEvents>();

    const applyDeathMarkersFade = () => {
      const { simulation } = workerStore.getState();
      const { markers: updatedMarkers, shouldUpdate } = fadeDeathMarkers(
        simulation.deathMarkers
      );
      if (shouldUpdate) {
        workerStore.store.updateState((state) => ({
          ...state,
          simulation: {
            ...state.simulation,
            deathMarkers: updatedMarkers,
          },
        }));
      }
    };

    const consumeFoodSources = () => {
      const { simulation, config } = workerStore.getState();
      const { foodSources: updatedFoodSources, boidsToUpdate } =
        processFoodConsumption(
          simulation.foodSources,
          workerStore.boids.getBoids(),
          config.species
        );

      // Apply energy gains to boids (impure but isolated)
      applyEnergyGains(boidsToUpdate, config.species);

      // Update store if food sources changed
      if (haveFoodSourcesChanged(simulation.foodSources, updatedFoodSources)) {
        workerStore.store.updateState((state) => ({
          ...state,
          simulation: {
            ...state.simulation,
            foodSources: updatedFoodSources,
          },
        }));
      }
    };

    const spawnPreyFoodSources = (
      collectEvent: CollectEventCallback<typeof eventCollector>
    ) => {
      const state = workerStore.getState();
      const { simulation, config } = state;

      // Generate new prey food (pure function)
      const { newFoodSources, shouldUpdate } = generatePreyFood(
        simulation.foodSources,
        config.world,
        tickCounter,
        workerRandomness.domain("food"),
        workerTime.now()
      );

      if (!shouldUpdate) {
        return;
      }

      // Apply side effects
      const updatedFoodSources = [...simulation.foodSources, ...newFoodSources];

      workerStore.setState({
        ...state,
        simulation: {
          ...simulation,
          foodSources: updatedFoodSources,
        },
      });

      // Dispatch events for each new food source
      // Note: These events will be sent to main thread
      for (const foodSource of newFoodSources) {
        collectEvent({
          type: eventKeywords.boids.foodSourceCreated,
          foodSource,
        });
      }
    };

    const applyLifecycleChanges = (
      changes: LifecycleUpdates,
      collectEvent: (event: AllEvents) => void
    ) => {
      const state = workerStore.getState();
      const { config, simulation } = state;
      const speciesTypes = config.species;

      // Process death markers
      const { markers: updateMarkers, shouldUpdate } = processDeathMarkers(
        simulation.deathMarkers,
        changes.deathEvents,
        (id) => workerStore.boids.getBoidById(id)
      );

      if (shouldUpdate) {
        workerStore.setState({
          ...state,
          simulation: {
            ...simulation,
            deathMarkers: updateMarkers,
          },
        });
      }

      // Collect death events BEFORE removing boids
      for (const { boidId, reason } of changes.deathEvents) {
        const boid = workerStore.boids.getBoidById(boidId);
        if (boid) {
          collectEvent({
            type: eventKeywords.boids.died,
            boidId,
            typeId: boid.typeId,
            reason,
          });
        }
      }

      // Remove dead boids AFTER dispatching events
      for (const boidId of changes.boidsToRemove) {
        workerStore.boids.removeBoid(boidId);
      }

      const updatedBoids = workerStore.boids.getBoids();
      const counts = countBoidsByRole(updatedBoids, speciesTypes);
      // Count current populations for cap checking
      const currentPreyCount = counts.prey;
      const currentPredatorCount = counts.predator;

      // Add new boids (check population caps)
      for (const offspring of changes.boidsToAdd) {
        const speciesConfig = speciesTypes[offspring.typeId];
        const offspringCount = speciesConfig.reproduction.offspringCount || 1;
        const energyBonus =
          speciesConfig.reproduction.offspringEnergyBonus || 0;

        // Get parent genomes for inheritance
        const parent1 = workerStore.boids.getBoidById(offspring.parent1Id);
        const parent2 = offspring.parent2Id
          ? workerStore.boids.getBoidById(offspring.parent2Id)
          : undefined;

        // Spawn multiple offspring if configured
        for (let i = 0; i < offspringCount; i++) {
          // Count current population of this specific type
          const currentTypeCount = filterBoidsWhere(
            boidStore.getBoids(),
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
              totalBoids: boidStore.count(),
              totalPrey: currentPreyCount,
              totalPredators: currentPredatorCount,
            },
            currentTypeCount // Pass current type count
          );

          if (canSpawn) {
            const { width, height } = config.world;
            const physics = config.physics;

            const creationContext = {
              world: {
                width,
                height,
              },
              species: speciesTypes,
              rng: workerRandomness.domain("reproduction"),
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
              energyBonus, // Apply energy bonus
              Object.keys(workerStore.boids.getBoids()).length,
              parentGenomes // Pass parent genomes for inheritance
            );
            const newBoid = result.boid;
            workerStore.boids.addBoid(newBoid);

            // TODO: Track evolution stats (temporary for debugging)
            // Dispatch reproduction event (only for first offspring to avoid spam)
            if (i === 0) {
              const reproductionEvent = changes.reproductionEvents.find(
                (e) => e.parent1Id === offspring.parent1Id
              );
              if (reproductionEvent) {
                collectEvent({
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
      const maxBoids = config.parameters.maxBoids;
      if (boidStore.count() > maxBoids) {
        const excessCount = boidStore.count() - maxBoids;
        for (let i = 0; i < excessCount; i++) {
          const randomIndex = lifecycleRng.intRange(0, boidStore.count());
          const boid = findBoidWhere(
            boidStore.getBoids(),
            (b) => b.index === randomIndex
          );
          if (boid) {
            workerStore.boids.removeBoid(boid.id);
          }
        }
      }

      // End of applyLifecycleChanges
    };

    const api = {
      update: (deltaSeconds: number) => {
        eventCollector.reset();
        const { config, simulation } = workerStore.getState();
        const boids = workerStore.boids.getBoids();
        tickCounter += 1;

        const context = {
          simulation: {
            obstacles: simulation.obstacles,
            deathMarkers: simulation.deathMarkers,
            foodSources: simulation.foodSources,
            tick: tickCounter,
            frame: workerTime.getFrame(),
          },
          config: {
            parameters: config.parameters,
            world: config.world,
            species: config.species,
          },
          deltaSeconds,
          frame: workerTime.getFrame(),
        };

        // Process lifecycle changes, pure function
        const changes = processLifecycleUpdates(boids, context);

        // Apply changes (side effects)
        applyLifecycleChanges(changes, eventCollector.collect);

        // Fade death markers over time
        applyDeathMarkersFade();

        // Consume food sources
        consumeFoodSources();

        if (tickCounter % FOOD_CONSTANTS.PREY_FOOD_SPAWN_INTERVAL_TICKS === 0) {
          // TODO: Dispatch periodic events (e.g. food source creation)
          spawnPreyFoodSources(eventCollector.collect);
        }

        return eventCollector.items;
      },
      getTick: () => tickCounter,
    };

    return api;
  },
  halt: () => {
    // No cleanup needed
  },
});

export type WorkerLifecycleManagerResource = StartedResource<
  typeof workerLifecycleManager
>;
