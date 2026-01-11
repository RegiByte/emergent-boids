import { processMatingCycle, type MatingResult } from '../mating'
import { isReadyToMate } from '../predicates'
import type { Boid, BoidsById } from '../vocabulary/schemas/entities'
import { SimulationParameters } from '../vocabulary/schemas/world'
import { SpeciesConfig } from '../vocabulary/schemas/species'

/**
 * Process reproduction for a single boid
 * Returns mating result without side effects
 */
export function processBoidReproduction(
  boid: Boid,
  allBoids: BoidsById,
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  matedBoids: Set<string>,
  elapsedFrames: number
): MatingResult {
  const ready = isReadyToMate(boid, parameters, speciesConfig)

  if (ready && !matedBoids.has(boid.id)) {
    return processMatingCycle(
      boid,
      allBoids,
      parameters,
      speciesConfig,
      matedBoids,
      elapsedFrames
    )
  } else if (boid.mateId && !ready) {
    return {
      type: 'mate_lost',
      updates: {
        energy: boid.energy,
        reproductionCooldown: boid.reproductionCooldown,
        matingBuildupCounter: 0,
        mateId: null,
        seekingMate: false,
      },
    }
  }

  return { type: 'no_action' }
}
