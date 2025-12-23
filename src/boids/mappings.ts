/**
 * Pure functions to map boids into various representations
 */

import { Boid } from "./vocabulary/schemas/prelude";

export function boidsBySpecies(boids: Boid[]) {
  return boids.reduce((acc, boid) => {
    if (!acc[boid.typeId]) {
      acc[boid.typeId] = [];
    }
    acc[boid.typeId].push(boid);
    return acc;
  }, {} as Record<Boid["typeId"], Boid[]>);
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
