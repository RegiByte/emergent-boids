import { defineResource, StartedResource } from "braided";
import { createStore } from "zustand/vanilla";
import { useStore as useZustandStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { BoidConfig } from "../boids/types";
import type { RuntimeState } from "../vocabulary/keywords";

/**
 * Evolution Snapshot - captures ecosystem state at a point in time
 * Used for time-series analysis and CSV export
 */
export type EvolutionSnapshot = {
  tick: number;
  timestamp: number;
  populations: Record<string, number>; // Population count per type
  births: Record<string, number>; // Births since last snapshot per type
  deaths: Record<string, number>; // Deaths since last snapshot per type
  catches: Record<string, number>; // Prey caught since last snapshot per type
  avgEnergy: Record<string, number>; // Average energy per type
  foodSources: {
    prey: number;
    predator: number;
  };
};

/**
 * Analytics State - time-series data and metrics
 * Managed by analytics resource, read by components
 */
export type AnalyticsState = {
  evolutionHistory: EvolutionSnapshot[];
  currentSnapshot: EvolutionSnapshot | null;
};

/**
 * Runtime Store - centralized state management
 * Organized in slices for separation of concerns
 */
export type RuntimeStore = {
  state: RuntimeState; // Core simulation state
  analytics: AnalyticsState; // Time-series data and metrics
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
      analytics: {
        evolutionHistory: [],
        currentSnapshot: null,
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
