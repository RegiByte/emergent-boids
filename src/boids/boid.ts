import type {
  SimulationParameters,
  SpeciesConfig,
} from "./vocabulary/schemas/prelude.ts";
import {
  calculateEatingSpeedFactor,
  calculateEnergySpeedFactor,
  calculateFearSpeedBoost,
  calculatePredatorChaseWeight,
  calculatePredatorSeparationWeight,
  calculatePreyCohesionWeight,
} from "./calculations";
import type { BoidUpdateContext } from "./context";
import { getPredators, getPrey } from "./filters";
import { FOOD_CONSTANTS } from "./food";
import * as rules from "./rules";
import { Boid } from "./vocabulary/schemas/prelude.ts";
import { PredatorStance } from "./vocabulary/schemas/prelude.ts";
import * as vec from "./vector";
import type { DomainRNG } from "@/lib/seededRandom";
import type { Vector2 } from "./vocabulary/schemas/prelude.ts";
import { roleKeywords } from "./vocabulary/keywords.ts";
import type {
  WorldPhysics,
  Genome,
  MutationConfig,
} from "./vocabulary/schemas/genetics";
import { computePhenotype, createGenesisGenome } from "./genetics/phenotype";
import { defaultWorldPhysics } from "@/resources/defaultPhysics";
import { inheritGenome, DEFAULT_MUTATION_CONFIG } from "./genetics/inheritance";

let boidIdCounter = 0;

export type Force = {
  force: Vector2;
  weight: number;
};

/**
 * Apply weighted forces to boid acceleration
 *
 * Declarative composition of behavioral forces with explicit weights.
 * Makes force priorities clear and easy to tune.
 *
 * Philosophy: Simple rules compose. Weighted forces create emergent behavior.
 *
 * PERFORMANCE OPTIMIZATION (Session 71):
 * Inline vector operations to avoid function call overhead
 * Reduces ~8-10 function calls per boid per frame to 0
 */
function applyWeightedForces(boid: Boid, forces: Array<Force>): void {
  for (const { force, weight } of forces) {
    // Inline vec.multiply and vec.add to avoid function calls
    boid.acceleration.x += force.x * weight;
    boid.acceleration.y += force.y * weight;
  }
}

/**
 * Boid creation context - provides world and species configuration
 */
export type BoidCreationContext = {
  world: { width: number; height: number };
  species: Record<string, SpeciesConfig>;
  rng: DomainRNG; // Seeded RNG for reproducibility
  physics?: WorldPhysics; // Optional physics (uses defaults if not provided)
};

/**
 * Create a new boid with random position, velocity, and type
 */
export function createBoid(
  typeIds: string[],
  context: BoidCreationContext,
  age: number | null = null
): Boid {
  const { world, species, rng, physics = defaultWorldPhysics } = context;

  // Pick a random type
  const typeId = rng.pick(typeIds);
  const speciesConfig = species[typeId];

  const role = speciesConfig?.role || roleKeywords.prey;

  // Start all genesis boids at age 0 to prevent immediate reproduction explosion
  // Age diversity will naturally emerge over time through births/deaths
  const effectiveAge = age !== null ? age : 0;

  // Create genome from species config
  const genome = createGenesisGenome(
    speciesConfig.baseGenome.traits,
    speciesConfig.baseGenome.visual
  );

  // Compute phenotype from genome + physics
  const phenotype = computePhenotype(genome, physics);

  return {
    id: `boid-${boidIdCounter++}`,
    position: {
      x: rng.range(0, world.width),
      y: rng.range(0, world.height),
    },
    velocity: {
      x: rng.range(-2, 2), // Default initial speed
      y: rng.range(-2, 2),
    },
    acceleration: { x: 0, y: 0 },
    typeId,

    // Genetics (NEW)
    genome,
    phenotype,

    // Resources (UPDATED)
    energy: phenotype.maxEnergy / 2, // Start at half energy
    health: phenotype.maxHealth, // Start at full health

    age: effectiveAge, // Age 0 for genesis boids, actual age for offspring
    reproductionCooldown: 0, // Start ready to mate
    seekingMate: false, // Not seeking initially
    mateId: null, // No mate initially
    matingBuildupCounter: 0, // No buildup initially
    eatingCooldown: 0, // Not eating initially
    attackCooldown: 0, // Not attacking initially
    stance: role === "predator" ? "hunting" : "flocking", // Initial stance based on role
    previousStance: null, // No previous stance
    positionHistory: [], // Empty trail initially

    // Target tracking (NEW - Session 74)
    targetId: null, // No target initially
    targetLockTime: 0, // No lock time
    targetLockStrength: 0, // No lock strength

    // Mate commitment tracking (NEW - Session 75)
    mateCommitmentTime: 0, // No mate commitment initially

    // Stance transition tracking (NEW - Session 74)
    stanceEnteredAt: 0, // Entered at tick 0
    substate: null, // No substate initially
  };
}

/**
 * Create a new boid of a specific type (for reproduction)
 *
 * If parent genomes are provided, offspring inherits from parent(s) with mutations.
 * Otherwise, creates a genesis genome from species config (initial spawning).
 *
 * @returns Boid and mutation metadata (if inherited from parents)
 */
export function createBoidOfType(
  position: { x: number; y: number },
  typeId: string,
  context: BoidCreationContext,
  energyBonus: number = 0, // Optional energy bonus for offspring (0-1)
  parentGenomes?: { parent1: Genome; parent2?: Genome } // Optional parent genomes for inheritance
): {
  boid: Boid;
  mutationMetadata: {
    hadTraitMutation: boolean;
    hadColorMutation: boolean;
    hadBodyPartMutation: boolean;
  } | null;
} {
  const { world, species, rng, physics = defaultWorldPhysics } = context;
  const speciesConfig = species[typeId];

  // Spawn near parent with slight offset
  const offset = 20;

  // Create genome: Inherit from parents OR create genesis genome
  let genome: Genome;
  let mutationMetadata: {
    hadTraitMutation: boolean;
    hadColorMutation: boolean;
    hadBodyPartMutation: boolean;
  } | null = null;

  if (parentGenomes) {
    // Offspring: Inherit genome from parent(s) with mutations
    // Use species mutation config (top-level) or defaults
    const mutationConfig: MutationConfig = {
      traitRate:
        speciesConfig.mutation?.traitRate ?? DEFAULT_MUTATION_CONFIG.traitRate,
      traitMagnitude:
        speciesConfig.mutation?.traitMagnitude ??
        DEFAULT_MUTATION_CONFIG.traitMagnitude,
      visualRate:
        speciesConfig.mutation?.visualRate ??
        DEFAULT_MUTATION_CONFIG.visualRate,
      colorRate:
        speciesConfig.mutation?.colorRate ?? DEFAULT_MUTATION_CONFIG.colorRate,
    };

    // Enable logging for inheritance (temporary for debugging)
    const enableLogging = false;

    const inheritanceResult = inheritGenome(
      parentGenomes.parent1,
      parentGenomes.parent2,
      mutationConfig,
      rng,
      enableLogging
    );
    genome = inheritanceResult.genome;
    mutationMetadata = {
      hadTraitMutation: inheritanceResult.hadTraitMutation,
      hadColorMutation: inheritanceResult.hadColorMutation,
      hadBodyPartMutation: inheritanceResult.hadBodyPartMutation,
    };
  } else {
    // Genesis: Create genome from species config
    genome = createGenesisGenome(
      speciesConfig.baseGenome.traits,
      speciesConfig.baseGenome.visual
    );
  }

  // Compute phenotype from genome + physics
  const phenotype = computePhenotype(genome, physics);

  // Calculate starting energy with bonus
  const baseEnergy = phenotype.maxEnergy / 2; // Start at half energy
  const bonusEnergy = phenotype.maxEnergy * energyBonus;
  const startingEnergy = Math.min(
    baseEnergy + bonusEnergy,
    phenotype.maxEnergy
  );

  const boid: Boid = {
    id: `boid-${boidIdCounter++}`,
    position: {
      x:
        (position.x + rng.range(-offset / 2, offset / 2) + world.width) %
        world.width,
      y:
        (position.y + rng.range(-offset / 2, offset / 2) + world.height) %
        world.height,
    },
    velocity: {
      x: rng.range(-2, 2),
      y: rng.range(-2, 2),
    },
    acceleration: { x: 0, y: 0 },
    typeId,

    // Genetics (NEW)
    genome,
    phenotype,

    // Resources (UPDATED)
    energy: startingEnergy, // Start with base + bonus energy
    health: phenotype.maxHealth, // Start at full health

    age: 0, // Born at age 0
    reproductionCooldown: 0, // Start ready to mate
    seekingMate: false, // Not seeking initially
    mateId: null, // No mate initially
    matingBuildupCounter: 0, // No buildup initially
    eatingCooldown: 0, // Not eating initially
    attackCooldown: 0, // Not attacking initially
    stance: speciesConfig.role === "predator" ? "hunting" : "flocking", // Initial stance based on role
    previousStance: null, // No previous stance
    positionHistory: [], // Empty trail initially

    // Target tracking (NEW - Session 74)
    targetId: null, // No target initially
    targetLockTime: 0, // No lock time
    targetLockStrength: 0, // No lock strength

    // Mate commitment tracking (NEW - Session 75)
    mateCommitmentTime: 0, // No mate commitment initially

    // Stance transition tracking (NEW - Session 74)
    stanceEnteredAt: 0, // Entered at tick 0
    substate: null, // No substate initially
  };

  return { boid, mutationMetadata };
}

/**
 * Update a predator boid
 */
function updatePredator(
  boid: Boid,
  allBoids: Boid[],
  context: BoidUpdateContext
): void {
  // Extract context for convenience
  const { simulation, config } = context;
  const { obstacles, foodSources } = simulation;
  const { parameters, world, species: speciesTypes } = config;
  const stance = boid.stance as PredatorStance;

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
        FOOD_CONSTANTS.FOOD_EATING_RADIUS,
        context.profiler
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
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS,
      context.profiler
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
        Infinity, // No distance limit - seek any food
        context.profiler
      );
      if (anyFoodSeek.targetFoodId) {
        foodSeekingForce = anyFoodSeek.force;
      }
    } else {
      // No food nearby and not at cap, hunt prey
      chaseForce = rules.chase(
        boid,
        prey,
        parameters,
        speciesConfig,
        world,
        context.profiler
      );
    }
  } else if (stance === "seeking_mate") {
    // SEEKING_MATE: Actively search for potential mates (Session 75 fix)
    mateSeekingForce = rules.seekMate(
      boid,
      otherPredators,
      parameters,
      speciesConfig,
      world,
      context.profiler
    );
  } else if (stance === "mating") {
    // MATING: Stay near paired mate, but don't actively seek (Session 75 fix)
    // Just use normal flocking to stay together, no special seeking force
    // The mate should be nearby already from the pairing process
    
    // Opportunistic food seeking while mating (low priority)
    const foodSeek = rules.seekFood(
      boid,
      foodSources,
      speciesConfig,
      world,
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS,
      context.profiler
    );
    if (foodSeek.targetFoodId) {
      foodSeekingForce = vec.multiply(foodSeek.force, 0.3); // Reduced priority
    }
  } else if (stance === "idle") {
    // Seek food to recover energy
    const foodSeek = rules.seekFood(
      boid,
      foodSources,
      speciesConfig,
      world,
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS,
      context.profiler
    );
    if (foodSeek.targetFoodId) {
      foodSeekingForce = foodSeek.force;
    }
  }

  // Calculate obstacle avoidance (always needed)
  const avoid = rules.avoidObstacles(
    boid,
    obstacles,
    parameters,
    speciesConfig,
    world,
    context.profiler
  );

  // Calculate separation (conditional based on stance)
  let sep = { x: 0, y: 0 };
  let separationWeight = 0;
  if (stance !== "eating") {
    separationWeight = calculatePredatorSeparationWeight(
      boid.phenotype.separationWeight,
      stance
    );
    sep = rules.separation(
      boid,
      otherPredators,
      parameters,
      speciesConfig,
      world,
      context.profiler
    );
  }

  // Calculate crowd avoidance (territorial behavior)
  const crowdAvoidance = rules.avoidCrowdedAreas(
    boid,
    otherPredators,
    parameters,
    speciesConfig,
    world,
    context.profiler
  );

  // Declarative force composition with explicit weights
  // Clear visual hierarchy makes priorities obvious and easy to tune
  const chaseWeight = calculatePredatorChaseWeight(stance);

  const forces = [
    // Hunting and resource behaviors
    { force: chaseForce, weight: chaseWeight },
    { force: foodSeekingForce, weight: 2.5 }, // Strong food seeking

    // Avoidance behaviors
    { force: avoid, weight: parameters.obstacleAvoidanceWeight },
    { force: sep, weight: separationWeight },
    { force: crowdAvoidance, weight: 1.0 }, // Already weighted in rule
  ] satisfies Array<Force>;

  applyWeightedForces(boid, forces);

  // Mate-seeking (conditional, high priority when active)
  if (stance === "seeking_mate" || stance === "mating") {
    applyWeightedForces(boid, [{ force: mateSeekingForce, weight: 2.5 }]);
  }

  // Update velocity with energy-based speed scaling
  boid.velocity = vec.add(boid.velocity, boid.acceleration);

  // Energy affects speed
  const energySpeedFactor = calculateEnergySpeedFactor(
    boid.energy,
    boid.phenotype.maxEnergy
  );
  let effectiveMaxSpeed = boid.phenotype.maxSpeed * energySpeedFactor;

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
  context: BoidUpdateContext
): void {
  // Extract context for convenience
  const { simulation, config } = context;
  const { obstacles, deathMarkers, foodSources } = simulation;
  const { parameters, world, species: speciesTypes } = config;
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
    world,
    context.profiler
  );
  const ali = rules.alignment(
    boid,
    allBoids,
    parameters,
    speciesConfig,
    world,
    context.profiler
  );
  const coh = rules.cohesion(
    boid,
    allBoids,
    parameters,
    speciesConfig,
    world,
    context.profiler
  );
  const avoid = rules.avoidObstacles(
    boid,
    obstacles,
    parameters,
    speciesConfig,
    world,
    context.profiler
  );

  // Fear of predators (using pure filter)
  const predators = getPredators(allBoids, speciesTypes);
  const fearResponse = rules.fear(
    boid,
    predators,
    parameters,
    speciesConfig,
    world,
    context.profiler
  );

  // Avoid death markers (natural deaths create danger zones)
  const deathAvoidance = rules.avoidDeathMarkers(
    boid,
    deathMarkers,
    parameters,
    speciesConfig,
    world,
    context.profiler
  );

  // Avoid predator food sources (death sites)
  const predatorFoodAvoidance = rules.avoidPredatorFood(
    boid,
    foodSources,
    parameters,
    speciesConfig,
    world,
    context.profiler
  );

  // Avoid crowded areas (species-specific tolerance)
  const crowdAvoidance = rules.avoidCrowdedAreas(
    boid,
    allBoids,
    parameters,
    speciesConfig,
    world,
    context.profiler
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
        FOOD_CONSTANTS.FOOD_EATING_RADIUS,
        context.profiler
      );
    }
  } else if (
    stance === "flocking" &&
    boid.energy < boid.phenotype.maxEnergy * 0.7
  ) {
    // Seek food when hungry
    const foodSeek = rules.seekFood(
      boid,
      foodSources,
      speciesConfig,
      world,
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS,
      context.profiler
    );
    if (foodSeek.targetFoodId) {
      foodSeekingForce = foodSeek.force;
    }
  }

  // Mate-seeking behavior (stance-based) - Session 75 fix
  let mateSeekingForce = { x: 0, y: 0 };
  if (stance === "seeking_mate") {
    // SEEKING_MATE: Actively search for potential mates
    mateSeekingForce = rules.seekMate(
      boid,
      allBoids,
      parameters,
      speciesConfig,
      world,
      context.profiler
    );
  }
  // MATING: Just use normal flocking to stay near mate, no active seeking
  // This prevents the "spiraling" behavior when already paired

  // Declarative force composition with explicit weights
  // Clear visual hierarchy makes priorities obvious and easy to tune
  const cohesionWeight = calculatePreyCohesionWeight(
    boid.phenotype.cohesionWeight,
    stance
  );

  // Session 75: Reduce ALL flocking forces when eating to stay at food
  const flockingMultiplier = stance === "eating" ? 0.3 : 1.0;

  const fearFactor = boid.phenotype.fearFactor;

  applyWeightedForces(boid, [
    // Core flocking behaviors (reduced when eating)
    { force: sep, weight: boid.phenotype.separationWeight * flockingMultiplier },
    { force: ali, weight: boid.phenotype.alignmentWeight * flockingMultiplier },
    { force: coh, weight: cohesionWeight * flockingMultiplier },

    // Avoidance behaviors (high priority)
    { force: avoid, weight: parameters.obstacleAvoidanceWeight },
    {
      force: fearResponse.force,
      weight: fearFactor * 3.0,
    },
    { force: deathAvoidance, weight: fearFactor * 1.5 },
    {
      force: predatorFoodAvoidance,
      weight: fearFactor * 2.5,
    },
    { force: crowdAvoidance, weight: 1.0 }, // Already weighted in rule

    // Resource behaviors
    { force: foodSeekingForce, weight: 2.0 },
    { force: orbitForce, weight: 3.0 }, // Strong orbit when eating
  ]);

  // Mate-seeking (conditional, high priority when active) - Session 75 fix
  if (stance === "seeking_mate") {
    applyWeightedForces(boid, [{ force: mateSeekingForce, weight: 2.5 }]);
  }

  // Update velocity with fear-induced speed boost
  boid.velocity = vec.add(boid.velocity, boid.acceleration);

  // Apply adrenaline rush (using pure calculation)
  let effectiveMaxSpeed = boid.phenotype.maxSpeed;
  if (fearResponse.isAfraid && fearFactor > 0) {
    const speedBoost = calculateFearSpeedBoost(fearFactor);
    effectiveMaxSpeed = boid.phenotype.maxSpeed * speedBoost;
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
  context: BoidUpdateContext
): void {
  // Get this boid's type config
  const speciesConfig = context.config.species[boid.typeId];
  if (!speciesConfig) {
    console.warn(`Unknown boid type: ${boid.typeId}`);
    return;
  }

  // Reset acceleration
  boid.acceleration = { x: 0, y: 0 };

  // Dispatch to role-specific update function
  if (speciesConfig.role === "predator") {
    updatePredator(boid, allBoids, context);
  } else {
    updatePrey(boid, allBoids, context);
  }

  // Update position (common for all boids)
  // Scale velocity by deltaSeconds for frame-rate independent movement
  // PERFORMANCE OPTIMIZATION (Session 71): Inline vector operations
  const scale = context.deltaSeconds * 30; // 60 = reference FPS
  boid.position.x += boid.velocity.x * scale;
  boid.position.y += boid.velocity.y * scale;

  // Wrap around edges (toroidal space)
  wrapEdges(boid, context.config.world.width, context.config.world.height);

  // Enforce minimum distance (prevent overlap/stacking)
  enforceMinimumDistance(
    boid,
    allBoids,
    {
      width: context.config.world.width,
      height: context.config.world.height,
    },
    context.config.parameters,
    context.config.species
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
  const minDist =
    speciesConfig?.overrides?.minDistance || parameters.minDistance;
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
