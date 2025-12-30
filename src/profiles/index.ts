/**
 * Profile Registry - Central registry of all available simulation profiles
 *
 * Session 69: Simplified to single stable-ecosystem profile for migration.
 * Future profiles can be added following the genome-based format.
 *
 * To add a new profile:
 * 1. Create a new file in this directory
 * 2. Define your SimulationProfile with baseGenome and visualConfig
 * 3. Import and add it to the profiles object below
 * 4. Users can then select it from the UI
 */

import { stableEcosystemProfile } from "./stable-ecosystem";

import type { SimulationProfile } from "../boids/vocabulary/schemas/prelude.ts";

/**
 * All available simulation profiles
 * Key = profile ID, Value = profile definition
 */
export const profiles: Record<string, SimulationProfile> = {
  "stable-ecosystem": stableEcosystemProfile,
};

/**
 * Default profile to load on startup
 */
export const defaultProfileId = "stable-ecosystem";

/**
 * Helper to get a profile by ID (with error handling)
 */
export function getProfile(profileId: string): SimulationProfile {
  const profile = profiles[profileId];
  if (!profile) {
    throw new Error(
      `Profile not found: ${profileId}. Available profiles: ${Object.keys(
        profiles
      ).join(", ")}`
    );
  }
  return profile;
}

/**
 * Get list of all profile IDs
 */
export function getProfileIds(): string[] {
  return Object.keys(profiles);
}

/**
 * Get list of all profiles with metadata
 */
export function getProfileList(): Array<{
  id: string;
  name: string;
  description: string;
}> {
  return Object.values(profiles).map((profile) => ({
    id: profile.id,
    name: profile.name,
    description: profile.description,
  }));
}
