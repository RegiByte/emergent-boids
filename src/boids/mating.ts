import {
  calculateDistance,
  calculateOffspringPosition,
  calculateReproductionEnergyCost,
} from './calculations'
import { lookupBoid } from './conversions'
import { iterateBoids } from './iterators'
import { isEligibleMate } from './predicates'
import type {
  Boid,
  BoidsById,
  OffspringData,
} from './vocabulary/schemas/entities'
import { SpeciesConfig } from './vocabulary/schemas/species'
import { SimulationParameters } from './vocabulary/schemas/world'

/**
 * Pure mating state machine
 * Handles all mating logic in a declarative, side-effect free way
 */

export type BoidUpdates = {
  energy: number
  reproductionCooldown: number
  matingBuildupCounter: number
  mateId: string | null
  seekingMate: boolean
}

export type MatingResult =
  | { type: 'no_action' }
  | { type: 'pair_found'; mateId: string; updates: BoidUpdates }
  | { type: 'building_up'; buildup: number; updates: BoidUpdates }
  | { type: 'buildup_reset'; updates: BoidUpdates }
  | { type: 'mate_lost'; updates: BoidUpdates }
  | {
      type: 'reproduction_complete'
      offspring: OffspringData
      boidUpdates: BoidUpdates
      mateUpdates: BoidUpdates
    }

/**
 * Context for applying mating results (side effects)
 */
export type MatingContext = {
  boids: BoidsById
  matedBoids: Set<string>
  boidsToAdd: OffspringData[]
}

/**
 * Find nearest eligible mate within radius
 */
export function findNearbyMate(
  boid: Boid,
  allBoids: BoidsById,
  alreadyMated: Set<string>,
  mateRadius: number
): Boid | null {
  for (const other of iterateBoids(allBoids)) {
    if (isEligibleMate(other, boid, alreadyMated)) {
      const distance = calculateDistance(boid.position, other.position)
      if (distance < mateRadius) {
        return other
      }
    }
  }
  return null
}

/**
 * Process asexual reproduction for a boid
 * Returns the result of asexual reproduction without side effects
 */
export function processAsexualReproduction(
  boid: Boid,
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig
): MatingResult {
  const reproductionEnergy = calculateReproductionEnergyCost(
    boid.phenotype.maxEnergy
  )

  const cooldownFrames =
    speciesConfig.reproduction.cooldownFrames ??
    parameters.reproductionCooldownFrames

  return {
    type: 'reproduction_complete',
    offspring: {
      parent1Id: boid.id,
      parent2Id: undefined, // No second parent for asexual
      typeId: boid.typeId,
      position: boid.position, // Spawn at parent's position
    },
    boidUpdates: {
      energy: reproductionEnergy,
      reproductionCooldown: cooldownFrames, // Use type-specific or global cooldown
      matingBuildupCounter: 0,
      mateId: null,
      seekingMate: false,
    },
    mateUpdates: {
      energy: 0,
      reproductionCooldown: 0,
      matingBuildupCounter: 0,
      mateId: null,
      seekingMate: false,
    },
  }
}

/**
 * Process mating cycle for a boid
 * Returns the result of the mating attempt without side effects
 */
export function processMatingCycle(
  boid: Boid,
  allBoids: BoidsById,
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  matedBoids: Set<string>,
  elapsedFrames: number // how many frames have passed since last check?
): MatingResult {
  if (speciesConfig.reproduction.type === 'asexual') {
    return processAsexualReproduction(boid, parameters, speciesConfig)
  }

  if (boid.mateId) {
    const mate = lookupBoid(boid.mateId, allBoids)

    if (!mate) {
      return {
        type: 'mate_lost',
        updates: {
          energy: boid.energy,
          reproductionCooldown: boid.reproductionCooldown,
          matingBuildupCounter: 0,
          mateId: null,
          seekingMate: boid.seekingMate,
        },
      }
    }

    const distance = calculateDistance(boid.position, mate.position)

    if (distance < parameters.mateRadius) {
      const newBuildup = Math.min(
        boid.matingBuildupFrames + elapsedFrames,
        parameters.matingBuildupFrames
      )

      if (newBuildup >= parameters.matingBuildupFrames) {
        const reproductionEnergy = calculateReproductionEnergyCost(
          boid.phenotype.maxEnergy
        )

        const cooldownFrames =
          speciesConfig.reproduction.cooldownFrames ??
          parameters.reproductionCooldownFrames

        return {
          type: 'reproduction_complete',
          offspring: {
            parent1Id: boid.id,
            parent2Id: mate.id,
            typeId: boid.typeId,
            position: calculateOffspringPosition(boid.position, mate.position),
          },
          boidUpdates: {
            energy: reproductionEnergy,
            reproductionCooldown: cooldownFrames, // Use type-specific or global cooldown
            matingBuildupCounter: 0,
            mateId: null,
            seekingMate: false,
          },
          mateUpdates: {
            energy: reproductionEnergy,
            reproductionCooldown: cooldownFrames, // Use type-specific or global cooldown
            matingBuildupCounter: 0,
            mateId: null,
            seekingMate: false,
          },
        }
      }

      return {
        type: 'building_up',
        buildup: newBuildup,
        updates: {
          energy: boid.energy,
          reproductionCooldown: boid.reproductionCooldown,
          matingBuildupCounter: newBuildup,
          mateId: boid.mateId,
          seekingMate: boid.seekingMate,
        },
      }
    } else {
      return {
        type: 'buildup_reset',
        updates: {
          energy: boid.energy,
          reproductionCooldown: boid.reproductionCooldown,
          matingBuildupCounter: 0,
          mateId: boid.mateId,
          seekingMate: boid.seekingMate,
        },
      }
    }
  } else {
    const mate = findNearbyMate(
      boid,
      allBoids,
      matedBoids,
      parameters.mateRadius
    )

    if (mate) {
      return {
        type: 'pair_found',
        mateId: mate.id,
        updates: {
          energy: boid.energy,
          reproductionCooldown: boid.reproductionCooldown,
          matingBuildupCounter: boid.matingBuildupFrames,
          mateId: mate.id,
          seekingMate: boid.seekingMate,
        },
      }
    }
  }

  return { type: 'no_action' }
}

/**
 * Apply updates to a boid (side effect)
 */
export function applyBoidUpdates(boid: Boid, updates: BoidUpdates): void {
  boid.energy = updates.energy
  boid.reproductionCooldown = updates.reproductionCooldown
  boid.matingBuildupFrames = updates.matingBuildupCounter
  boid.mateId = updates.mateId
  boid.seekingMate = updates.seekingMate
}

/**
 * Increment mating buildup for both boids (side effect)
 */
export function incrementMatingBuildup(
  boid: Boid,
  mate: Boid,
  amount: number = 1
): void {
  boid.matingBuildupFrames += amount
  mate.matingBuildupFrames += amount
}

/**
 * Reset mating buildup for both boids (side effect)
 */
export function resetMatingBuildup(boid: Boid, mate: Boid): void {
  boid.matingBuildupFrames = 0
  mate.matingBuildupFrames = 0
}

/**
 * Pair two boids as mates (side effect)
 */
export function pairBoids(boid: Boid, mate: Boid): void {
  boid.mateId = mate.id
  mate.mateId = boid.id
}

/**
 * Unpair two boids (side effect)
 */
export function unpairBoids(boid: Boid, mate: Boid | null | undefined): void {
  if (mate) {
    mate.mateId = null
  }
  boid.mateId = null
}

/**
 * Apply mating result to the world (side effects)
 * Handles all cases of the mating state machine result
 *
 * This function encapsulates all side effects from mating:
 * - Updating boid states
 * - Pairing/unpairing boids
 * - Tracking mated boids
 * - Adding offspring to spawn queue
 */
export function applyMatingResult(
  boid: Boid,
  result: MatingResult,
  context: MatingContext
): void {
  const { boids, matedBoids, boidsToAdd } = context

  switch (result.type) {
    case 'reproduction_complete': {
      applyBoidUpdates(boid, result.boidUpdates)

      if (result.offspring.parent2Id) {
        const mate = lookupBoid(result.offspring.parent2Id, boids)
        if (mate) {
          applyBoidUpdates(mate, result.mateUpdates)
          matedBoids.add(result.offspring.parent2Id)
        }
      }

      matedBoids.add(boid.id)
      boidsToAdd.push(result.offspring)
      break
    }

    case 'pair_found': {
      const mate = lookupBoid(result.mateId, boids)
      if (mate) {
        pairBoids(boid, mate)
        matedBoids.add(boid.id)
        matedBoids.add(mate.id)
      }
      break
    }

    case 'building_up': {
      applyBoidUpdates(boid, result.updates)
      break
    }

    case 'buildup_reset': {
      const mate = lookupBoid(boid.mateId!, boids)
      if (mate) {
        resetMatingBuildup(boid, mate)
      }
      break
    }

    case 'mate_lost': {
      applyBoidUpdates(boid, result.updates)
      break
    }

    case 'no_action':
      break
  }
}
