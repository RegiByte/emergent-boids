import { defineResource, StartedResource } from "braided";
import { useStore as useZustandStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";
import { defaultProfileId, getProfile } from "../profiles";

import { RuntimeStore } from "../boids/vocabulary/schemas/state.ts";

/**
 * Evolution Snapshot - captures ecosystem state at a point in time
 * Used for time-series analysis and CSV export
 */
// export type EvolutionSnapshot = {
//   tick: number;
//   timestamp: number;
//   populations: Record<string, number>; // Population count per type
//   births: Record<string, number>; // Births since last snapshot per type
//   deaths: Record<string, number>; // Deaths since last snapshot per type
//   catches: Record<string, number>; // Prey caught since last snapshot per type
//   avgEnergy: Record<string, number>; // Average energy per type
//   foodSources: {
//     prey: number;
//     predator: number;
//   };
// };

/**
 * Analytics State - time-series data and metrics
 * Managed by analytics resource, read by components
 */
// export type AnalyticsState = {
//   evolutionHistory: EvolutionSnapshot[];
//   currentSnapshot: EvolutionSnapshot | null;
// };

/**
 * Visual Settings - UI preferences for rendering
 * Toggleable via keyboard shortcuts
 */
// export type VisualSettings = {
//   trailsEnabled: boolean;
//   energyBarsEnabled: boolean;
//   matingHeartsEnabled: boolean;
//   stanceSymbolsEnabled: boolean;
//   deathMarkersEnabled: boolean;
//   foodSourcesEnabled: boolean;
// };

export type RuntimeStoreApi = StoreApi<RuntimeStore>;

export const runtimeStore = defineResource({
  dependencies: [],
  start: () => {
    // Load default profile
    const profile = getProfile(defaultProfileId);

    // Calculate canvas dimensions dynamically from viewport
    const { canvasWidth, canvasHeight } = {
      canvasWidth: 800,
      canvasHeight: 600,
    };

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
          atmosphere: {
            base: {
              trailAlpha: 0.9,
              fogColor: "rgba(0, 200, 100, 0.5)",
              fogIntensity: 0.3,
              fogOpacity: 0.6,
            },
            activeEvent: null,
          },
        },
        sidebarOpen: true,
      },
      analytics: {
        evolutionHistory: [],
        currentSnapshot: null,
      },
    }));

    function useStore<T>(selector: (_state: RuntimeStore) => T): T {
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
