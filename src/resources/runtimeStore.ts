import { defineResource, StartedResource } from "braided";
import { createStore } from "zustand/vanilla";
import { useStore as useZustandStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { BoidConfig } from "../boids/types";
import type { RuntimeState } from "../vocabulary/keywords";

export type RuntimeStore = {
  state: RuntimeState;
};

export type RuntimeStoreApi = StoreApi<RuntimeStore>;

export const runtimeStore = defineResource({
  dependencies: ["config"],
  start: ({ config }: { config: BoidConfig }) => {
    // Create zustand store with initial values from config
    // This becomes the single source of truth - all runtime code should read from here
    const store = createStore<RuntimeStore>()(() => ({
      state: {
        // Perception and avoidance
        perceptionRadius: config.perceptionRadius,
        obstacleAvoidanceWeight: config.obstacleAvoidanceWeight,
        obstacles: [],
        // Store mutable copies of type configs
        types: { ...config.types },
        // Visual settings (toggleable via keyboard shortcuts)
        visualSettings: {
          trailsEnabled: true,
          energyBarsEnabled: false,
          matingHeartsEnabled: true,
          stanceSymbolsEnabled: false,
          deathMarkersEnabled: true,
          foodSourcesEnabled: true,
        },
        // Death markers (natural deaths only: starvation/old age)
        deathMarkers: [],
        // Food sources (consumable energy for boids)
        foodSources: [],
        // Canvas dimensions
        canvasWidth: config.canvasWidth,
        canvasHeight: config.canvasHeight,
        // Global simulation parameters
        fearRadius: config.fearRadius,
        chaseRadius: config.chaseRadius,
        catchRadius: config.catchRadius,
        mateRadius: config.mateRadius,
        minDistance: config.minDistance,
        maxBoids: config.maxBoids,
        maxPreyBoids: config.maxPreyBoids,
        maxPredatorBoids: config.maxPredatorBoids,
        minReproductionAge: config.minReproductionAge,
        reproductionEnergyThreshold: config.reproductionEnergyThreshold,
        reproductionCooldownTicks: config.reproductionCooldownTicks,
        matingBuildupTicks: config.matingBuildupTicks,
        eatingCooldownTicks: config.eatingCooldownTicks,
      },
    }));

    function useStore<T>(selector: (state: RuntimeStore) => T): T {
      return useZustandStore(store, selector);
    }

    return { store, useStore };
  },
  halt: () => {
    // No cleanup needed for zustand store
  },
});

export type StartedRuntimeStore = StartedResource<typeof runtimeStore>;
