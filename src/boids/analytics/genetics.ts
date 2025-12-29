import type { Boid, SpeciesConfig } from "../vocabulary/schemas/prelude";
import { colorDistance } from "@/lib/colors";

// ============================================
// Genetics Statistics
// ============================================

/**
 * Statistics for a single trait across a population
 */
export interface TraitStats {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
}

/**
 * Body part statistics
 */
export interface BodyPartStats {
  avgPartsPerBoid: number;
  minParts: number;
  maxParts: number;
  partTypeCounts: Record<string, number>;
}

/**
 * Mutation tracking counters
 */
export interface MutationCounters {
  traitMutations: number;
  colorMutations: number;
  bodyPartMutations: number;
  totalOffspring: number;
}

/**
 * Complete genetics statistics for a species
 */
export interface GeneticsStats {
  generationDistribution: Record<string, number>;
  maxGeneration: number;
  avgGeneration: number;
  traits: {
    speed: TraitStats;
    size: TraitStats;
    vision: TraitStats;
    force: TraitStats;
    aggression: TraitStats;
    sociability: TraitStats;
    efficiency: TraitStats;
  };
  colorDiversity: number;
  uniqueColors: number;
  bodyPartStats: BodyPartStats;
  mutationsSinceLastSnapshot: MutationCounters;
}

/**
 * Compute statistics for a single trait
 */
function computeTraitStats(values: number[]): TraitStats {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, stdDev: 0 };
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Standard deviation
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, min, max, stdDev };
}

/**
 * Quantize color to reduce noise (round LAB components to nearest 5)
 * Returns a string key for counting unique colors
 */
function quantizeColor(color: string): string {
  try {
    // Use a simple hex-based quantization (first 4 hex digits)
    // This groups similar colors together
    return color.substring(0, 5); // "#XXYY" - groups similar colors
  } catch {
    return color;
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
    };
  }

  // Generation distribution
  const generationDistribution: Record<string, number> = {};
  let maxGeneration = 0;
  let totalGenerations = 0;

  for (const boid of boids) {
    const gen = boid.genome.generation;
    generationDistribution[gen.toString()] =
      (generationDistribution[gen.toString()] || 0) + 1;
    maxGeneration = Math.max(maxGeneration, gen);
    totalGenerations += gen;
  }

  const avgGeneration = totalGenerations / boids.length;

  // Extract trait arrays
  const speeds = boids.map((b) => b.genome.traits.speed);
  const sizes = boids.map((b) => b.genome.traits.size);
  const visions = boids.map((b) => b.genome.traits.vision);
  const forces = boids.map((b) => b.genome.traits.force);
  const aggressions = boids.map((b) => b.genome.traits.aggression);
  const sociabilities = boids.map((b) => b.genome.traits.sociability);
  const efficiencies = boids.map((b) => b.genome.traits.efficiency);

  // Compute trait statistics
  const traits = {
    speed: computeTraitStats(speeds),
    size: computeTraitStats(sizes),
    vision: computeTraitStats(visions),
    force: computeTraitStats(forces),
    aggression: computeTraitStats(aggressions),
    sociability: computeTraitStats(sociabilities),
    efficiency: computeTraitStats(efficiencies),
  };

  // Color diversity - average LAB distance from species base color
  const baseColor = speciesConfig.visual.color;
  const colorDistances = boids.map((b) => {
    try {
      return colorDistance(b.genome.visual.color, baseColor);
    } catch {
      return 0; // If color parsing fails, assume no distance
    }
  });
  const colorDiversity =
    colorDistances.reduce((sum, d) => sum + d, 0) / colorDistances.length;

  // Unique colors (quantized to reduce noise)
  const quantizedColors = new Set(
    boids.map((b) => quantizeColor(b.genome.visual.color))
  );
  const uniqueColors = quantizedColors.size;

  // Body part statistics
  const partCounts = boids.map((b) => b.genome.visual.bodyParts.length);
  const avgPartsPerBoid =
    partCounts.reduce((sum, c) => sum + c, 0) / partCounts.length;
  const minParts = Math.min(...partCounts, 0); // Default 0 if no boids
  const maxParts = Math.max(...partCounts, 0);

  // Count part types
  const partTypeCounts: Record<string, number> = {};
  for (const boid of boids) {
    for (const part of boid.genome.visual.bodyParts) {
      partTypeCounts[part.type] = (partTypeCounts[part.type] || 0) + 1;
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
  };
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
  boids: Boid[],
  speciesConfigs: Record<string, SpeciesConfig>,
  mutationCountersBySpecies: Record<string, MutationCounters>
): Record<string, GeneticsStats> {
  const result: Record<string, GeneticsStats> = {};

  // Group boids by species
  const boidsBySpecies: Record<string, Boid[]> = {};
  for (const boid of boids) {
    if (!boidsBySpecies[boid.typeId]) {
      boidsBySpecies[boid.typeId] = [];
    }
    boidsBySpecies[boid.typeId].push(boid);
  }

  // Compute stats for each species
  for (const [speciesId, speciesBoids] of Object.entries(boidsBySpecies)) {
    const speciesConfig = speciesConfigs[speciesId];
    if (!speciesConfig) continue;

    const mutationCounters = mutationCountersBySpecies[speciesId] || {
      traitMutations: 0,
      colorMutations: 0,
      bodyPartMutations: 0,
      totalOffspring: 0,
    };

    result[speciesId] = computeGeneticsStats(
      speciesBoids,
      speciesConfig,
      mutationCounters
    );
  }

  return result;
}
