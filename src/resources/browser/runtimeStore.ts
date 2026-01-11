import { defineResource, StartedResource } from 'braided'
import { useStore as useZustandStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { createStore } from 'zustand/vanilla'
import { defaultProfileId, getProfile } from '../../profiles'
import { devtools } from 'zustand/middleware'

import { RuntimeStore } from '../../boids/vocabulary/schemas/state.ts'
import { defaultWorldPhysics } from '@/boids/defaultPhysics.ts'
import { SystemConfigResource } from '../shared/config.ts'

export type RuntimeStoreApi = StoreApi<RuntimeStore>

export const runtimeStore = defineResource({
  dependencies: ['config'],
  start: ({ config }: { config: SystemConfigResource }) => {
    const profile = getProfile(defaultProfileId)

    const {
      width,
      height,
      backgroundColor,
      initialPreyCount,
      initialPredatorCount,
    } = profile.world

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
            energyBarsEnabled: true,
            healthBarsEnabled: true, // NEW: Show health bars for wounded boids
            matingHeartsEnabled: true,
            stanceSymbolsEnabled: true,
            deathMarkersEnabled: true,
            foodSourcesEnabled: true,
            atmosphere: {
              base: {
                trailAlpha: 0.6,
                fogColor: 'rgba(0, 200, 100, 0.5)',
                fogIntensity: 0.3,
                fogOpacity: 0.6,
              },
              activeEvent: null,
            },
          },
          sidebarOpen: true,
          headerCollapsed: false, // Start with header expanded
          rendererMode: config.getConfig().renderMode, // Start with Canvas renderer (WebGL is experimental)
          debugMode: false,
        },
      }))
    )

    function useStore<T>(selector: (_state: RuntimeStore) => T): T {
      return useZustandStore(store, selector)
    }

    /**
     * Load a different profile (resets simulation state)
     * TODO: Add UI control to switch profiles
     */
    function loadProfile(profileId: string) {
      const profile = getProfile(profileId)

      store.setState({
        config: {
          profileId: profile.id,
          world: store.getState().config.world, // Keep canvas size
          species: profile.species,
          parameters: profile.parameters,
          physics: profile.physics || defaultWorldPhysics,
        },
        simulation: {
          obstacles: [],
          foodSources: [],
          deathMarkers: [],
        },
        ui: store.getState().ui,
      })
    }

    return { store, useStore, loadProfile }
  },
  halt: () => {},
})

export type RuntimeStoreResource = StartedResource<typeof runtimeStore>
