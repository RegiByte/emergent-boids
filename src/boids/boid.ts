import type { Boid, BoidConfig, BoidTypeConfig, Obstacle } from "./types";
import * as vec from "./vector";
import * as rules from "./rules";
import { getPrey, getPredators } from "./filters";
import {
  calculateEnergySpeedFactor,
  calculateFearSpeedBoost,
  calculateEatingSpeedFactor,
  calculatePreyCohesionWeight,
  calculatePredatorSeparationWeight,
  calculatePredatorChaseWeight,
} from "./calculations";

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

  const role = typeConfig?.role || "prey";
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
    matingBuildupCounter: 0, // No buildup initially
    eatingCooldown: 0, // Not eating initially
    stance: role === "predator" ? "hunting" : "flocking", // Initial stance based on role
    previousStance: null, // No previous stance
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
    matingBuildupCounter: 0, // No buildup initially
    eatingCooldown: 0, // Not eating initially
    stance: typeConfig.role === "predator" ? "hunting" : "flocking", // Initial stance based on role
    previousStance: null, // No previous stance
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
  const stance = boid.stance as
    | "hunting"
    | "seeking_mate"
    | "mating"
    | "idle"
    | "eating";

  // Find all prey (using pure filter)
  const prey = getPrey(allBoids, config.types);

  // Find other predators (using pure filter)
  const otherPredators = getPredators(allBoids, config.types).filter(
    (b) => b.id !== boid.id
  );

  // Stance-based behavior
  let chaseForce = { x: 0, y: 0 };
  let mateSeekingForce = { x: 0, y: 0 };

  if (stance === "eating") {
    // Eating: stationary, no movement (busy consuming prey)
    chaseForce = { x: 0, y: 0 };
  } else if (stance === "hunting") {
    // Actively hunt prey
    chaseForce = rules.chase(boid, prey, config);
  } else if (stance === "seeking_mate" || stance === "mating") {
    // Seek predator mates, not prey
    mateSeekingForce = rules.seekMate(boid, otherPredators, config);
    // Opportunistic hunting: only chase very close prey
    const veryClosePrey = prey.filter((p) => {
      const dx = boid.position.x - p.position.x;
      const dy = boid.position.y - p.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < config.catchRadius * 3; // 3x catch radius
    });
    if (veryClosePrey.length > 0) {
      chaseForce = rules.chase(boid, veryClosePrey, config);
    }
  } else if (stance === "idle") {
    // Low energy, conserve - minimal movement
    chaseForce = { x: 0, y: 0 };
  }

  // Apply forces with stance-based weights (using pure calculation)
  const chaseWeight = calculatePredatorChaseWeight(stance);
  const chaseWeighted = vec.multiply(chaseForce, chaseWeight);
  boid.acceleration = vec.add(boid.acceleration, chaseWeighted);

  // Mate-seeking force (strong when seeking/mating)
  if (stance === "seeking_mate" || stance === "mating") {
    const mateSeekingWeighted = vec.multiply(mateSeekingForce, 2.5);
    boid.acceleration = vec.add(boid.acceleration, mateSeekingWeighted);
  }

  // Avoid obstacles
  const avoid = rules.avoidObstacles(boid, obstacles, config);
  const avoidWeighted = vec.multiply(avoid, config.obstacleAvoidanceWeight);
  boid.acceleration = vec.add(boid.acceleration, avoidWeighted);

  // Separate from other predators (unless mating) - using pure calculation
  const separationWeight = calculatePredatorSeparationWeight(
    typeConfig.separationWeight,
    stance
  );
  const sep = rules.separation(boid, otherPredators, config);
  const sepWeighted = vec.multiply(sep, separationWeight);
  boid.acceleration = vec.add(boid.acceleration, sepWeighted);

  // Update velocity with energy-based speed scaling
  boid.velocity = vec.add(boid.velocity, boid.acceleration);

  // Energy affects speed (using pure calculation)
  const energySpeedFactor = calculateEnergySpeedFactor(
    boid.energy,
    typeConfig.maxEnergy
  );
  let effectiveMaxSpeed = typeConfig.maxSpeed * energySpeedFactor;

  // Eating stance: reduce max speed (using pure calculation)
  if (stance === "eating") {
    effectiveMaxSpeed *= calculateEatingSpeedFactor();
  }

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

  // Fear of predators (using pure filter)
  const predators = getPredators(allBoids, config.types);
  const fearResponse = rules.fear(boid, predators, config);

  // Mate-seeking behavior (stance-based)
  let mateSeekingForce = { x: 0, y: 0 };
  const stance = boid.stance as
    | "flocking"
    | "seeking_mate"
    | "mating"
    | "fleeing";

  if (stance === "seeking_mate" || stance === "mating") {
    mateSeekingForce = rules.seekMate(boid, allBoids, config);
  }

  // Apply weights to all forces (stance-dependent)
  const sepWeighted = vec.multiply(sep, typeConfig.separationWeight);
  const aliWeighted = vec.multiply(ali, typeConfig.alignmentWeight);

  // Stance-based cohesion adjustment (using pure calculation)
  const cohesionWeight = calculatePreyCohesionWeight(
    typeConfig.cohesionWeight,
    stance
  );
  const cohWeighted = vec.multiply(coh, cohesionWeight);

  const avoidWeighted = vec.multiply(avoid, config.obstacleAvoidanceWeight);
  const fearWeighted = vec.multiply(
    fearResponse.force,
    typeConfig.fearFactor * 3.0
  );

  boid.acceleration = vec.add(boid.acceleration, sepWeighted);
  boid.acceleration = vec.add(boid.acceleration, aliWeighted);
  boid.acceleration = vec.add(boid.acceleration, cohWeighted);
  boid.acceleration = vec.add(boid.acceleration, avoidWeighted);
  boid.acceleration = vec.add(boid.acceleration, fearWeighted);

  // Mate-seeking is strong but not as strong as fear (stance-based)
  if (stance === "seeking_mate" || stance === "mating") {
    const mateSeekingWeighted = vec.multiply(mateSeekingForce, 2.5);
    boid.acceleration = vec.add(boid.acceleration, mateSeekingWeighted);
  }

  // Update velocity with fear-induced speed boost
  boid.velocity = vec.add(boid.velocity, boid.acceleration);

  // Apply adrenaline rush (using pure calculation)
  let effectiveMaxSpeed = typeConfig.maxSpeed;
  if (fearResponse.isAfraid && typeConfig.fearFactor > 0) {
    const speedBoost = calculateFearSpeedBoost(typeConfig.fearFactor);
    effectiveMaxSpeed = typeConfig.maxSpeed * speedBoost;
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
  config: BoidConfig,
  deltaSeconds: number
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
  // Scale velocity by deltaSeconds for frame-rate independent movement
  const scaledVelocity = vec.multiply(boid.velocity, deltaSeconds * 60); // 60 = reference FPS
  boid.position = vec.add(boid.position, scaledVelocity);

  // Wrap around edges (toroidal space)
  wrapEdges(boid, config.canvasWidth, config.canvasHeight);

  // Enforce minimum distance (prevent overlap/stacking)
  enforceMinimumDistance(boid, allBoids, config, typeConfig);
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

/**
 * Enforce minimum distance between boids (prevents overlap/stacking)
 * Pushes boids apart if they're too close (hard constraint)
 */
function enforceMinimumDistance(
  boid: Boid,
  allBoids: Boid[],
  config: BoidConfig,
  typeConfig: BoidTypeConfig
): void {
  const minDist = config.minDistance;

  for (const other of allBoids) {
    if (other.id === boid.id) continue;

    // Get other boid's type
    const otherType = config.types[other.typeId];
    if (!otherType) continue;

    // Allow predators to overlap with prey (for catching)
    if (typeConfig.role === "predator" && otherType.role === "prey") continue;
    if (typeConfig.role === "prey" && otherType.role === "predator") continue;

    // Calculate toroidal distance (using existing utility)
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      config.canvasWidth,
      config.canvasHeight
    );

    // If too close, push apart
    if (dist < minDist && dist > 0) {
      const overlap = minDist - dist;

      // Get toroidal direction vector
      const diff = vec.toroidalSubtract(
        boid.position,
        other.position,
        config.canvasWidth,
        config.canvasHeight
      );

      // Normalize and scale by half the overlap
      const pushVector = vec.setMagnitude(diff, overlap * 0.5);

      boid.position.x += pushVector.x;
      boid.position.y += pushVector.y;
    }
  }
}
