/**
 * Pure functions to map boids into various representations
 */

import { ItemWithDistance } from './spatialHash'
import { Boid } from './vocabulary/schemas/entities'
import { SpeciesConfig } from './vocabulary/schemas/species'

export function boidsBySpecies(boids: Boid[]) {
  return boids.reduce(
    (acc, boid) => {
      if (!acc[boid.typeId]) {
        acc[boid.typeId] = []
      }
      acc[boid.typeId].push(boid)
      return acc
    },
    {} as Record<Boid['typeId'], Boid[]>
  )
}

export function boidsToEnergy(boids: Boid[]) {
  return boids.map((boid) => boid.energy)
}

export function boidsToAge(boids: Boid[]) {
  return boids.map((boid) => boid.age)
}

export function boidsToStance(boids: Boid[]) {
  return boids.map((boid) => boid.stance)
}

/**
 *
 *
 * Previously this function used typeId matching which caused predators to attack each other.
 * Now it properly uses the species config to determine if a boid is prey or predator.
 */
export function getNearbyBoidsByRole(
  boid: Boid,
  nearbyBoids: ItemWithDistance<Boid>[],
  speciesConfig?: Record<string, SpeciesConfig>
) {
  const result = {
    nearbyPrey: [] as ItemWithDistance<Boid>[],
    nearbyPredators: [] as ItemWithDistance<Boid>[],
  }

  for (const { item: nearbyBoid, distance } of nearbyBoids) {
    if (nearbyBoid.id === boid.id) continue

    if (speciesConfig) {
      const nearbyConfig = speciesConfig[nearbyBoid.typeId]
      if (nearbyConfig) {
        if (nearbyConfig.role === 'prey') {
          result.nearbyPrey.push({ item: nearbyBoid, distance })
        } else if (nearbyConfig.role === 'predator') {
          result.nearbyPredators.push({ item: nearbyBoid, distance })
        }
        continue
      }
    }

    if (nearbyBoid.typeId === boid.typeId) {
      result.nearbyPrey.push({ item: nearbyBoid, distance })
    } else {
      result.nearbyPredators.push({ item: nearbyBoid, distance })
    }
  }

  return result
}
