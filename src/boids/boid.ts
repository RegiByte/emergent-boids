import type { Boid, BoidConfig, BoidTypeConfig, Obstacle } from "./types";
import * as vec from "./vector";
import * as rules from "./rules";

let boidIdCounter = 0;

/**
 * Create a new boid with random position, velocity, and type
 */
export function createBoid(
  width: number,
  height: number,
  typeIds: string[],
  typeConfigs: Record<string, BoidTypeConfig>
): Boid {
  // Pick a random type
  const typeId = typeIds[Math.floor(Math.random() * typeIds.length)];
  const typeConfig = typeConfigs[typeId];
  
  return {
    id: `boid-${boidIdCounter++}`,
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
    energy: typeConfig?.maxEnergy ? typeConfig.maxEnergy / 2 : 50, // Start at half energy
    age: 0, // Born at age 0
    reproductionCooldown: 0, // Start ready to mate
    seekingMate: false, // Not seeking initially
    mateId: null, // No mate initially
  };
}

/**
 * Create a new boid of a specific type (for reproduction)
 */
export function createBoidOfType(
  position: { x: number; y: number },
  typeId: string,
  typeConfig: BoidTypeConfig,
  width: number,
  height: number
): Boid {
  // Spawn near parent with slight offset
  const offset = 20;
  return {
    id: `boid-${boidIdCounter++}`,
    position: {
      x: (position.x + (Math.random() - 0.5) * offset + width) % width,
      y: (position.y + (Math.random() - 0.5) * offset + height) % height,
    },
    velocity: {
      x: (Math.random() - 0.5) * 4,
      y: (Math.random() - 0.5) * 4,
    },
    acceleration: { x: 0, y: 0 },
    typeId,
    energy: typeConfig.maxEnergy / 2, // Start at half energy
    age: 0, // Born at age 0
    reproductionCooldown: 0, // Start ready to mate
    seekingMate: false, // Not seeking initially
    mateId: null, // No mate initially
  };
}

/**
 * Update a predator boid
 */
function updatePredator(
  boid: Boid,
  allBoids: Boid[],
  obstacles: Obstacle[],
  config: BoidConfig,
  typeConfig: BoidTypeConfig
): void {
  // Find all prey
  const prey = allBoids.filter((b) => {
    const otherType = config.types[b.typeId];
    return otherType && otherType.role === "prey";
  });
  
  // Chase nearest prey
  const chaseForce = rules.chase(boid, prey, config);
  const chaseWeighted = vec.multiply(chaseForce, 3.0); // Strong chase force
  boid.acceleration = vec.add(boid.acceleration, chaseWeighted);

  // Avoid obstacles
  const avoid = rules.avoidObstacles(boid, obstacles, config);
  const avoidWeighted = vec.multiply(avoid, config.obstacleAvoidanceWeight);
  boid.acceleration = vec.add(boid.acceleration, avoidWeighted);

  // Separate from other predators
  const otherPredators = allBoids.filter((b) => {
    const otherType = config.types[b.typeId];
    return otherType && otherType.role === "predator" && b.id !== boid.id;
  });
  const sep = rules.separation(boid, otherPredators, config);
  const sepWeighted = vec.multiply(sep, typeConfig.separationWeight);
  boid.acceleration = vec.add(boid.acceleration, sepWeighted);

  // Update velocity with energy-based speed scaling
  boid.velocity = vec.add(boid.velocity, boid.acceleration);
  
  // Energy affects speed: well-fed predators are faster, starving ones are slower
  // Formula: speed scales from 0.5x (near death) to 1.3x (full energy)
  const energyRatio = boid.energy / typeConfig.maxEnergy;
  const energySpeedFactor = 0.5 + (energyRatio * 0.8); // Range: 0.5 to 1.3
  const effectiveMaxSpeed = typeConfig.maxSpeed * energySpeedFactor;
  
  boid.velocity = vec.limit(boid.velocity, effectiveMaxSpeed);
}

/**
 * Update a prey boid
 */
function updatePrey(
  boid: Boid,
  allBoids: Boid[],
  obstacles: Obstacle[],
  config: BoidConfig,
  typeConfig: BoidTypeConfig
): void {
  // Standard flocking behaviors
  const sep = rules.separation(boid, allBoids, config);
  const ali = rules.alignment(boid, allBoids, config);
  const coh = rules.cohesion(boid, allBoids, config);
  const avoid = rules.avoidObstacles(boid, obstacles, config);

  // Fear of predators
  const predators = allBoids.filter((b) => {
    const otherType = config.types[b.typeId];
    return otherType && otherType.role === "predator";
  });
  const fearResponse = rules.fear(boid, predators, config);

  // Mate-seeking behavior (Phase 2)
  let mateSeekingForce = { x: 0, y: 0 };
  if (boid.seekingMate) {
    mateSeekingForce = rules.seekMate(boid, allBoids, config);
  }

  // Apply weights to all forces
  const sepWeighted = vec.multiply(sep, typeConfig.separationWeight);
  const aliWeighted = vec.multiply(ali, typeConfig.alignmentWeight);
  
  // Reduce cohesion when seeking mate (focus on mate, not flock)
  const cohesionWeight = boid.seekingMate 
    ? typeConfig.cohesionWeight * 0.3 
    : typeConfig.cohesionWeight;
  const cohWeighted = vec.multiply(coh, cohesionWeight);
  
  const avoidWeighted = vec.multiply(avoid, config.obstacleAvoidanceWeight);
  const fearWeighted = vec.multiply(fearResponse.force, typeConfig.fearFactor * 3.0);

  boid.acceleration = vec.add(boid.acceleration, sepWeighted);
  boid.acceleration = vec.add(boid.acceleration, aliWeighted);
  boid.acceleration = vec.add(boid.acceleration, cohWeighted);
  boid.acceleration = vec.add(boid.acceleration, avoidWeighted);
  boid.acceleration = vec.add(boid.acceleration, fearWeighted);
  
  // Mate-seeking is strong but not as strong as fear
  if (boid.seekingMate) {
    const mateSeekingWeighted = vec.multiply(mateSeekingForce, 2.5);
    boid.acceleration = vec.add(boid.acceleration, mateSeekingWeighted);
  }

  // Update velocity with fear-induced speed boost
  boid.velocity = vec.add(boid.velocity, boid.acceleration);
  
  // Apply adrenaline rush: when afraid, prey can run faster than normal
  // Speed boost scales with fearFactor (higher fear = bigger boost)
  let effectiveMaxSpeed = typeConfig.maxSpeed;
  if (fearResponse.isAfraid && typeConfig.fearFactor > 0) {
    // Boost formula: maxSpeed * (1 + fearFactor * 0.5)
    // Examples: 0.8 fear = 40% boost, 0.5 fear = 25% boost, 0.3 fear = 15% boost
    effectiveMaxSpeed = typeConfig.maxSpeed * (1 + typeConfig.fearFactor * 0.5);
  }
  
  boid.velocity = vec.limit(boid.velocity, effectiveMaxSpeed);
}

/**
 * Update a single boid based on its neighbors and obstacles
 * Dispatches to role-specific update functions
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

  // Dispatch to role-specific update function
  if (typeConfig.role === "predator") {
    updatePredator(boid, allBoids, obstacles, config, typeConfig);
  } else {
    updatePrey(boid, allBoids, obstacles, config, typeConfig);
  }

  // Update position (common for all boids)
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
