/**
 * Pure functions to map boids into various representations
 */

import { ItemWithDistance } from "./spatialHash";
import { Boid } from "./vocabulary/schemas/entities";

export function boidsBySpecies(boids: Boid[]) {
  return boids.reduce(
    (acc, boid) => {
      if (!acc[boid.typeId]) {
        acc[boid.typeId] = [];
      }
      acc[boid.typeId].push(boid);
      return acc;
    },
    {} as Record<Boid["typeId"], Boid[]>
  );
}

export function boidsToEnergy(boids: Boid[]) {
  return boids.map((boid) => boid.energy);
}

export function boidsToAge(boids: Boid[]) {
  return boids.map((boid) => boid.age);
}

export function boidsToStance(boids: Boid[]) {
  return boids.map((boid) => boid.stance);
}

export function getNearbyBoidsByRole(
  boid: Boid,
  nearbyBoids: ItemWithDistance<Boid>[]
) {
  const result = {
    nearbyPrey: [] as ItemWithDistance<Boid>[],
    nearbyPredators: [] as ItemWithDistance<Boid>[],
  };

  for (const { item: nearbyBoid, distance } of nearbyBoids) {
    if (nearbyBoid.typeId === boid.typeId) {
      result.nearbyPrey.push({ item: nearbyBoid, distance });
    } else {
      result.nearbyPredators.push({ item: nearbyBoid, distance });
    }
  }

  return result;
}
