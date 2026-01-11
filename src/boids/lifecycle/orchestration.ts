import type { LifecycleUpdateContext } from '../context'
import { lookupBoid } from '../conversions'
import { iterateBoids } from '../iterators'
import type { MatingContext } from '../mating'
import { applyMatingResult, unpairBoids } from '../mating'
import { isReadyToMate } from '../predicates'
import type { BoidsById, OffspringData } from '../vocabulary/schemas/entities'
import { updateBoidAge } from './aging'
import { updateBoidCooldowns } from './cooldowns'
import { updateBoidEnergy } from './energy'
import { getDeathCause, isDead, regenerateHealth } from './health'
import { processBoidReproduction } from './reproduction'

/**
 * Process all lifecycle updates for all boids
 * Returns collections of changes to apply
 */
export function processLifecycleUpdates(
  boids: BoidsById,
  context: LifecycleUpdateContext
): {
  boidsToRemove: string[]
  boidsToAdd: OffspringData[]
  deathEvents: Array<{
    boidId: string
    reason: 'old_age' | 'starvation' | 'predation'
  }>
  reproductionEvents: Array<{
    parent1Id: string
    parent2Id?: string
    typeId: string
  }>
} {
  const { config, deltaSeconds } = context
  const { parameters, species: speciesTypes } = config

  const boidsToRemove: string[] = []
  const boidsToAdd: OffspringData[] = []
  const deathEvents: Array<{
    boidId: string
    reason: 'old_age' | 'starvation' | 'predation'
  }> = []
  const reproductionEvents: Array<{
    parent1Id: string
    parent2Id?: string
    typeId: string
  }> = []
  const matedBoids = new Set<string>()

  for (const boid of iterateBoids(boids)) {
    const speciesConfig = speciesTypes[boid.typeId]
    if (!speciesConfig) continue

    boid.age = updateBoidAge(boid, deltaSeconds)

    if (isDead(boid)) {
      const maxAge = boid.phenotype.maxAge
      const deathReason = getDeathCause(boid, maxAge)
      boidsToRemove.push(boid.id)
      deathEvents.push({ boidId: boid.id, reason: deathReason })
      continue // Skip remaining updates for dead boid
    }

    boid.energy = updateBoidEnergy(boid, speciesConfig, deltaSeconds)

    boid.health = regenerateHealth(boid).health

    const cooldowns = updateBoidCooldowns(boid)
    boid.reproductionCooldown = cooldowns.reproductionCooldown
    boid.eatingCooldownFrames = cooldowns.eatingCooldown
    boid.attackCooldownFrames = cooldowns.attackCooldown

    boid.seekingMate = isReadyToMate(boid, parameters, speciesConfig)

    const matingResult = processBoidReproduction(
      boid,
      boids,
      parameters,
      speciesConfig,
      matedBoids,
      0 // TODO: remove this logic from here, already covered in the engine update loop
    )

    const context: MatingContext = { boids, matedBoids, boidsToAdd }
    applyMatingResult(boid, matingResult, context)

    if (matingResult.type === 'reproduction_complete') {
      reproductionEvents.push({
        parent1Id: matingResult.offspring.parent1Id,
        parent2Id: matingResult.offspring.parent2Id,
        typeId: matingResult.offspring.typeId,
      })
      boid.mateCommitmentFrames = 0
    } else if (matingResult.type === 'mate_lost') {
      const mate = lookupBoid(boid.mateId!, boids)
      unpairBoids(boid, mate)
      boid.mateCommitmentFrames = 0
    } else if (matingResult.type === 'pair_found') {
      boid.mateCommitmentFrames = 0
    } else if (boid.mateId !== null) {
      boid.mateCommitmentFrames++
    }
  }

  return { boidsToRemove, boidsToAdd, deathEvents, reproductionEvents }
}

export type LifecycleUpdates = ReturnType<typeof processLifecycleUpdates>
