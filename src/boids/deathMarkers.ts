import type { DeathMarker } from "../vocabulary/schemas/prelude";
import { calculateDistance } from "./calculations";
import type { Boid } from "./types";

/**
 * Death Marker Management System
 *
 * Pure functions for managing death markers in the ecosystem.
 * Death markers create danger zones that prey avoid, representing
 * areas where deaths have occurred (starvation/old age).
 */

// ============================================
// Constants
// ============================================

export const DEATH_MARKER_CONSTANTS = {
  CONSOLIDATION_RADIUS: 100, // Nearby deaths merge into existing markers
  INITIAL_STRENGTH: 1.0, // Starting repulsion strength
  STRENGTH_INCREMENT: 0.5, // Strength gain per consolidated death
  MAX_STRENGTH: 5.0, // Maximum repulsion strength
  INITIAL_TICKS: 10, // Starting lifetime
  MAX_LIFETIME_TICKS: 20, // Maximum lifetime (prevents immortal markers)
} as const;

// ============================================
// Types
// ============================================

export type DeathMarkerUpdate = {
  markers: DeathMarker[];
  shouldUpdate: boolean;
};

export type DeathEvent = {
  boidId: string;
  reason: "old_age" | "starvation" | "predation";
};

// ============================================
// Pure Logic Functions
// ============================================

/**
 * Find nearby markers within consolidation radius
 */
function findNearbyMarkers(
  markers: DeathMarker[],
  position: { x: number; y: number },
  radius: number
): number[] {
  const nearbyIndexes: number[] = [];

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const dist = calculateDistance(marker.position, position);

    if (dist < radius) {
      nearbyIndexes.push(i);
    }
  }

  return nearbyIndexes;
}

/**
 * Create a new death marker
 */
function createDeathMarker(
  position: { x: number; y: number },
  typeId: string
): DeathMarker {
  return {
    position: { x: position.x, y: position.y },
    remainingTicks: DEATH_MARKER_CONSTANTS.INITIAL_TICKS,
    strength: DEATH_MARKER_CONSTANTS.INITIAL_STRENGTH,
    maxLifetimeTicks: DEATH_MARKER_CONSTANTS.MAX_LIFETIME_TICKS,
    typeId,
  };
}

/**
 * Strengthen an existing marker (consolidation)
 */
function strengthenMarker(marker: DeathMarker): DeathMarker {
  return {
    ...marker,
    strength: Math.min(
      marker.strength + DEATH_MARKER_CONSTANTS.STRENGTH_INCREMENT,
      DEATH_MARKER_CONSTANTS.MAX_STRENGTH
    ),
    remainingTicks: Math.min(
      marker.remainingTicks + DEATH_MARKER_CONSTANTS.INITIAL_TICKS,
      marker.maxLifetimeTicks
    ),
  };
}

/**
 * Process death events and update markers
 * Pure function - returns new marker array
 */
export function processDeathMarkers(
  currentMarkers: DeathMarker[],
  deathEvents: DeathEvent[],
  getBoidById: (id: string) => Boid | undefined
): DeathMarkerUpdate {
  const updatedMarkers = [...currentMarkers];
  let hasChanges = false;

  for (const { boidId, reason } of deathEvents) {
    // Only create markers for natural deaths (starvation/old age)
    // Predation deaths create food sources instead
    if (reason !== "starvation" && reason !== "old_age") {
      continue;
    }

    const boid = getBoidById(boidId);
    if (!boid) continue;

    // Find nearby markers to consolidate
    const nearbyIndexes = findNearbyMarkers(
      updatedMarkers,
      boid.position,
      DEATH_MARKER_CONSTANTS.CONSOLIDATION_RADIUS
    );

    if (nearbyIndexes.length > 0) {
      // Strengthen existing nearby markers
      for (const index of nearbyIndexes) {
        updatedMarkers[index] = strengthenMarker(updatedMarkers[index]);
      }
      hasChanges = true;
    } else {
      // Create new marker
      updatedMarkers.push(createDeathMarker(boid.position, boid.typeId));
      hasChanges = true;
    }
  }

  return {
    markers: updatedMarkers,
    shouldUpdate: hasChanges,
  };
}

/**
 * Fade death markers over time
 * Pure function - decrements ticks and filters expired markers
 */
export function fadeDeathMarkers(
  currentMarkers: DeathMarker[]
): DeathMarkerUpdate {
  // Skip if no markers
  if (currentMarkers.length === 0) {
    return { markers: currentMarkers, shouldUpdate: false };
  }

  // Decrement ticks and filter expired markers
  const updatedMarkers = currentMarkers
    .map((marker) => ({
      ...marker,
      remainingTicks: marker.remainingTicks - 1,
    }))
    .filter((marker) => marker.remainingTicks > 0);

  // Always update (ticks change even if length doesn't)
  return {
    markers: updatedMarkers,
    shouldUpdate: true,
  };
}

/**
 * Check if markers have changed (for optimization)
 */
export function haveMarkersChanged(
  oldMarkers: DeathMarker[],
  newMarkers: DeathMarker[]
): boolean {
  if (oldMarkers.length !== newMarkers.length) return true;

  return newMarkers.some(
    (marker, idx) =>
      marker.remainingTicks !== oldMarkers[idx]?.remainingTicks ||
      marker.strength !== oldMarkers[idx]?.strength
  );
}
