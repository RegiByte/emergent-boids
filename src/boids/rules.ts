import * as vec from "./vector";
import {
  Boid,
  Vector2,
  Obstacle,
  DeathMarker,
  FoodSource,
  SimulationParameters,
  SpeciesConfig,
  WorldConfig,
} from "./vocabulary/schemas/prelude.ts";
import type { Profiler } from "../resources/profiler";
import {
  getAffinity,
  getSeparationModifier,
  getCohesionWeight,
  shouldFlock,
} from "./affinity";

/**
 * Separation: Steer to avoid crowding local flockmates
 * Returns a steering force away from nearby boids
 *
 * Affinity System: Low affinity increases separation (avoid clustering)
 * High affinity decreases separation (allow close proximity)
 */
export function separation(
  boid: Boid,
  neighbors: Boid[],
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig,
  profiler?: Profiler
): Vector2 {
  if (profiler) {
    profiler.start("rule.separation");
  }
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const other of neighbors) {
    // Calculate toroidal distance
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      world.canvasWidth,
      world.canvasHeight
    );

    // Only consider boids within perception radius
    if (dist > 0 && dist < parameters.perceptionRadius) {
      // Get affinity between species
      const affinity = getAffinity(boid.typeId, other.typeId, speciesConfig);

      // Calculate separation modifier based on affinity
      // Low affinity = stronger separation (avoid clustering)
      // High affinity = weaker separation (allow clustering)
      const affinityModifier = getSeparationModifier(affinity);

      // Calculate vector pointing away from neighbor (toroidal)
      let diff = vec.toroidalSubtract(
        boid.position,
        other.position,
        world.canvasWidth,
        world.canvasHeight
      );
      // Weight by distance (closer = stronger force)
      diff = vec.divide(diff, dist * dist);
      // Apply affinity modifier
      diff = vec.multiply(diff, affinityModifier);
      steering.x += diff.x;
      steering.y += diff.y;
      total++;
    }
  }

  if (total > 0) {
    const avg = vec.divide(steering, total);
    const desired = vec.setMagnitude(avg, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    profiler?.end("rule.separation");
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  profiler?.end("rule.separation");
  return steering;
}

/**
 * Alignment: Steer towards the average heading of local flockmates
 * Returns a steering force to match velocity with neighbors
 *
 * Affinity System: Only align with species above affinity threshold
 * Weight contribution by affinity strength (higher affinity = stronger alignment)
 */
export function alignment(
  boid: Boid,
  neighbors: Boid[],
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig,
  profiler?: Profiler
): Vector2 {
  profiler?.start("rule.alignment");
  const steering: Vector2 = { x: 0, y: 0 };
  let totalWeight = 0;

  for (const other of neighbors) {
    // Calculate toroidal distance
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist > 0 && dist < parameters.perceptionRadius) {
      // Get affinity and check if we should align with this species
      const affinity = getAffinity(boid.typeId, other.typeId, speciesConfig);

      // Only align with species above affinity threshold
      if (shouldFlock(affinity)) {
        // Weight by affinity strength (higher affinity = stronger alignment)
        const weight = getCohesionWeight(affinity);
        steering.x += other.velocity.x * weight;
        steering.y += other.velocity.y * weight;
        totalWeight += weight;
      }
    }
  }

  if (totalWeight > 0) {
    const avg = vec.divide(steering, totalWeight);
    const desired = vec.setMagnitude(avg, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    profiler?.end("rule.alignment");
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  profiler?.end("rule.alignment");
  return steering;
}

/**
 * Cohesion: Steer towards the average position of local flockmates
 * Returns a steering force towards the center of mass of neighbors
 *
 * Affinity System: Only flock with species above affinity threshold
 * Weight contribution by affinity strength (higher affinity = stronger pull)
 */
export function cohesion(
  boid: Boid,
  neighbors: Boid[],
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig,
  profiler?: Profiler
): Vector2 {
  profiler?.start("rule.cohesion");
  const steering: Vector2 = { x: 0, y: 0 };
  let totalWeight = 0;

  for (const other of neighbors) {
    // Calculate toroidal distance
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist > 0 && dist < parameters.perceptionRadius) {
      // Get affinity and check if we should flock with this species
      const affinity = getAffinity(boid.typeId, other.typeId, speciesConfig);

      // Only flock with species above affinity threshold
      if (shouldFlock(affinity)) {
        // Weight by affinity strength (higher affinity = stronger pull)
        const weight = getCohesionWeight(affinity);
        steering.x += other.position.x * weight;
        steering.y += other.position.y * weight;
        totalWeight += weight;
      }
    }
  }

  if (totalWeight > 0) {
    const avg = vec.divide(steering, totalWeight);
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
    profiler?.end("rule.cohesion");
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  profiler?.end("rule.cohesion");
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
  _world: WorldConfig,
  profiler?: Profiler
): Vector2 {
  profiler?.start("rule.avoidObstacles");
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
    profiler?.end("rule.avoidObstacles");
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  profiler?.end("rule.avoidObstacles");
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
  world: WorldConfig,
  profiler?: Profiler
): { force: Vector2; isAfraid: boolean } {
  profiler?.start("rule.fear");
  const steering: Vector2 = { x: 0, y: 0 };
  let total = 0;

  for (const predator of predators) {
    // Calculate toroidal distance
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
    profiler?.end("rule.fear");
    return {
      force: vec.limit(steer, speciesConfig.movement.maxForce),
      isAfraid: true,
    };
  }

  profiler?.end("rule.fear");
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
  world: WorldConfig,
  profiler?: Profiler
): Vector2 {
  profiler?.start("rule.chase");
  // Find nearest prey
  let nearestPrey: Boid | null = null;
  let nearestDist = Infinity;

  for (const boid of prey) {
    // Calculate toroidal distance
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
    profiler?.end("rule.chase");
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  profiler?.end("rule.chase");
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
  world: WorldConfig,
  profiler?: Profiler
): Vector2 {
  profiler?.start("rule.seekMate");
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
      // Calculate toroidal distance
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
    profiler?.end("rule.seekMate");
    return vec.limit(steer, speciesConfig.movement.maxForce * 2.0); // Extra strong force!
  }

  profiler?.end("rule.seekMate");
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
  world: WorldConfig,
  profiler?: Profiler
): Vector2 {
  profiler?.start("rule.avoidDeathMarkers");
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
    profiler?.end("rule.avoidDeathMarkers");
    return vec.limit(steer, speciesConfig.movement.maxForce * 0.85);
  }

  profiler?.end("rule.avoidDeathMarkers");
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
  detectionRadius: number,
  profiler?: Profiler
): { force: Vector2; targetFoodId: string | null } {
  profiler?.start("rule.seekFood");
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
    profiler?.end("rule.seekFood");
    return {
      force: vec.limit(steer, speciesConfig.movement.maxForce),
      targetFoodId: nearestFood.id,
    };
  }

  profiler?.end("rule.seekFood");
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
  eatingRadius: number,
  profiler?: Profiler
): Vector2 {
  profiler?.start("rule.orbitFood");
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
    profiler?.end("rule.orbitFood");
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  // If close enough, orbit (perpendicular to radius)
  const tangent = { x: -toFood.y, y: toFood.x }; // 90° rotation
  const desired = vec.setMagnitude(
    tangent,
    speciesConfig.movement.maxSpeed * 0.5
  );
  const steer = vec.subtract(desired, boid.velocity);
  profiler?.end("rule.orbitFood");
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
  world: WorldConfig,
  profiler?: Profiler
): Vector2 {
  profiler?.start("rule.avoidPredatorFood");
  // Only prey avoid predator food
  if (speciesConfig.role !== "prey") {
    profiler?.end("rule.avoidPredatorFood");
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

      // Weight by distance and fear factor (closer = stronger)
      const weight = 1 / (dist * dist);
      const weightedDist = vec.multiply(away, weight);
      const feerFactor = speciesConfig.lifecycle.fearFactor;
      const weightedFear = vec.multiply(away, feerFactor);

      steering.x += weightedDist.x;
      steering.y += weightedDist.y;
      steering.x += weightedFear.x;
      steering.y += weightedFear.y;
      count++;
    }
  }

  if (count > 0) {
    const avg = vec.divide(steering, count);
    const desired = vec.setMagnitude(avg, speciesConfig.movement.maxSpeed);
    const steer = vec.subtract(desired, boid.velocity);
    profiler?.end("rule.avoidPredatorFood");
    return vec.limit(steer, speciesConfig.movement.maxForce);
  }

  profiler?.end("rule.avoidPredatorFood");
  return { x: 0, y: 0 };
}

/**
 * Avoid Crowded Areas: Steer away from dense clusters
 * Returns a steering force away from the center of mass when too many neighbors
 *
 * Crowd Aversion System: Species-specific tolerance for group size
 * - Prevents giant blobs by forcing groups to split when threshold exceeded
 * - Creates "budding" behavior (groups spawn sub-groups)
 * - Improves visual clarity and distribution
 *
 * Philosophy: "Even social creatures need personal space"
 */
export function avoidCrowdedAreas(
  boid: Boid,
  neighbors: Boid[],
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  world: WorldConfig,
  profiler?: Profiler
): Vector2 {
  profiler?.start("rule.avoidCrowdedAreas");

  const threshold = speciesConfig.movement.crowdAversionThreshold;
  const nearbyCount = neighbors.length;

  // If below threshold, no avoidance needed
  if (nearbyCount <= threshold) {
    profiler?.end("rule.avoidCrowdedAreas");
    return { x: 0, y: 0 };
  }

  // Calculate "crowdedness" factor (how much over threshold)
  // 0.0 = at threshold, 1.0 = double threshold, etc.
  const crowdedness = (nearbyCount - threshold) / threshold;

  // Calculate center of mass of ALL neighbors (avoid the dense area itself)
  let centerX = 0;
  let centerY = 0;
  let count = 0;

  for (const other of neighbors) {
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      world.canvasWidth,
      world.canvasHeight
    );

    if (dist > 0 && dist < parameters.perceptionRadius) {
      centerX += other.position.x;
      centerY += other.position.y;
      count++;
    }
  }

  if (count === 0) {
    profiler?.end("rule.avoidCrowdedAreas");
    return { x: 0, y: 0 };
  }

  const centerOfMass: Vector2 = {
    x: centerX / count,
    y: centerY / count,
  };

  // Steer away from center of mass (escape the crowd)
  const awayFromCenter = vec.toroidalSubtract(
    boid.position,
    centerOfMass,
    world.canvasWidth,
    world.canvasHeight
  );

  // Desired velocity: away from crowd at max speed
  const desired = vec.setMagnitude(
    awayFromCenter,
    speciesConfig.movement.maxSpeed
  );
  const steer = vec.subtract(desired, boid.velocity);

  // Scale by crowdedness (more crowded = stronger avoidance)
  const scaled = vec.multiply(steer, crowdedness);

  // Apply crowd aversion weight
  const maxForce =
    speciesConfig.movement.maxForce *
    speciesConfig.movement.crowdAversionWeight;

  profiler?.end("rule.avoidCrowdedAreas");
  return vec.limit(scaled, maxForce);
}
