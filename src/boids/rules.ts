import { Boid, Vector2, BoidConfig, Obstacle } from "./types";
import * as vec from "./vector";

/**
 * Separation: Steer to avoid crowding local flockmates
 * Returns a steering force away from nearby boids
 */
export function separation(
  boid: Boid,
  neighbors: Boid[],
  config: BoidConfig
): Vector2 {
  const typeConfig = config.types[boid.typeId];
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const other of neighbors) {
    // Use toroidal distance for wrapped space
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      config.canvasWidth,
      config.canvasHeight
    );

    // Only consider boids within perception radius
    if (dist > 0 && dist < config.perceptionRadius) {
      // Calculate vector pointing away from neighbor (toroidal)
      let diff = vec.toroidalSubtract(
        boid.position,
        other.position,
        config.canvasWidth,
        config.canvasHeight
      );
      // Weight by distance (closer = stronger force)
      diff = vec.divide(diff, dist * dist);
      steering.x += diff.x;
      steering.y += diff.y;
      total++;
    }
  }

  if (total > 0) {
    const avg = vec.divide(steering, total);
    const desired = vec.setMagnitude(avg, typeConfig.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return vec.limit(steer, typeConfig.maxForce);
  }

  return steering;
}

/**
 * Alignment: Steer towards the average heading of local flockmates
 * Returns a steering force to match velocity with neighbors
 */
export function alignment(
  boid: Boid,
  neighbors: Boid[],
  config: BoidConfig
): Vector2 {
  const typeConfig = config.types[boid.typeId];
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const other of neighbors) {
    // Use toroidal distance for wrapped space
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      config.canvasWidth,
      config.canvasHeight
    );

    if (dist > 0 && dist < config.perceptionRadius) {
      steering.x += other.velocity.x;
      steering.y += other.velocity.y;
      total++;
    }
  }

  if (total > 0) {
    const avg = vec.divide(steering, total);
    const desired = vec.setMagnitude(avg, typeConfig.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return vec.limit(steer, typeConfig.maxForce);
  }

  return steering;
}

/**
 * Cohesion: Steer towards the average position of local flockmates
 * Returns a steering force towards the center of mass of neighbors
 */
export function cohesion(
  boid: Boid,
  neighbors: Boid[],
  config: BoidConfig
): Vector2 {
  const typeConfig = config.types[boid.typeId];
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const other of neighbors) {
    // Use toroidal distance for wrapped space
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      config.canvasWidth,
      config.canvasHeight
    );

    if (dist > 0 && dist < config.perceptionRadius) {
      steering.x += other.position.x;
      steering.y += other.position.y;
      total++;
    }
  }

  if (total > 0) {
    const avg = vec.divide(steering, total);
    // Use toroidal subtraction for the desired direction
    const desired = vec.toroidalSubtract(
      avg,
      boid.position,
      config.canvasWidth,
      config.canvasHeight
    );
    const desiredVelocity = vec.setMagnitude(desired, typeConfig.maxSpeed);
    const steer = vec.subtract(desiredVelocity, boid.velocity);
    return vec.limit(steer, typeConfig.maxForce);
  }

  return steering;
}

/**
 * Obstacle Avoidance: Steer to avoid obstacles
 * Returns a steering force away from nearby obstacles
 */
export function avoidObstacles(
  boid: Boid,
  obstacles: Obstacle[],
  config: BoidConfig
): Vector2 {
  const typeConfig = config.types[boid.typeId];
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const obstacle of obstacles) {
    const dist = vec.distance(boid.position, obstacle.position);
    const avoidanceRadius = obstacle.radius + config.perceptionRadius;

    // Only consider obstacles within avoidance radius
    if (dist > 0 && dist < avoidanceRadius) {
      // Calculate vector pointing away from obstacle
      let diff = vec.subtract(boid.position, obstacle.position);

      // Weight by distance (closer = stronger force)
      // Extra weight near the obstacle surface
      const distFromSurface = dist - obstacle.radius;
      const weight =
        distFromSurface > 0 ? 1 / (distFromSurface * distFromSurface) : 1000;

      diff = vec.multiply(diff, weight);
      steering.x += diff.x;
      steering.y += diff.y;
      total++;
    }
  }

  if (total > 0) {
    const avg = vec.divide(steering, total);
    const desired = vec.setMagnitude(avg, typeConfig.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return vec.limit(steer, typeConfig.maxForce);
  }

  return steering;
}

/**
 * Fear: Steer away from predators
 * Returns a steering force away from nearby predators and whether fear is active
 */
export function fear(
  boid: Boid,
  predators: Boid[],
  config: BoidConfig
): { force: Vector2; isAfraid: boolean } {
  const typeConfig = config.types[boid.typeId];
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const predator of predators) {
    const dist = vec.toroidalDistance(
      boid.position,
      predator.position,
      config.canvasWidth,
      config.canvasHeight
    );

    if (dist > 0 && dist < config.fearRadius) {
      // Flee away from predator
      let diff = vec.toroidalSubtract(
        boid.position,
        predator.position,
        config.canvasWidth,
        config.canvasHeight
      );
      // Weight by distance (closer = stronger fear)
      diff = vec.divide(diff, dist * dist);
      steering.x += diff.x;
      steering.y += diff.y;
      total++;
    }
  }

  if (total > 0) {
    const avg = vec.divide(steering, total);
    const desired = vec.setMagnitude(avg, typeConfig.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return { force: vec.limit(steer, typeConfig.maxForce), isAfraid: true };
  }

  return { force: steering, isAfraid: false };
}

/**
 * Chase: Steer towards nearest prey
 * Returns a steering force towards the nearest prey boid
 */
export function chase(
  predator: Boid,
  prey: Boid[],
  config: BoidConfig
): Vector2 {
  const typeConfig = config.types[predator.typeId];

  // Find nearest prey
  let nearestPrey: Boid | null = null;
  let nearestDist = Infinity;

  for (const boid of prey) {
    const dist = vec.toroidalDistance(
      predator.position,
      boid.position,
      config.canvasWidth,
      config.canvasHeight
    );

    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPrey = boid;
    }
  }

  if (nearestPrey && nearestDist < config.chaseRadius) {
    // Steer toward nearest prey
    const desired = vec.toroidalSubtract(
      nearestPrey.position,
      predator.position,
      config.canvasWidth,
      config.canvasHeight
    );
    const desiredVelocity = vec.setMagnitude(desired, typeConfig.maxSpeed);
    const steer = vec.subtract(desiredVelocity, predator.velocity);
    return vec.limit(steer, typeConfig.maxForce);
  }

  return { x: 0, y: 0 };
}
