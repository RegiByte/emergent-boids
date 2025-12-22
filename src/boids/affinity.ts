import type {
  SpeciesConfig,
  SpeciesRecord,
} from "./vocabulary/schemas/prelude.ts";

/**
 * Affinity System - Inter-species relationship management
 *
 * Affinities modulate flocking behavior between species pairs:
 * - High affinity (0.8-1.0): Species flock together strongly
 * - Medium affinity (0.4-0.7): Species tolerate each other, loose association
 * - Low affinity (0.0-0.3): Species actively separate, avoid clustering
 * - Negative affinity (-0.5-0.0): Species repel each other (competition)
 *
 * Simple relationship rules create emergent social structures
 */

// ============================================
// Constants
// ============================================

/**
 * Minimum affinity threshold for cohesion behavior
 * Boids only flock with species above this threshold
 */
export const COHESION_AFFINITY_THRESHOLD = 0.5;

/**
 * Default affinity when not explicitly configured
 * Neutral value allows moderate interaction
 */
export const DEFAULT_AFFINITY = 0.5;

/**
 * Affinity for same species when not explicitly configured
 * Same-species boids naturally have high affinity
 */
export const SAME_SPECIES_AFFINITY = 1.0;

// ============================================
// Helper Functions
// ============================================

/**
 * Get affinity between two species
 *
 * Affinity is asymmetric - Species A's affinity for B may differ from B's for A.
 * This allows for interesting dynamics like parasitic relationships.
 *
 * @param speciesA - The species whose affinity we're checking
 * @param speciesB - The target species
 * @param speciesConfigA - Configuration for species A (contains affinity map)
 * @returns Affinity value from -1.0 (repel) to 1.0 (attract)
 *
 * @example
 * // Explorer likes socials (0.7), but socials might like explorers differently
 * const affinity = getAffinity("explorer", "social", explorerConfig); // 0.7
 */
export function getAffinity(
  speciesA: string,
  speciesB: string,
  speciesConfigA: SpeciesConfig
): number {
  // Same species always have high affinity (unless explicitly overridden)
  if (speciesA === speciesB) {
    const explicitAffinity = speciesConfigA.affinities?.[speciesB];
    return explicitAffinity !== undefined
      ? explicitAffinity
      : SAME_SPECIES_AFFINITY;
  }

  // Check configured affinity
  const affinity = speciesConfigA.affinities?.[speciesB];

  // Default to neutral if not configured
  return affinity !== undefined ? affinity : DEFAULT_AFFINITY;
}

/**
 * Calculate separation modifier based on affinity
 *
 * Low affinity increases separation force (avoid clustering)
 * High affinity decreases separation force (allow clustering)
 *
 * @param affinity - Affinity value (-1.0 to 1.0)
 * @returns Separation multiplier (0.0 to 2.0)
 *
 * @example
 * // Low affinity (0.2) = 1.8x separation (push apart)
 * // High affinity (0.9) = 1.1x separation (allow close)
 * // Negative affinity (-0.5) = 2.5x separation (strong repulsion)
 */
export function getSeparationModifier(affinity: number): number {
  // Formula: 1.0 + (1.0 - affinity)
  // - affinity 1.0 → modifier 1.0 (normal separation)
  // - affinity 0.5 → modifier 1.5 (moderate separation)
  // - affinity 0.0 → modifier 2.0 (strong separation)
  // - affinity -0.5 → modifier 2.5 (very strong separation)
  return 1.0 + (1.0 - affinity);
}

/**
 * Check if two species should flock together (cohesion/alignment)
 *
 * Only species with affinity above the threshold will flock together.
 * This prevents low-affinity species from forming superclusters.
 *
 * @param affinity - Affinity value (-1.0 to 1.0)
 * @returns True if species should flock together
 */
export function shouldFlock(affinity: number): boolean {
  return affinity >= COHESION_AFFINITY_THRESHOLD;
}

/**
 * Get cohesion weight based on affinity
 *
 * Returns the weight to apply to a neighbor's position when calculating cohesion.
 * Higher affinity = stronger pull toward that neighbor.
 *
 * @param affinity - Affinity value (-1.0 to 1.0)
 * @returns Weight multiplier (0.0 to 1.0)
 */
export function getCohesionWeight(affinity: number): number {
  // Only apply weight if above threshold
  if (!shouldFlock(affinity)) {
    return 0.0;
  }

  // Return affinity as weight (0.5-1.0 range when above threshold)
  return affinity;
}

/**
 * Get the maximum crowd tolerance from all species
 * @param speciesConfig - The species configuration
 * @returns The maximum crowd tolerance
 */
export function getMaxCrowdTolerance(speciesConfig: SpeciesRecord): number {
  return Object.values(speciesConfig).reduce((max, species) => {
    return Math.max(max, species.movement.crowdAversionThreshold);
  }, 0);
}
