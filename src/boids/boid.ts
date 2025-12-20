import type { Boid, BoidConfig, Obstacle } from "./types";
import * as vec from "./vector";
import * as rules from "./rules";

/**
 * Create a new boid with random position, velocity, and type
 */
export function createBoid(
  width: number,
  height: number,
  typeIds: string[]
): Boid {
  // Pick a random type
  const typeId = typeIds[Math.floor(Math.random() * typeIds.length)];
  
  return {
    position: {
      x: Math.random() * width,
      y: Math.random() * height,
    },
    velocity: {
      x: (Math.random() - 0.5) * 4, // Default initial speed
      y: (Math.random() - 0.5) * 4,
    },
    acceleration: { x: 0, y: 0 },
    typeId,
  };
}

/**
 * Update a single boid based on its neighbors and obstacles
 */
export function updateBoid(
  boid: Boid,
  allBoids: Boid[],
  obstacles: Obstacle[],
  config: BoidConfig
): void {
  // Get this boid's type config
  const typeConfig = config.types[boid.typeId];
  if (!typeConfig) {
    console.warn(`Unknown boid type: ${boid.typeId}`);
    return;
  }

  // Reset acceleration
  boid.acceleration = { x: 0, y: 0 };

  // Calculate the four forces
  const sep = rules.separation(boid, allBoids, config);
  const ali = rules.alignment(boid, allBoids, config);
  const coh = rules.cohesion(boid, allBoids, config);
  const avoid = rules.avoidObstacles(boid, obstacles, config);

  // Apply weights from boid's type config
  const sepWeighted = vec.multiply(sep, typeConfig.separationWeight);
  const aliWeighted = vec.multiply(ali, typeConfig.alignmentWeight);
  const cohWeighted = vec.multiply(coh, typeConfig.cohesionWeight);
  const avoidWeighted = vec.multiply(avoid, config.obstacleAvoidanceWeight);

  // Apply forces to acceleration
  boid.acceleration = vec.add(boid.acceleration, sepWeighted);
  boid.acceleration = vec.add(boid.acceleration, aliWeighted);
  boid.acceleration = vec.add(boid.acceleration, cohWeighted);
  boid.acceleration = vec.add(boid.acceleration, avoidWeighted);

  // Update velocity (using type's max speed)
  boid.velocity = vec.add(boid.velocity, boid.acceleration);
  boid.velocity = vec.limit(boid.velocity, typeConfig.maxSpeed);

  // Update position
  boid.position = vec.add(boid.position, boid.velocity);

  // Wrap around edges (toroidal space)
  wrapEdges(boid, config.canvasWidth, config.canvasHeight);
}

/**
 * Wrap boid position around canvas edges
 */
function wrapEdges(boid: Boid, width: number, height: number): void {
  if (boid.position.x < 0) boid.position.x = width;
  if (boid.position.x > width) boid.position.x = 0;
  if (boid.position.y < 0) boid.position.y = height;
  if (boid.position.y > height) boid.position.y = 0;
}
