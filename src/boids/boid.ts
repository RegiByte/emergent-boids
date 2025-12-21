import {
  DeathMarker,
  FoodSource,
  SimulationParameters,
  SpeciesConfig,
  WorldConfig,
} from "../vocabulary/schemas/prelude.ts";
import {
  calculateEatingSpeedFactor,
  calculateEnergySpeedFactor,
  calculateFearSpeedBoost,
  calculatePredatorChaseWeight,
  calculatePredatorSeparationWeight,
  calculatePreyCohesionWeight,
} from "./calculations";
import { getPredators, getPrey } from "./filters";
import { FOOD_CONSTANTS } from "./food";
import * as rules from "./rules";
import type { Boid, Obstacle } from "./types";
import * as vec from "./vector";

let boidIdCounter = 0;

/**
 * Create a new boid with random position, velocity, and type
 */
export function createBoid(
  width: number,
  height: number,
  typeIds: string[],
  speciesConfigs: Record<string, SpeciesConfig>,
  age: number | null = null
): Boid {
  // Pick a random type
  const typeId = typeIds[Math.floor(Math.random() * typeIds.length)];
  const speciesConfig = speciesConfigs[typeId];

  const role = speciesConfig?.role || "prey";

  // Randomize initial age to prevent synchronized deaths
  // Start between 0 and 30% of max age to create age diversity
  const maxAge = speciesConfig?.lifecycle?.maxAge || 90;
  const randomAge = Math.random() * (maxAge * 0.3);
  const effectiveAge = age !== null ? age : randomAge;

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
    energy: speciesConfig?.lifecycle?.maxEnergy
      ? speciesConfig.lifecycle.maxEnergy / 2
      : 50, // Start at half energy
    age: effectiveAge, // Randomized initial age (0-30% of max age)
    reproductionCooldown: 0, // Start ready to mate
    seekingMate: false, // Not seeking initially
    mateId: null, // No mate initially
    matingBuildupCounter: 0, // No buildup initially
    eatingCooldown: 0, // Not eating initially
    stance: role === "predator" ? "hunting" : "flocking", // Initial stance based on role
    previousStance: null, // No previous stance
    positionHistory: [], // Empty trail initially
  };
}

/**
 * Create a new boid of a specific type (for reproduction)
 */
export function createBoidOfType(
  position: { x: number; y: number },
  typeId: string,
  speciesConfig: SpeciesConfig,
  width: number,
  height: number,
  energyBonus: number = 0 // Optional energy bonus for offspring (0-1)
): Boid {
  // Spawn near parent with slight offset
  const offset = 20;

  // Calculate starting energy with bonus
  const baseEnergy = speciesConfig.lifecycle.maxEnergy / 2; // Start at half energy
  const bonusEnergy = speciesConfig.lifecycle.maxEnergy * energyBonus;
  const startingEnergy = Math.min(
    baseEnergy + bonusEnergy,
    speciesConfig.lifecycle.maxEnergy
  );

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
    energy: startingEnergy, // Start with base + bonus energy
    age: 0, // Born at age 0
    reproductionCooldown: 0, // Start ready to mate
    seekingMate: false, // Not seeking initially
    mateId: null, // No mate initially
    matingBuildupCounter: 0, // No buildup initially
    eatingCooldown: 0, // Not eating initially
    stance: speciesConfig.role === "predator" ? "hunting" : "flocking", // Initial stance based on role
    previousStance: null, // No previous stance
    positionHistory: [], // Empty trail initially
  };
}

/**
 * Update a predator boid
 */
function updatePredator(
  boid: Boid,
  allBoids: Boid[],
  obstacles: Obstacle[],
  foodSources: Array<FoodSource>,
  parameters: SimulationParameters,
  world: WorldConfig,
  speciesTypes: Record<string, SpeciesConfig>
): void {
  const stance = boid.stance as
    | "hunting"
    | "seeking_mate"
    | "mating"
    | "idle"
    | "eating";

  // Find all prey (using pure filter)
  const prey = getPrey(allBoids, speciesTypes);
  const speciesConfig = speciesTypes[boid.typeId];
  if (!speciesConfig) {
    console.warn(`Unknown species: ${boid.typeId}`);
    return;
  }

  // Find other predators (using pure filter)
  const otherPredators = getPredators(allBoids, speciesTypes).filter(
    (b) => b.id !== boid.id
  );

  // Stance-based behavior
  let chaseForce = { x: 0, y: 0 };
  let foodSeekingForce = { x: 0, y: 0 };
  let mateSeekingForce = { x: 0, y: 0 };

  if (stance === "eating") {
    // Find food source we're eating from and orbit it
    const targetFood = foodSources.find((food) => {
      if (food.sourceType !== "predator" || food.energy <= 0) return false;
      const dx = boid.position.x - food.position.x;
      const dy = boid.position.y - food.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5;
    });

    if (targetFood) {
      chaseForce = rules.orbitFood(
        boid,
        targetFood.position,
        speciesConfig,
        world,
        FOOD_CONSTANTS.FOOD_EATING_RADIUS
      );
    }
  } else if (stance === "hunting") {
    // Check if predator food sources are at cap
    const predatorFoodCount = foodSources.filter(
      (f) => f.sourceType === "predator"
    ).length;
    const atFoodCap =
      predatorFoodCount >= FOOD_CONSTANTS.MAX_PREDATOR_FOOD_SOURCES;

    // Priority: Seek nearby food over hunting (energy conservation)
    const foodSeek = rules.seekFood(
      boid,
      foodSources,
      speciesConfig,
      world,
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS
    );
    if (foodSeek.targetFoodId) {
      foodSeekingForce = foodSeek.force;
    } else if (atFoodCap) {
      // Food sources at cap: seek ANY predator food source (even distant ones)
      // This ensures predators deplete existing food before creating more
      const anyFoodSeek = rules.seekFood(
        boid,
        foodSources,
        speciesConfig,
        world,
        Infinity // No distance limit - seek any food
      );
      if (anyFoodSeek.targetFoodId) {
        foodSeekingForce = anyFoodSeek.force;
      }
    } else {
      // No food nearby and not at cap, hunt prey
      chaseForce = rules.chase(boid, prey, parameters, speciesConfig, world);
    }
  } else if (stance === "seeking_mate" || stance === "mating") {
    // Seek predator mates, not prey
    mateSeekingForce = rules.seekMate(
      boid,
      otherPredators,
      parameters,
      speciesConfig,
      world
    );
    // Opportunistic food seeking
    const foodSeek = rules.seekFood(
      boid,
      foodSources,
      speciesConfig,
      world,
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS
    );
    if (foodSeek.targetFoodId) {
      foodSeekingForce = vec.multiply(foodSeek.force, 0.5);
    }
  } else if (stance === "idle") {
    // Seek food to recover energy
    const foodSeek = rules.seekFood(
      boid,
      foodSources,
      speciesConfig,
      world,
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS
    );
    if (foodSeek.targetFoodId) {
      foodSeekingForce = foodSeek.force;
    }
  }

  // Apply forces with stance-based weights
  const chaseWeight = calculatePredatorChaseWeight(stance);
  const chaseWeighted = vec.multiply(chaseForce, chaseWeight);
  const foodWeighted = vec.multiply(foodSeekingForce, 2.5); // Strong food seeking
  boid.acceleration = vec.add(boid.acceleration, chaseWeighted);
  boid.acceleration = vec.add(boid.acceleration, foodWeighted);

  // Mate-seeking force (strong when seeking/mating)
  if (stance === "seeking_mate" || stance === "mating") {
    const mateSeekingWeighted = vec.multiply(mateSeekingForce, 2.5);
    boid.acceleration = vec.add(boid.acceleration, mateSeekingWeighted);
  }

  // Avoid obstacles
  const avoid = rules.avoidObstacles(
    boid,
    obstacles,
    parameters,
    speciesConfig,
    world
  );
  const avoidWeighted = vec.multiply(avoid, parameters.obstacleAvoidanceWeight);
  boid.acceleration = vec.add(boid.acceleration, avoidWeighted);

  // Separate from other predators (unless mating or eating)
  if (stance !== "eating") {
    const separationWeight = calculatePredatorSeparationWeight(
      speciesConfig.movement.separationWeight,
      stance
    );
    const sep = rules.separation(
      boid,
      otherPredators,
      parameters,
      speciesConfig,
      world
    );
    const sepWeighted = vec.multiply(sep, separationWeight);
    boid.acceleration = vec.add(boid.acceleration, sepWeighted);
  }

  // Update velocity with energy-based speed scaling
  boid.velocity = vec.add(boid.velocity, boid.acceleration);

  // Energy affects speed
  const energySpeedFactor = calculateEnergySpeedFactor(
    boid.energy,
    speciesConfig.lifecycle.maxEnergy
  );
  let effectiveMaxSpeed = speciesConfig.movement.maxSpeed * energySpeedFactor;

  // Eating stance: reduce max speed
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
  deathMarkers: Array<DeathMarker>,
  foodSources: Array<FoodSource>,
  parameters: SimulationParameters,
  world: WorldConfig,
  speciesTypes: Record<string, SpeciesConfig>
): void {
  const stance = boid.stance as
    | "flocking"
    | "seeking_mate"
    | "mating"
    | "fleeing"
    | "eating";
  const speciesConfig = speciesTypes[boid.typeId];
  if (!speciesConfig) {
    console.warn(`Unknown species: ${boid.typeId}`);
    return;
  }

  // Standard flocking behaviors
  const sep = rules.separation(
    boid,
    allBoids,
    parameters,
    speciesConfig,
    world
  );
  const ali = rules.alignment(boid, allBoids, parameters, speciesConfig, world);
  const coh = rules.cohesion(boid, allBoids, parameters, speciesConfig, world);
  const avoid = rules.avoidObstacles(
    boid,
    obstacles,
    parameters,
    speciesConfig,
    world
  );

  // Fear of predators (using pure filter)
  const predators = getPredators(allBoids, speciesTypes);
  const fearResponse = rules.fear(
    boid,
    predators,
    parameters,
    speciesConfig,
    world
  );

  // Avoid death markers (natural deaths create danger zones)
  const deathAvoidance = rules.avoidDeathMarkers(
    boid,
    deathMarkers,
    parameters,
    speciesConfig,
    world
  );

  // Avoid predator food sources (death sites)
  const predatorFoodAvoidance = rules.avoidPredatorFood(
    boid,
    foodSources,
    parameters,
    speciesConfig,
    world
  );

  // Food seeking and eating
  let foodSeekingForce = { x: 0, y: 0 };
  let orbitForce = { x: 0, y: 0 };

  if (stance === "eating") {
    // Find food source we're eating from
    const targetFood = foodSources.find((food) => {
      if (food.sourceType !== "prey" || food.energy <= 0) return false;
      const dx = boid.position.x - food.position.x;
      const dy = boid.position.y - food.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5;
    });

    if (targetFood) {
      orbitForce = rules.orbitFood(
        boid,
        targetFood.position,
        speciesConfig,
        world,
        FOOD_CONSTANTS.FOOD_EATING_RADIUS
      );
    }
  } else if (
    stance === "flocking" &&
    boid.energy < speciesConfig.lifecycle.maxEnergy * 0.7
  ) {
    // Seek food when hungry
    const foodSeek = rules.seekFood(
      boid,
      foodSources,
      speciesConfig,
      world,
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS
    );
    if (foodSeek.targetFoodId) {
      foodSeekingForce = foodSeek.force;
    }
  }

  // Mate-seeking behavior (stance-based)
  let mateSeekingForce = { x: 0, y: 0 };
  if (stance === "seeking_mate" || stance === "mating") {
    mateSeekingForce = rules.seekMate(
      boid,
      allBoids,
      parameters,
      speciesConfig,
      world
    );
  }

  // Apply weights to all forces (stance-dependent)
  const sepWeighted = vec.multiply(
    sep,
    speciesConfig.movement.separationWeight
  );
  const aliWeighted = vec.multiply(ali, speciesConfig.movement.alignmentWeight);

  // Stance-based cohesion adjustment
  const cohesionWeight = calculatePreyCohesionWeight(
    speciesConfig.movement.cohesionWeight,
    stance
  );
  const cohWeighted = vec.multiply(coh, cohesionWeight);

  const avoidWeighted = vec.multiply(avoid, parameters.obstacleAvoidanceWeight);
  const fearWeighted = vec.multiply(
    fearResponse.force,
    speciesConfig.lifecycle.fearFactor * 3.0
  );
  const deathAvoidanceWeighted = vec.multiply(
    deathAvoidance,
    speciesConfig.lifecycle.fearFactor * 1.5
  );
  const predatorFoodAvoidanceWeighted = vec.multiply(
    predatorFoodAvoidance,
    speciesConfig.lifecycle.fearFactor * 2.5
  );
  const foodSeekingWeighted = vec.multiply(foodSeekingForce, 2.0);
  const orbitWeighted = vec.multiply(orbitForce, 3.0); // Strong orbit when eating

  boid.acceleration = vec.add(boid.acceleration, sepWeighted);
  boid.acceleration = vec.add(boid.acceleration, aliWeighted);
  boid.acceleration = vec.add(boid.acceleration, cohWeighted);
  boid.acceleration = vec.add(boid.acceleration, avoidWeighted);
  boid.acceleration = vec.add(boid.acceleration, fearWeighted);
  boid.acceleration = vec.add(boid.acceleration, deathAvoidanceWeighted);
  boid.acceleration = vec.add(boid.acceleration, predatorFoodAvoidanceWeighted);
  boid.acceleration = vec.add(boid.acceleration, foodSeekingWeighted);
  boid.acceleration = vec.add(boid.acceleration, orbitWeighted);

  // Mate-seeking is strong but not as strong as fear (stance-based)
  if (stance === "seeking_mate" || stance === "mating") {
    const mateSeekingWeighted = vec.multiply(mateSeekingForce, 2.5);
    boid.acceleration = vec.add(boid.acceleration, mateSeekingWeighted);
  }

  // Update velocity with fear-induced speed boost
  boid.velocity = vec.add(boid.velocity, boid.acceleration);

  // Apply adrenaline rush (using pure calculation)
  let effectiveMaxSpeed = speciesConfig.movement.maxSpeed;
  if (fearResponse.isAfraid && speciesConfig.lifecycle.fearFactor > 0) {
    const speedBoost = calculateFearSpeedBoost(
      speciesConfig.lifecycle.fearFactor
    );
    effectiveMaxSpeed = speciesConfig.movement.maxSpeed * speedBoost;
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
  deathMarkers: Array<DeathMarker>,
  foodSources: Array<FoodSource>,
  parameters: SimulationParameters,
  world: WorldConfig,
  speciesTypes: Record<string, SpeciesConfig>,
  deltaSeconds: number
): void {
  // Get this boid's type config
  const speciesConfig = speciesTypes[boid.typeId];
  if (!speciesConfig) {
    console.warn(`Unknown boid type: ${boid.typeId}`);
    return;
  }

  // Reset acceleration
  boid.acceleration = { x: 0, y: 0 };

  // Dispatch to role-specific update function
  if (speciesConfig.role === "predator") {
    updatePredator(
      boid,
      allBoids,
      obstacles,
      foodSources,
      parameters,
      world,
      speciesTypes
    );
  } else {
    updatePrey(
      boid,
      allBoids,
      obstacles,
      deathMarkers,
      foodSources,
      parameters,
      world,
      speciesTypes
    );
  }

  // Update position (common for all boids)
  // Scale velocity by deltaSeconds for frame-rate independent movement
  const scaledVelocity = vec.multiply(boid.velocity, deltaSeconds * 60); // 60 = reference FPS
  boid.position = vec.add(boid.position, scaledVelocity);

  // Wrap around edges (toroidal space)
  wrapEdges(boid, world.canvasWidth, world.canvasHeight);

  // Enforce minimum distance (prevent overlap/stacking)
  enforceMinimumDistance(
    boid,
    allBoids,
    { width: world.canvasWidth, height: world.canvasHeight },
    parameters,
    speciesTypes
  );
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
  worldSize: { width: number; height: number },
  parameters: SimulationParameters,
  speciesTypes: Record<string, SpeciesConfig>
): void {
  const speciesConfig = speciesTypes[boid.typeId];
  const minDist = speciesConfig.movement.minDistance || parameters.minDistance;
  if (!speciesConfig) {
    console.warn(`Unknown species: ${boid.typeId}`);
    return;
  }

  for (const other of allBoids) {
    if (other.id === boid.id) continue;

    // Get other boid's type
    const otherSpeciesConfig = speciesTypes[other.typeId];
    if (!otherSpeciesConfig) {
      console.warn(`Unknown species: ${other.typeId}`);
      continue;
    }

    // Allow predators to overlap with prey (for catching)
    if (speciesConfig.role === "predator" && otherSpeciesConfig.role === "prey")
      continue;
    if (speciesConfig.role === "prey" && otherSpeciesConfig.role === "predator")
      continue;

    // Calculate toroidal distance (using existing utility)
    const dist = vec.toroidalDistance(
      boid.position,
      other.position,
      worldSize.width,
      worldSize.height
    );

    // If too close, push apart
    if (dist < minDist && dist > 0) {
      const overlap = minDist - dist;

      // Get toroidal direction vector
      const diff = vec.toroidalSubtract(
        boid.position,
        other.position,
        worldSize.width,
        worldSize.height
      );

      // Normalize and scale by half the overlap
      const pushVector = vec.setMagnitude(diff, overlap * 0.5);

      boid.position.x += pushVector.x;
      boid.position.y += pushVector.y;
    }
  }
}
