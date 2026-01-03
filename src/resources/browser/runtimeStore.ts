import { defineResource, StartedResource } from "braided";
import { useStore as useZustandStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";
import { defaultProfileId, getProfile } from "../../profiles";
import { devtools } from "zustand/middleware";

import { RuntimeStore } from "../../boids/vocabulary/schemas/state.ts";
import { defaultWorldPhysics } from "@/boids/defaultPhysics.ts";

export type RuntimeStoreApi = StoreApi<RuntimeStore>;

export const runtimeStore = defineResource({
  dependencies: [],
  start: () => {
    // Load default profile
    const profile = getProfile(defaultProfileId);

    // World configuration from profile
    // Each profile defines its own world size and appearance for guaranteed stability
    const {
      width,
      height,
      backgroundColor,
      initialPreyCount,
      initialPredatorCount,
    } = profile.world;

    // Create zustand store with initial values from profile
    // This becomes the single source of truth - all runtime code should read from here
    const store = createStore<RuntimeStore>()(
      devtools(() => ({
        config: {
          profileId: profile.id,
          randomSeed: profile.seed,
          world: {
            width,
            height,
            backgroundColor,
            initialPreyCount,
            initialPredatorCount,
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
            healthBarsEnabled: true, // NEW: Show health bars for wounded boids
            matingHeartsEnabled: true,
            stanceSymbolsEnabled: true,
            deathMarkersEnabled: true,
            foodSourcesEnabled: true,
            atmosphere: {
              base: {
                trailAlpha: 0.6,
                fogColor: "rgba(0, 200, 100, 0.5)",
                fogIntensity: 0.3,
                fogOpacity: 0.6,
              },
              activeEvent: null,
            },
          },
          sidebarOpen: true,
          headerCollapsed: false, // Start with header expanded
          rendererMode: "canvas", // Start with Canvas renderer (WebGL is experimental)
        },
      }))
    );

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
          physics: profile.physics || defaultWorldPhysics,
        },
        // Reset simulation state
        simulation: {
          obstacles: [],
          foodSources: [],
          deathMarkers: [],
        },
        // Keep UI preferences
        ui: store.getState().ui,
      });
    }

    return { store, useStore, loadProfile };
  },
  halt: () => {
    // No cleanup needed for zustand store
  },
});

export type RuntimeStoreResource = StartedResource<typeof runtimeStore>;
