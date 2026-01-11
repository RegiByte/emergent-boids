import type { Boid } from '../vocabulary/schemas/entities'

import { SpeciesConfig } from '../vocabulary/schemas/species'

/**
 * Update energy for a single boid based on its role and stance
 * Returns new energy value
 */
export function updateBoidEnergy(
  boid: Boid,
  speciesConfig: SpeciesConfig,
  deltaSeconds: number
): number {
  const energyLossRate = boid.phenotype.energyLossRate

  if (speciesConfig.role === 'predator') {
    if (boid.stance === 'idle' || boid.stance === 'eating') {
      return boid.energy
    } else {
      return boid.energy - energyLossRate * deltaSeconds
    }
  } else {
    if (boid.stance === 'fleeing') {
      return boid.energy - energyLossRate * deltaSeconds * 2
    } else if (boid.stance === 'eating') {
      return boid.energy
    } else {
      return boid.energy - energyLossRate * deltaSeconds
    }
  }
}
