import { iterateBoids } from '../iterators'
import type { Boid, BoidsById } from '../vocabulary/schemas/entities'
import type { SpeciesConfig } from '../vocabulary/schemas/species'
import { colorDistance } from '@/lib/colors'

/**
 * Statistics for a single trait across a population
 */
export interface TraitStats {
  mean: number
  min: number
  max: number
  stdDev: number
}

/**
 * Body part statistics
 */
export interface BodyPartStats {
  avgPartsPerBoid: number
  minParts: number
  maxParts: number
  partTypeCounts: Record<string, number>
}

/**
 * Mutation tracking counters
 */
export interface MutationCounters {
  traitMutations: number
  colorMutations: number
  bodyPartMutations: number
  totalOffspring: number
}

/**
 * Complete genetics statistics for a species
 */
export interface GeneticsStats {
  generationDistribution: Record<string, number>
  maxGeneration: number
  avgGeneration: number
  traits: {
    speed: TraitStats
    size: TraitStats
    vision: TraitStats
    force: TraitStats
    aggression: TraitStats
    sociability: TraitStats
    efficiency: TraitStats
    fearResponse: TraitStats
    maturityRate: TraitStats
    longevity: TraitStats
  }
  colorDiversity: number
  uniqueColors: number
  bodyPartStats: BodyPartStats
  mutationsSinceLastSnapshot: MutationCounters
}

/**
 * Compute statistics for a single trait
 */
function computeTraitStats(values: number[]): TraitStats {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, stdDev: 0 }
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  const min = Math.min(...values)
  const max = Math.max(...values)

  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2))
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length
  const stdDev = Math.sqrt(variance)

  return { mean, min, max, stdDev }
}

/**
 * Quantize color to reduce noise (round LAB components to nearest 5)
 * Returns a string key for counting unique colors
 */
function quantizeColor(color: string): string {
  try {
    return color.substring(0, 5) // "#XXYY" - groups similar colors
  } catch {
    return color
  }
}

/**
 * Compute genetics statistics for a single species
 *
 * @param boids - All boids of this species
 * @param speciesConfig - Species configuration (for base color comparison)
 * @param mutationCounters - Mutation counters since last snapshot
 * @returns Complete genetics statistics
 */
export function computeGeneticsStats(
  boids: Boid[],
  speciesConfig: SpeciesConfig,
  mutationCounters: MutationCounters
): GeneticsStats {
  if (boids.length === 0) {
    return {
      generationDistribution: {},
      maxGeneration: 0,
      avgGeneration: 0,
      traits: {
        speed: { mean: 0, min: 0, max: 0, stdDev: 0 },
        size: { mean: 0, min: 0, max: 0, stdDev: 0 },
        vision: { mean: 0, min: 0, max: 0, stdDev: 0 },
        force: { mean: 0, min: 0, max: 0, stdDev: 0 },
        aggression: { mean: 0, min: 0, max: 0, stdDev: 0 },
        sociability: { mean: 0, min: 0, max: 0, stdDev: 0 },
        efficiency: { mean: 0, min: 0, max: 0, stdDev: 0 },
        fearResponse: { mean: 0, min: 0, max: 0, stdDev: 0 },
        maturityRate: { mean: 0, min: 0, max: 0, stdDev: 0 },
        longevity: { mean: 0, min: 0, max: 0, stdDev: 0 },
      },
      colorDiversity: 0,
      uniqueColors: 0,
      bodyPartStats: {
        avgPartsPerBoid: 0,
        minParts: 0,
        maxParts: 0,
        partTypeCounts: {},
      },
      mutationsSinceLastSnapshot: mutationCounters,
    }
  }

  const generationDistribution: Record<string, number> = {}
  let maxGeneration = 0
  let totalGenerations = 0

  for (const boid of boids) {
    const gen = boid.genome.generation
    generationDistribution[gen.toString()] =
      (generationDistribution[gen.toString()] || 0) + 1
    maxGeneration = Math.max(maxGeneration, gen)
    totalGenerations += gen
  }

  const avgGeneration = totalGenerations / boids.length

  const speeds = boids.map((b) => b.genome.traits.speed)
  const sizes = boids.map((b) => b.genome.traits.size)
  const visions = boids.map((b) => b.genome.traits.vision)
  const forces = boids.map((b) => b.genome.traits.force)
  const aggressions = boids.map((b) => b.genome.traits.aggression)
  const sociabilities = boids.map((b) => b.genome.traits.sociability)
  const efficiencies = boids.map((b) => b.genome.traits.efficiency)
  const fearResponses = boids.map((b) => b.genome.traits.fearResponse)
  const maturityRates = boids.map((b) => b.genome.traits.maturityRate)
  const longevities = boids.map((b) => b.genome.traits.longevity)

  const traits = {
    speed: computeTraitStats(speeds),
    size: computeTraitStats(sizes),
    vision: computeTraitStats(visions),
    force: computeTraitStats(forces),
    aggression: computeTraitStats(aggressions),
    sociability: computeTraitStats(sociabilities),
    efficiency: computeTraitStats(efficiencies),
    fearResponse: computeTraitStats(fearResponses),
    maturityRate: computeTraitStats(maturityRates),
    longevity: computeTraitStats(longevities),
  }

  const baseColor = speciesConfig.baseGenome.visual.color
  const colorDistances = boids.map((b) => {
    try {
      return colorDistance(b.genome.visual.color, baseColor)
    } catch {
      return 0 // If color parsing fails, assume no distance
    }
  })
  const colorDiversity =
    colorDistances.reduce((sum, d) => sum + d, 0) / colorDistances.length

  const quantizedColors = new Set(
    boids.map((b) => quantizeColor(b.genome.visual.color))
  )
  const uniqueColors = quantizedColors.size

  const partCounts = boids.map((b) => b.genome.visual.bodyParts.length)
  const avgPartsPerBoid =
    partCounts.reduce((sum, c) => sum + c, 0) / partCounts.length
  const minParts = Math.min(...partCounts, 0) // Default 0 if no boids
  const maxParts = Math.max(...partCounts, 0)

  const partTypeCounts: Record<string, number> = {}
  for (const boid of boids) {
    for (const part of boid.genome.visual.bodyParts) {
      partTypeCounts[part.type] = (partTypeCounts[part.type] || 0) + 1
    }
  }

  return {
    generationDistribution,
    maxGeneration,
    avgGeneration,
    traits,
    colorDiversity,
    uniqueColors,
    bodyPartStats: {
      avgPartsPerBoid,
      minParts,
      maxParts,
      partTypeCounts,
    },
    mutationsSinceLastSnapshot: mutationCounters,
  }
}

/**
 * Compute genetics statistics for all species
 *
 * @param boids - All boids in simulation
 * @param speciesConfigs - Species configurations
 * @param mutationCountersBySpecies - Mutation counters per species
 * @returns Genetics statistics per species
 */
export function computeGeneticsStatsBySpecies(
  boids: BoidsById,
  speciesConfigs: Record<string, SpeciesConfig>,
  mutationCountersBySpecies: Record<string, MutationCounters>
): Record<string, GeneticsStats> {
  const result: Record<string, GeneticsStats> = {}

  const boidsBySpecies: Record<string, Boid[]> = {}
  for (const boid of iterateBoids(boids)) {
    if (!boidsBySpecies[boid.typeId]) {
      boidsBySpecies[boid.typeId] = []
    }
    boidsBySpecies[boid.typeId].push(boid)
  }

  for (const [speciesId, speciesBoids] of Object.entries(boidsBySpecies)) {
    const speciesConfig = speciesConfigs[speciesId]
    if (!speciesConfig) continue

    const mutationCounters = mutationCountersBySpecies[speciesId] || {
      traitMutations: 0,
      colorMutations: 0,
      bodyPartMutations: 0,
      totalOffspring: 0,
    }

    result[speciesId] = computeGeneticsStats(
      speciesBoids,
      speciesConfig,
      mutationCounters
    )
  }

  return result
}

/**
 * Evolution metrics - Rates of change between snapshots
 *
 * Tracks how fast traits are evolving, how quickly generations turn over,
 * and how strong selection pressure is.
 */
export interface EvolutionMetrics {
  traitDrift: {
    speed: number
    size: number
    vision: number
    force: number
    aggression: number
    sociability: number
    efficiency: number
    fearResponse: number
    maturityRate: number
    longevity: number
  }

  generationRate: number

  mutationRate: {
    traitMutations: number
    colorMutations: number
    bodyPartMutations: number
  }

  selectionPressure: {
    speed: number
    size: number
    vision: number
    force: number
    aggression: number
    sociability: number
    efficiency: number
    fearResponse: number
    maturityRate: number
    longevity: number
  }
}

/**
 * Compute evolution metrics for a single species
 *
 * Measures how fast evolution is happening by comparing two snapshots.
 *
 * @param current - Current genetics stats
 * @param previous - Previous genetics stats (or null if first snapshot)
 * @param tickDelta - Ticks elapsed between snapshots
 * @returns Evolution metrics
 */
export function computeEvolutionMetrics(
  current: GeneticsStats,
  previous: GeneticsStats | null,
  tickDelta: number
): EvolutionMetrics {
  if (!previous || tickDelta === 0) {
    return {
      traitDrift: {
        speed: 0,
        size: 0,
        vision: 0,
        force: 0,
        aggression: 0,
        sociability: 0,
        efficiency: 0,
        fearResponse: 0,
        maturityRate: 0,
        longevity: 0,
      },
      generationRate: 0,
      mutationRate: {
        traitMutations: 0,
        colorMutations: 0,
        bodyPartMutations: 0,
      },
      selectionPressure: {
        speed: 0,
        size: 0,
        vision: 0,
        force: 0,
        aggression: 0,
        sociability: 0,
        efficiency: 0,
        fearResponse: 0,
        maturityRate: 0,
        longevity: 0,
      },
    }
  }

  const traitDrift = {
    speed: (current.traits.speed.mean - previous.traits.speed.mean) / tickDelta,
    size: (current.traits.size.mean - previous.traits.size.mean) / tickDelta,
    vision:
      (current.traits.vision.mean - previous.traits.vision.mean) / tickDelta,
    force: (current.traits.force.mean - previous.traits.force.mean) / tickDelta,
    aggression:
      (current.traits.aggression.mean - previous.traits.aggression.mean) /
      tickDelta,
    sociability:
      (current.traits.sociability.mean - previous.traits.sociability.mean) /
      tickDelta,
    efficiency:
      (current.traits.efficiency.mean - previous.traits.efficiency.mean) /
      tickDelta,
    fearResponse:
      (current.traits.fearResponse.mean - previous.traits.fearResponse.mean) /
      tickDelta,
    maturityRate:
      (current.traits.maturityRate.mean - previous.traits.maturityRate.mean) /
      tickDelta,
    longevity:
      (current.traits.longevity.mean - previous.traits.longevity.mean) /
      tickDelta,
  }

  const generationRate =
    (current.maxGeneration - previous.maxGeneration) / tickDelta

  const totalOffspring = current.mutationsSinceLastSnapshot.totalOffspring || 1 // Avoid division by zero
  const mutationRate = {
    traitMutations:
      current.mutationsSinceLastSnapshot.traitMutations / totalOffspring,
    colorMutations:
      current.mutationsSinceLastSnapshot.colorMutations / totalOffspring,
    bodyPartMutations:
      current.mutationsSinceLastSnapshot.bodyPartMutations / totalOffspring,
  }

  const selectionPressure = {
    speed:
      (current.traits.speed.stdDev - previous.traits.speed.stdDev) / tickDelta,
    size:
      (current.traits.size.stdDev - previous.traits.size.stdDev) / tickDelta,
    vision:
      (current.traits.vision.stdDev - previous.traits.vision.stdDev) /
      tickDelta,
    force:
      (current.traits.force.stdDev - previous.traits.force.stdDev) / tickDelta,
    aggression:
      (current.traits.aggression.stdDev - previous.traits.aggression.stdDev) /
      tickDelta,
    sociability:
      (current.traits.sociability.stdDev - previous.traits.sociability.stdDev) /
      tickDelta,
    efficiency:
      (current.traits.efficiency.stdDev - previous.traits.efficiency.stdDev) /
      tickDelta,
    fearResponse:
      (current.traits.fearResponse.stdDev -
        previous.traits.fearResponse.stdDev) /
      tickDelta,
    maturityRate:
      (current.traits.maturityRate.stdDev -
        previous.traits.maturityRate.stdDev) /
      tickDelta,
    longevity:
      (current.traits.longevity.stdDev - previous.traits.longevity.stdDev) /
      tickDelta,
  }

  return {
    traitDrift,
    generationRate,
    mutationRate,
    selectionPressure,
  }
}
