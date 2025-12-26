/**
 * Profile Store - Manages simulation profiles (built-in and custom)
 *
 * Architecture:
 * - Domain-based pattern: { data, config }
 * - Separate from runtime store (clean boundaries)
 * - Zustand for React integration
 * - Pure profile switching logic
 *
 * Philosophy:
 * "Profiles are immutable configurations. Switching profiles is a controlled event."
 */

import { defineResource, StartedResource } from "braided";
import { createStore, StoreApi, useStore as useZustandStore } from "zustand";
import { devtools } from "zustand/middleware";
import { profiles as builtInProfiles } from "@/profiles";
import { SimulationProfile } from "@/boids/vocabulary/schemas/prelude";

/**
 * Profile Store State
 *
 * Follows domain-based architecture:
 * - data: High-frequency updates (active profile, available profiles)
 * - config: Low-frequency updates (settings, preferences)
 */
export type ProfileStore = {
  profiles: {
    data: {
      // Built-in profiles from profiles/ directory
      builtIn: Record<string, SimulationProfile>;
      // Custom profiles created by user (empty for now, ready for future)
      custom: Record<string, SimulationProfile>;
      // Currently active profile ID
      activeProfileId: string;
    };
    config: {
      // Enable/disable custom profile creation (future feature)
      enableCustomProfiles: boolean;
      // Auto-save custom profiles to localStorage (future feature)
      autoSave: boolean;
    };
  };
};

export type ProfileStoreApi = StoreApi<ProfileStore>;

export const profileStore = defineResource({
  dependencies: [],
  start: () => {
    // Get default profile ID (stable-ecosystem)
    const defaultProfileId = Object.keys(builtInProfiles)[0] || "stable-ecosystem";

    // Create zustand store with built-in profiles
    const store = createStore<ProfileStore>()(
      devtools(
        () => ({
          profiles: {
            data: {
              builtIn: builtInProfiles,
              custom: {}, // Empty initially, ready for future localStorage integration
              activeProfileId: defaultProfileId,
            },
            config: {
              enableCustomProfiles: false, // Disabled for now (no profile editor UI)
              autoSave: false, // No persistence yet (deferred to avoid schema migration complexity)
            },
          },
        }),
        { name: "ProfileStore" }
      )
    );

    function useStore<T>(selector: (_state: ProfileStore) => T): T {
      return useZustandStore(store, selector);
    }

    /**
     * Get active profile
     * Returns the currently loaded simulation profile
     */
    function getActiveProfile(): SimulationProfile {
      const state = store.getState();
      const { activeProfileId, builtIn, custom } = state.profiles.data;

      // Check built-in profiles first, then custom
      const profile = builtIn[activeProfileId] || custom[activeProfileId];

      if (!profile) {
        throw new Error(
          `Active profile not found: ${activeProfileId}. Available built-in: ${Object.keys(builtIn).join(", ")}`
        );
      }

      return profile;
    }

    /**
     * Get profile by ID
     * Checks built-in and custom profiles
     */
    function getProfileById(profileId: string): SimulationProfile | null {
      const state = store.getState();
      const { builtIn, custom } = state.profiles.data;

      return builtIn[profileId] || custom[profileId] || null;
    }

    /**
     * Get all available profiles (built-in + custom)
     * Returns array of profile metadata for UI display
     */
    function getAllProfiles(): Array<{
      id: string;
      name: string;
      description: string;
      isCustom: boolean;
    }> {
      const state = store.getState();
      const { builtIn, custom } = state.profiles.data;

      const builtInList = Object.values(builtIn).map((profile) => ({
        id: profile.id,
        name: profile.name,
        description: profile.description,
        isCustom: false,
      }));

      const customList = Object.values(custom).map((profile) => ({
        id: profile.id,
        name: profile.name,
        description: profile.description,
        isCustom: true,
      }));

      return [...builtInList, ...customList];
    }

    /**
     * Set active profile
     * Updates the activeProfileId in store
     * Does NOT trigger simulation reset - that's handled by event system
     */
    function setActiveProfile(profileId: string) {
      const profile = getProfileById(profileId);
      if (!profile) {
        throw new Error(
          `Cannot set active profile: Profile not found: ${profileId}`
        );
      }

      store.setState((state) => ({
        profiles: {
          ...state.profiles,
          data: {
            ...state.profiles.data,
            activeProfileId: profileId,
          },
        },
      }));
    }

    return {
      store,
      useStore,
      getActiveProfile,
      getProfileById,
      getAllProfiles,
      setActiveProfile,
    };
  },
  halt: () => {
    // No cleanup needed for zustand store
  },
});

export type ProfileStoreResource = StartedResource<typeof profileStore>;

