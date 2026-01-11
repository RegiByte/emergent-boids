import type { DeathMarker } from './vocabulary/schemas/entities'
import { calculateDistance } from './calculations'
import type { Boid } from './vocabulary/schemas/entities'

/**
 * Death Marker Management System
 *
 * Pure functions for managing death markers in the ecosystem.
 * Death markers create danger zones that prey avoid, representing
 * areas where deaths have occurred (starvation/old age).
 */

export const DEATH_MARKER_CONSTANTS = {
  CONSOLIDATION_RADIUS: 100, // Nearby deaths merge into existing markers
  INITIAL_STRENGTH: 1.0, // Starting repulsion strength
  STRENGTH_INCREMENT: 0.5, // Strength gain per consolidated death
  MAX_STRENGTH: 5.0, // Maximum repulsion strength
  INITIAL_FRAMES: 300, // Starting lifetime
  MAX_LIFETIME_FRAMES: 600, // Maximum lifetime (prevents immortal markers)
} as const

export type DeathMarkerUpdate = {
  markers: DeathMarker[]
  shouldUpdate: boolean
}

export type DeathEvent = {
  boidId: string
  reason: 'old_age' | 'starvation' | 'predation'
}

/**
 * Find nearby markers within consolidation radius
 */
function findNearbyMarkers(
  markers: DeathMarker[],
  position: { x: number; y: number },
  radius: number
): number[] {
  const nearbyIndexes: number[] = []

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    const dist = calculateDistance(marker.position, position)

    if (dist < radius) {
      nearbyIndexes.push(i)
    }
  }

  return nearbyIndexes
}

/**
 * Create a new death marker
 */
function createDeathMarker(
  position: { x: number; y: number },
  typeId: string
): DeathMarker {
  const now = performance.now()
  const randomId = Math.random().toString(36).substring(2, 15)
  return {
    id: `deathMarker:${now}-${randomId}`,
    position: { x: position.x, y: position.y },
    remainingFrames: DEATH_MARKER_CONSTANTS.INITIAL_FRAMES,
    strength: DEATH_MARKER_CONSTANTS.INITIAL_STRENGTH,
    maxLifetimeFrames: DEATH_MARKER_CONSTANTS.MAX_LIFETIME_FRAMES,
    typeId,
  }
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
    remainingFrames: Math.min(
      marker.remainingFrames + DEATH_MARKER_CONSTANTS.INITIAL_FRAMES,
      marker.maxLifetimeFrames
    ),
  }
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
  const updatedMarkers = [...currentMarkers]
  let hasChanges = false

  for (const { boidId, reason } of deathEvents) {
    if (reason !== 'starvation' && reason !== 'old_age') {
      continue
    }

    const boid = getBoidById(boidId)
    if (!boid) continue

    const nearbyIndexes = findNearbyMarkers(
      updatedMarkers,
      boid.position,
      DEATH_MARKER_CONSTANTS.CONSOLIDATION_RADIUS
    )

    if (nearbyIndexes.length > 0) {
      for (const index of nearbyIndexes) {
        updatedMarkers[index] = strengthenMarker(updatedMarkers[index])
      }
      hasChanges = true
    } else {
      updatedMarkers.push(createDeathMarker(boid.position, boid.typeId))
      hasChanges = true
    }
  }

  return {
    markers: updatedMarkers,
    shouldUpdate: hasChanges,
  }
}

/**
 * Fade death markers over time
 * Pure function - decrements frames and filters expired markers
 */
export function fadeDeathMarkers(
  currentMarkers: DeathMarker[]
): DeathMarkerUpdate {
  if (currentMarkers.length === 0) {
    return { markers: currentMarkers, shouldUpdate: false }
  }

  const updatedMarkers = currentMarkers
    .map((marker) => ({
      ...marker,
      remainingFrames: marker.remainingFrames - 1,
    }))
    .filter((marker) => marker.remainingFrames > 0)

  return {
    markers: updatedMarkers,
    shouldUpdate: true,
  }
}

/**
 * Check if markers have changed (for optimization)
 */
export function haveMarkersChanged(
  oldMarkers: DeathMarker[],
  newMarkers: DeathMarker[]
): boolean {
  if (oldMarkers.length !== newMarkers.length) return true

  return newMarkers.some(
    (marker, idx) =>
      marker.remainingFrames !== oldMarkers[idx]?.remainingFrames ||
      marker.strength !== oldMarkers[idx]?.strength
  )
}
