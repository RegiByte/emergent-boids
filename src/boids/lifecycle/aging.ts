import type { Boid } from '../vocabulary/schemas/entities'
import { hasDiedFromOldAge, hasDiedFromStarvation } from '../predicates'

import { SpeciesConfig } from '../vocabulary/schemas/species'

/**
 * Update age for a single boid
 * Returns new age value
 */
export function updateBoidAge(boid: Boid, deltaSeconds: number): number {
  return boid.age + deltaSeconds
}

/**
 * Check if boid should die and return death reason
 */
export function checkBoidDeath(
  boid: Boid,
  speciesConfig: SpeciesConfig
): 'old_age' | 'starvation' | null {
  if (hasDiedFromOldAge(boid)) {
    return 'old_age'
  }
  if (speciesConfig.role === 'predator' && hasDiedFromStarvation(boid)) {
    return 'starvation'
  }
  return null
}
