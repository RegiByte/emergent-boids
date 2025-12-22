import { Boid, Vector2, Obstacle } from "./types";
import * as vec from "./vector";
import {
  DeathMarker,
  FoodSource,
  SimulationParameters,
  SpeciesConfig,
  WorldConfig,
} from "../vocabulary/schemas/prelude.ts";

/**
 * Separation: Steer to avoid crowding local flockmates
 * Returns a steering force away from nearby boids
 */
export function separation(
  boid: Boid,
  neighbors: Boid[],
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig
): Vector2 {
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const other of neighbors) {
    // Use toroidal distance for wrapped space
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      world.canvasWidth,
      world.canvasHeight
    );

    // Only consider boids within perception radius
    if (dist > 0 && dist < parameters.perceptionRadius) {
      // Calculate vector pointing away from neighbor (toroidal)
      let diff = vec.toroidalSubtract(
        boid.position,
        other.position,
        world.canvasWidth,
        world.canvasHeight
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
    const desired = vec.setMagnitude(avg, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return vec.limit(steer, speciesConfig.movement.maxForce);
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
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig
): Vector2 {
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const other of neighbors) {
    // Use toroidal distance for wrapped space
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist > 0 && dist < parameters.perceptionRadius) {
      steering.x += other.velocity.x;
      steering.y += other.velocity.y;
      total++;
    }
  }

  if (total > 0) {
    const avg = vec.divide(steering, total);
    const desired = vec.setMagnitude(avg, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return vec.limit(steer, speciesConfig.movement.maxForce);
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
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig
): Vector2 {
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const other of neighbors) {
    // Use toroidal distance for wrapped space
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist > 0 && dist < parameters.perceptionRadius) {
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
      world.canvasWidth,
      world.canvasHeight
    );
    const desiredVelocity = vec.setMagnitude(
      desired,
      speciesConfig.movement.maxSpeed
    );
    const steer = vec.subtract(desiredVelocity, boid.velocity);
    return vec.limit(steer, speciesConfig.movement.maxForce);
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
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  _world: WorldConfig
): Vector2 {
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const obstacle of obstacles) {
    const dist = vec.distance(boid.position, obstacle.position);
    const avoidanceRadius = obstacle.radius + parameters.perceptionRadius;

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
    const desired = vec.setMagnitude(avg, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return vec.limit(steer, speciesConfig.movement.maxForce);
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
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig
): { force: Vector2; isAfraid: boolean } {
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const predator of predators) {
    const dist = vec.toroidalDistance(
      boid.position,
      predator.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist > 0 && dist < parameters.fearRadius) {
      // Flee away from predator
      let diff = vec.toroidalSubtract(
        boid.position,
        predator.position,
        world.canvasWidth,
        world.canvasHeight
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
    const desired = vec.setMagnitude(avg, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return {
      force: vec.limit(steer, speciesConfig.movement.maxForce),
      isAfraid: true,
    };
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
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig
): Vector2 {
  // Find nearest prey
  let nearestPrey: Boid | null = null;
  let nearestDist = Infinity;

  for (const boid of prey) {
    const dist = vec.toroidalDistance(
      predator.position,
      boid.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPrey = boid;
    }
  }

  if (nearestPrey && nearestDist < parameters.chaseRadius) {
    // Steer toward nearest prey
    const desired = vec.toroidalSubtract(
      nearestPrey.position,
      predator.position,
      world.canvasWidth,
      world.canvasHeight
    );
    const desiredVelocity = vec.setMagnitude(
      desired,
      speciesConfig.movement.maxSpeed
    );
    const steer = vec.subtract(desiredVelocity, predator.velocity);
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  return { x: 0, y: 0 };
}

/**
 * Seek Mate: Steer towards nearest eligible mate
 * Returns a steering force towards the nearest same-type boid ready to mate
 */
export function seekMate(
  boid: Boid,
  potentialMates: Boid[],
  _parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig
): Vector2 {
  // Find nearest eligible mate
  let nearestMate: Boid | null = null;
  let nearestDist = Infinity;

  for (const other of potentialMates) {
    // Must be same type, different boid, ready to mate
    if (
      other.id !== boid.id &&
      other.typeId === boid.typeId &&
      other.seekingMate &&
      other.reproductionCooldown === 0
    ) {
      const dist = vec.toroidalDistance(
        boid.position,
        other.position,
        world.canvasWidth,
        world.canvasHeight
      );

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestMate = other;
      }
    }
  }

  if (nearestMate) {
    // Strong steering force toward mate
    const desired = vec.toroidalSubtract(
      nearestMate.position,
      boid.position,
      world.canvasWidth,
      world.canvasHeight
    );
    const desiredVelocity = vec.setMagnitude(
      desired,
      speciesConfig.movement.maxSpeed
    );
    const steer = vec.subtract(desiredVelocity, boid.velocity);
    return vec.limit(steer, speciesConfig.movement.maxForce * 2.0); // Extra strong force!
  }

  return { x: 0, y: 0 };
}

/**
 * Avoid Death Markers: Steer away from locations where boids died
 * Returns a steering force away from nearby death markers
 * Only affects prey - predators ignore death markers
 * Strength accumulates with repeated deaths in the same area
 */
export function avoidDeathMarkers(
  boid: Boid,
  deathMarkers: Array<DeathMarker>,
  _parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig
): Vector2 {
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  // Avoidance radius scales with marker strength
  const baseAvoidanceRadius = 60;

  for (const marker of deathMarkers) {
    // Stronger markers have larger avoidance radius (up to 100px)
    const strengthRatio = marker.strength / 5.0; // Max strength is 5.0
    const avoidanceRadius = baseAvoidanceRadius + strengthRatio * 50; // 60-100px

    const dist = vec.toroidalDistance(
      boid.position,
      marker.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist > 0 && dist < avoidanceRadius) {
      // Flee away from death marker
      let diff = vec.toroidalSubtract(
        boid.position,
        marker.position,
        world.canvasWidth,
        world.canvasHeight
      );

      // Weight by distance (closer = stronger avoidance)
      const distanceWeight = 1 / (dist * dist);

      // Weight by marker strength (more deaths = stronger repulsion)
      const strengthWeight = marker.strength;

      // Weight by remaining lifetime (fresher = stronger)
      const freshnessWeight = marker.remainingTicks / marker.maxLifetimeTicks;

      const totalWeight = distanceWeight * strengthWeight * freshnessWeight;

      diff = vec.multiply(diff, totalWeight);
      steering.x += diff.x;
      steering.y += diff.y;
      total++;
    }
  }

  if (total > 0) {
    const avg = vec.divide(steering, total);
    const desired = vec.setMagnitude(avg, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    // Moderate force - less than fear but still significant
    return vec.limit(steer, speciesConfig.movement.maxForce * 0.85);
  }

  return steering;
}

/**
 * Seek Food: Steer towards nearest compatible food source
 * Returns a steering force towards the nearest food source and its ID
 * Prey seek prey food, predators seek predator food
 */
export function seekFood(
  boid: Boid,
  foodSources: Array<FoodSource>,
  speciesConfig: SpeciesConfig,
  world: WorldConfig,
  detectionRadius: number
): { force: Vector2; targetFoodId: string | null } {
  const role = speciesConfig.role;

  // Filter food sources by type
  const compatibleFood = foodSources.filter((food) => {
    if (role === "prey") return food.sourceType === "prey";
    if (role === "predator") return food.sourceType === "predator";
    return false;
  });

  // Find nearest food within detection radius
  let nearestFood: (typeof foodSources)[0] | null = null;
  let nearestDist = Infinity;

  for (const food of compatibleFood) {
    if (food.energy <= 0) continue; // Skip exhausted sources

    const dist = vec.toroidalDistance(
      boid.position,
      food.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist < detectionRadius && dist < nearestDist) {
      nearestDist = dist;
      nearestFood = food;
    }
  }

  if (nearestFood) {
    // Steer toward food
    const desired = vec.toroidalSubtract(
      nearestFood.position,
      boid.position,
      world.canvasWidth,
      world.canvasHeight
    );
    const desiredVelocity = vec.setMagnitude(
      desired,
      speciesConfig.movement.maxSpeed
    );
    const steer = vec.subtract(desiredVelocity, boid.velocity);
    return {
      force: vec.limit(steer, speciesConfig.movement.maxForce),
      targetFoodId: nearestFood.id,
    };
  }

  return { force: { x: 0, y: 0 }, targetFoodId: null };
}

/**
 * Orbit Food: Circle around food source while eating
 * Returns a steering force to maintain orbit at eating radius
 * Boids move closer if too far, orbit if at correct distance
 */
export function orbitFood(
  boid: Boid,
  foodPosition: Vector2,
  speciesConfig: SpeciesConfig,
  world: WorldConfig,
  eatingRadius: number
): Vector2 {
  // Calculate vector to food
  const toFood = vec.toroidalSubtract(
    foodPosition,
    boid.position,
    world.canvasWidth,
    world.canvasHeight
  );

  const dist = vec.magnitude(toFood);

  // If too far, move closer
  if (dist > eatingRadius * 1.2) {
    const desired = vec.setMagnitude(toFood, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  // If close enough, orbit (perpendicular to radius)
  const tangent = { x: -toFood.y, y: toFood.x }; // 90° rotation
  const desired = vec.setMagnitude(
    tangent,
    speciesConfig.movement.maxSpeed * 0.5
  );
  const steer = vec.subtract(desired, boid.velocity);
  return vec.limit(steer, speciesConfig.movement.maxForce * 0.8);
}

/**
 * Avoid Predator Food: Prey avoid predator food sources (death sites)
 * Returns a steering force away from predator food sources
 * Only affects prey - predators ignore this
 */
export function avoidPredatorFood(
  boid: Boid,
  foodSources: Array<FoodSource>,
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig
): Vector2 {
  // Only prey avoid predator food
  if (speciesConfig.role !== "prey") {
    return { x: 0, y: 0 };
  }

  const predatorFood = foodSources.filter((f) => f.sourceType === "predator");

  const steering: Vector2 = { x: 0, y: 0 };
  let count = 0;

  for (const food of predatorFood) {
    const dist = vec.toroidalDistance(
      boid.position,
      food.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist < parameters.fearRadius) {
      // Flee away from predator food
      const away = vec.toroidalSubtract(
        boid.position,
        food.position,
        world.canvasWidth,
        world.canvasHeight
      );

      // Weight by distance (closer = stronger)
      const weight = 1 / (dist * dist);
      const weighted = vec.multiply(away, weight);

      steering.x += weighted.x;
      steering.y += weighted.y;
      count++;
    }
  }

  if (count > 0) {
    const avg = vec.divide(steering, count);
    const desired = vec.setMagnitude(avg, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  return { x: 0, y: 0 };
}
