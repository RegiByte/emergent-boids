import {
  Boid,
  FoodSource,
  SpeciesConfig,
  DeathMarker,
} from "../vocabulary/schemas/prelude";
import * as vec from "../vector";

// ============================================
// Behavioral Distribution
// ============================================

export function getStanceDistribution(boids: Boid[]) {
  return boids.reduce((acc, boid) => {
    acc[boid.stance] = (acc[boid.stance] || 0) + 1;
    return acc;
  }, {} as Partial<Record<Boid["stance"], number>>);
}

export function getStanceDistributionBySpecies(boids: Boid[]) {
  const result: Record<string, Record<string, number>> = {};

  boids.forEach((boid) => {
    if (!result[boid.typeId]) {
      result[boid.typeId] = {};
    }
    result[boid.typeId][boid.stance] =
      (result[boid.typeId][boid.stance] || 0) + 1;
  });

  return result;
}

// ============================================
// Energy Statistics
// ============================================

export interface EnergyStats {
  total: number;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
}

export function computeEnergyStats(boids: Boid[]): EnergyStats {
  if (boids.length === 0) {
    return { total: 0, mean: 0, min: 0, max: 0, stdDev: 0 };
  }

  const energies = boids.map((b) => b.energy);
  const total = energies.reduce((sum, e) => sum + e, 0);
  const mean = total / boids.length;
  const min = Math.min(...energies);
  const max = Math.max(...energies);

  // Calculate standard deviation
  const variance =
    energies.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / boids.length;
  const stdDev = Math.sqrt(variance);

  return { total, mean, min, max, stdDev };
}

export function computeEnergyStatsBySpecies(
  boids: Boid[]
): Record<string, EnergyStats> {
  const bySpecies: Record<string, Boid[]> = {};

  boids.forEach((boid) => {
    if (!bySpecies[boid.typeId]) {
      bySpecies[boid.typeId] = [];
    }
    bySpecies[boid.typeId].push(boid);
  });

  const result: Record<string, EnergyStats> = {};
  for (const [typeId, speciesBoids] of Object.entries(bySpecies)) {
    result[typeId] = computeEnergyStats(speciesBoids);
  }

  return result;
}

// ============================================
// Age Distribution
// ============================================

export interface AgeDistribution {
  mean: number;
  min: number;
  max: number;
  youngCount: number; // Age < minReproductionAge
  matureCount: number; // Age >= minReproductionAge
  elderCount: number; // Age > 75% of maxAge
}

export function computeAgeDistribution(
  boids: Boid[],
  speciesConfig: SpeciesConfig,
  minReproductionAge: number
): AgeDistribution {
  if (boids.length === 0) {
    return {
      mean: 0,
      min: 0,
      max: 0,
      youngCount: 0,
      matureCount: 0,
      elderCount: 0,
    };
  }

  const ages = boids.map((b) => b.age);
  const mean = ages.reduce((sum, age) => sum + age, 0) / boids.length;
  const min = Math.min(...ages);
  const max = Math.max(...ages);

  const elderThreshold = speciesConfig.lifecycle.maxAge * 0.75;

  let youngCount = 0;
  let matureCount = 0;
  let elderCount = 0;

  boids.forEach((boid) => {
    if (boid.age < minReproductionAge) {
      youngCount++;
    } else if (boid.age >= elderThreshold) {
      elderCount++;
    } else {
      matureCount++;
    }
  });

  return { mean, min, max, youngCount, matureCount, elderCount };
}

export function computeAgeDistributionBySpecies(
  boids: Boid[],
  speciesConfigs: Record<string, SpeciesConfig>,
  minReproductionAge: number
): Record<string, AgeDistribution> {
  const bySpecies: Record<string, Boid[]> = {};

  boids.forEach((boid) => {
    if (!bySpecies[boid.typeId]) {
      bySpecies[boid.typeId] = [];
    }
    bySpecies[boid.typeId].push(boid);
  });

  const result: Record<string, AgeDistribution> = {};
  for (const [typeId, speciesBoids] of Object.entries(bySpecies)) {
    const config = speciesConfigs[typeId];
    if (config) {
      result[typeId] = computeAgeDistribution(
        speciesBoids,
        config,
        minReproductionAge
      );
    }
  }

  return result;
}

// ============================================
// Spatial Patterns
// ============================================

export interface SpatialPattern {
  meanNearestNeighborDistance: number;
  clusterCount: number;
  largestClusterSize: number;
  centerOfMass: { x: number; y: number };
  spreadRadius: number;
  territoryOverlap?: number;
}

export function computeSpatialPattern(
  boids: Boid[],
  worldWidth: number,
  worldHeight: number
): SpatialPattern {
  if (boids.length === 0) {
    return {
      meanNearestNeighborDistance: 0,
      clusterCount: 0,
      largestClusterSize: 0,
      centerOfMass: { x: 0, y: 0 },
      spreadRadius: 0,
    };
  }

  // Calculate center of mass
  const centerOfMass = {
    x: boids.reduce((sum, b) => sum + b.position.x, 0) / boids.length,
    y: boids.reduce((sum, b) => sum + b.position.y, 0) / boids.length,
  };

  // Calculate spread radius (average distance from center)
  const spreadRadius =
    boids.reduce((sum, b) => {
      return (
        sum +
        vec.toroidalDistance(b.position, centerOfMass, worldWidth, worldHeight)
      );
    }, 0) / boids.length;

  // Calculate mean nearest neighbor distance
  let totalNearestDistance = 0;
  boids.forEach((boid) => {
    let minDist = Infinity;
    boids.forEach((other) => {
      if (boid.id !== other.id) {
        const dist = vec.toroidalDistance(
          boid.position,
          other.position,
          worldWidth,
          worldHeight
        );
        if (dist < minDist) {
          minDist = dist;
        }
      }
    });
    totalNearestDistance += minDist === Infinity ? 0 : minDist;
  });
  const meanNearestNeighborDistance = totalNearestDistance / boids.length;

  // Simple clustering using distance threshold
  const clusterThreshold = 100; // pixels
  const visited = new Set<string>();
  const clusters: number[] = [];

  const findCluster = (startBoid: Boid): number => {
    const stack = [startBoid];
    let clusterSize = 0;

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current.id)) continue;

      visited.add(current.id);
      clusterSize++;

      // Find nearby boids
      boids.forEach((other) => {
        if (!visited.has(other.id)) {
          const dist = vec.toroidalDistance(
            current.position,
            other.position,
            worldWidth,
            worldHeight
          );
          if (dist < clusterThreshold) {
            stack.push(other);
          }
        }
      });
    }

    return clusterSize;
  };

  boids.forEach((boid) => {
    if (!visited.has(boid.id)) {
      const clusterSize = findCluster(boid);
      clusters.push(clusterSize);
    }
  });

  return {
    meanNearestNeighborDistance,
    clusterCount: clusters.length,
    largestClusterSize: clusters.length > 0 ? Math.max(...clusters) : 0,
    centerOfMass,
    spreadRadius,
  };
}

export function computeSpatialPatternsBySpecies(
  boids: Boid[],
  worldWidth: number,
  worldHeight: number
): Record<string, SpatialPattern> {
  const bySpecies: Record<string, Boid[]> = {};

  boids.forEach((boid) => {
    if (!bySpecies[boid.typeId]) {
      bySpecies[boid.typeId] = [];
    }
    bySpecies[boid.typeId].push(boid);
  });

  const result: Record<string, SpatialPattern> = {};
  for (const [typeId, speciesBoids] of Object.entries(bySpecies)) {
    result[typeId] = computeSpatialPattern(
      speciesBoids,
      worldWidth,
      worldHeight
    );
  }

  return result;
}

// ============================================
// Reproduction Metrics
// ============================================

export interface ReproductionMetrics {
  seekingMateCount: number;
  matingCount: number;
  reproductionReadyCount: number;
  avgReproductionCooldown: number;
}

export function computeReproductionMetrics(
  boids: Boid[],
  speciesConfig: SpeciesConfig,
  minReproductionAge: number,
  reproductionEnergyThreshold: number
): ReproductionMetrics {
  if (boids.length === 0) {
    return {
      seekingMateCount: 0,
      matingCount: 0,
      reproductionReadyCount: 0,
      avgReproductionCooldown: 0,
    };
  }

  let seekingMateCount = 0;
  let matingCount = 0;
  let reproductionReadyCount = 0;
  let totalCooldown = 0;

  boids.forEach((boid) => {
    if (boid.seekingMate) seekingMateCount++;
    if (boid.stance === "mating") matingCount++;

    // Check if ready to reproduce
    const isOldEnough = boid.age >= minReproductionAge;
    const hasEnoughEnergy =
      boid.energy >=
      speciesConfig.lifecycle.maxEnergy * reproductionEnergyThreshold;
    const noCooldown = boid.reproductionCooldown === 0;

    if (isOldEnough && hasEnoughEnergy && noCooldown) {
      reproductionReadyCount++;
    }

    totalCooldown += boid.reproductionCooldown;
  });

  return {
    seekingMateCount,
    matingCount,
    reproductionReadyCount,
    avgReproductionCooldown: totalCooldown / boids.length,
  };
}

export function computeReproductionMetricsBySpecies(
  boids: Boid[],
  speciesConfigs: Record<string, SpeciesConfig>,
  minReproductionAge: number,
  reproductionEnergyThreshold: number
): Record<string, ReproductionMetrics> {
  const bySpecies: Record<string, Boid[]> = {};

  boids.forEach((boid) => {
    if (!bySpecies[boid.typeId]) {
      bySpecies[boid.typeId] = [];
    }
    bySpecies[boid.typeId].push(boid);
  });

  const result: Record<string, ReproductionMetrics> = {};
  for (const [typeId, speciesBoids] of Object.entries(bySpecies)) {
    const config = speciesConfigs[typeId];
    if (config) {
      result[typeId] = computeReproductionMetrics(
        speciesBoids,
        config,
        minReproductionAge,
        reproductionEnergyThreshold
      );
    }
  }

  return result;
}

// ============================================
// Food Source Statistics
// ============================================

export interface FoodSourceStats {
  count: number;
  totalEnergy: number;
  meanEnergy: number;
}

export function computeFoodSourceStats(
  foodSources: FoodSource[]
): FoodSourceStats {
  if (foodSources.length === 0) {
    return { count: 0, totalEnergy: 0, meanEnergy: 0 };
  }

  const totalEnergy = foodSources.reduce((sum, f) => sum + f.energy, 0);
  return {
    count: foodSources.length,
    totalEnergy,
    meanEnergy: totalEnergy / foodSources.length,
  };
}

export function computeFoodSourceStatsByType(foodSources: FoodSource[]): {
  prey: FoodSourceStats;
  predator: FoodSourceStats;
} {
  const preyFood = foodSources.filter((f) => f.sourceType === "prey");
  const predatorFood = foodSources.filter((f) => f.sourceType === "predator");

  return {
    prey: computeFoodSourceStats(preyFood),
    predator: computeFoodSourceStats(predatorFood),
  };
}

// ============================================
// Death Marker Statistics
// ============================================

export interface DeathMarkerStats {
  count: number;
  totalStrength: number;
  meanStrength: number;
}

export function computeDeathMarkerStats(
  deathMarkers: DeathMarker[]
): DeathMarkerStats {
  if (deathMarkers.length === 0) {
    return { count: 0, totalStrength: 0, meanStrength: 0 };
  }

  const totalStrength = deathMarkers.reduce((sum, m) => sum + m.strength, 0);
  return {
    count: deathMarkers.length,
    totalStrength,
    meanStrength: totalStrength / deathMarkers.length,
  };
}

// ============================================
// Legacy Functions (kept for backward compatibility)
// ============================================

type StanceDistribution = ReturnType<typeof getStanceDistribution>;

export function getStancePercentageDistribution(
  stanceDistribution: StanceDistribution,
  total: number
) {
  return Object.entries(stanceDistribution).reduce((acc, [stance, count]) => {
    acc[stance as Boid["stance"]] = (count / total) * 100;
    return acc;
  }, {} as Partial<Record<Boid["stance"], number>>);
}

export function countFoodSourcesBySourceType(foodSources: FoodSource[]) {
  return foodSources.reduce((acc, foodSource) => {
    acc[foodSource.sourceType] = (acc[foodSource.sourceType] || 0) + 1;
    return acc;
  }, {} as Partial<Record<FoodSource["sourceType"], number>>);
}

export type FoodSourcesBySourceType = ReturnType<
  typeof countFoodSourcesBySourceType
>;
