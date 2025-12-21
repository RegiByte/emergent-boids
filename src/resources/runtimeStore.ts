import { defineResource, StartedResource } from "braided";
import { useStore as useZustandStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";
import { defaultProfileId, getProfile } from "../profiles";


import {RuntimeStore} from "../vocabulary/schemas/state.ts";

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
 * Visual Settings - UI preferences for rendering
 * Toggleable via keyboard shortcuts
 */
export type VisualSettings = {
  trailsEnabled: boolean;
  energyBarsEnabled: boolean;
  matingHeartsEnabled: boolean;
  stanceSymbolsEnabled: boolean;
  deathMarkersEnabled: boolean;
  foodSourcesEnabled: boolean;
};

export type RuntimeStoreApi = StoreApi<RuntimeStore>;

/**
 * Calculate canvas dimensions based on viewport
 * TODO: In the future, this will be replaced by a viewport system
 * where the canvas is larger than the visible area
 */
function calculateCanvasDimensions() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const availableWidth = viewportWidth * 0.75;
  const availableHeight = viewportHeight - 100;

  const canvasWidth = Math.floor(Math.min(availableWidth - 40, 1400));
  const canvasHeight = Math.floor(Math.min(availableHeight - 40, 1000));

  return { canvasWidth, canvasHeight };
}

export const runtimeStore = defineResource({
  dependencies: [],
  start: () => {
    // Load default profile
    const profile = getProfile(defaultProfileId);

    // Calculate canvas dimensions dynamically from viewport
    const { canvasWidth, canvasHeight } = calculateCanvasDimensions();

    // Create zustand store with initial values from profile
    // This becomes the single source of truth - all runtime code should read from here
    const store = createStore<RuntimeStore>()(() => ({
      config: {
        profileId: profile.id,
        world: {
          canvasWidth,
          canvasHeight,
          initialPreyCount: profile.world.initialPreyCount,
          initialPredatorCount: profile.world.initialPredatorCount,
        },
        species: profile.species,
        parameters: profile.parameters,
      },
      simulation: {
        obstacles: [],
        foodSources: [],
        deathMarkers: [],
      },
      ui: {
        visualSettings: {
          trailsEnabled: true,
          energyBarsEnabled: false,
          matingHeartsEnabled: true,
          stanceSymbolsEnabled: false,
          deathMarkersEnabled: true,
          foodSourcesEnabled: true,
        },
      },
      analytics: {
        evolutionHistory: [],
        currentSnapshot: null,
      },
    }));

    function useStore<T>(selector: (state: RuntimeStore) => T): T {
      return useZustandStore(store, selector);
    }

    /**
     * Load a different profile (resets simulation state)
     * TODO: Add UI control to switch profiles
     */
    function loadProfile(profileId: string) {
      const profile = getProfile(profileId);

      store.setState({
        config: {
          profileId: profile.id,
          world: store.getState().config.world, // Keep canvas size
          species: profile.species,
          parameters: profile.parameters,
        },
        // Reset simulation state
        simulation: {
          obstacles: [],
          foodSources: [],
          deathMarkers: [],
        },
        // Keep UI preferences
        ui: store.getState().ui,
        // Reset analytics
        analytics: {
          evolutionHistory: [],
          currentSnapshot: null,
        },
      });
    }

    return { store, useStore, loadProfile };
  },
  halt: () => {
    // No cleanup needed for zustand store
  },
});

export type StartedRuntimeStore = StartedResource<typeof runtimeStore>;
