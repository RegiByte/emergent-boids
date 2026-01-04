import { defaultWorldPhysics } from "@/boids/defaultPhysics.ts";
import type { DomainRNG } from "@/lib/seededRandom";
import {
  calculateEatingSpeedFactor,
  calculateEnergySpeedFactor,
  calculateFearSpeedBoost,
  calculatePredatorChaseWeight,
  calculatePreyCohesionWeight,
} from "./calculations";
import { BoidUpdateContext } from "./context.ts";
import { FOOD_CONSTANTS } from "./food";
import { DEFAULT_MUTATION_CONFIG, inheritGenome } from "./genetics/inheritance";
import { computePhenotype, createGenesisGenome } from "./genetics/phenotype";
import * as rules from "./rules";
import { ItemWithDistance } from "./spatialHash.ts";
import * as vec from "./vector";
import {
  profilerKeywords,
  roleKeywords,
  ruleKeywords,
  stanceKeywords,
} from "./vocabulary/keywords.ts";
import { Boid } from "./vocabulary/schemas/entities";
import type { Genome, MutationConfig } from "./vocabulary/schemas/genetics";
import type {
  PredatorStance,
  PreyStance,
  Vector2,
} from "./vocabulary/schemas/primitives";
import type { SpeciesConfig } from "./vocabulary/schemas/species";
import type {
  SimulationParameters,
  WorldPhysics,
} from "./vocabulary/schemas/world";

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
  age: number | null = null,
  index: number,
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
    speciesConfig.baseGenome.visual,
  );

  // Compute phenotype from genome + physics
  const phenotype = computePhenotype(genome, physics);

  return {
    id: `boid-${boidIdCounter++}`,
    index,
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
    stanceEnteredAtFrame: 0, // Entered at tick 0
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
  index: number,
  parentGenomes?: { parent1: Genome; parent2?: Genome }, // Optional parent genomes for inheritance
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
      enableLogging,
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
      speciesConfig.baseGenome.visual,
    );
  }

  // Compute phenotype from genome + physics
  const phenotype = computePhenotype(genome, physics);

  // Calculate starting energy with bonus
  const baseEnergy = phenotype.maxEnergy / 2; // Start at half energy
  const bonusEnergy = phenotype.maxEnergy * energyBonus;
  const startingEnergy = Math.min(
    baseEnergy + bonusEnergy,
    phenotype.maxEnergy,
  );

  const boid: Boid = {
    id: `boid-${boidIdCounter++}`,
    index,
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
    stanceEnteredAtFrame: 0, // Entered at tick 0
    substate: null, // No substate initially
  };

  return { boid, mutationMetadata };
}

const stanceRules = {
  [stanceKeywords.flocking]: [
    ruleKeywords.separation,
    ruleKeywords.alignment,
    ruleKeywords.cohesion,
    ruleKeywords.avoidObstacles,
  ],
  [stanceKeywords.hunting]: [
    ruleKeywords.chase,
    ruleKeywords.separation,
    ruleKeywords.avoidObstacles,
  ],
  [stanceKeywords.eating]: [
    ruleKeywords.orbitFood,
    ruleKeywords.avoidObstacles,
  ],
  [stanceKeywords.seeking_mate]: [
    ruleKeywords.seekMate,
    ruleKeywords.separation,
    ruleKeywords.avoidObstacles,
  ],
  [stanceKeywords.mating]: [
    ruleKeywords.seekMate,
    ruleKeywords.separation,
    ruleKeywords.avoidObstacles,
  ],
  [stanceKeywords.idle]: [
    ruleKeywords.seekFood,
    ruleKeywords.separation,
    ruleKeywords.avoidObstacles,
  ],
  [stanceKeywords.fleeing]: [
    ruleKeywords.separation,
    ruleKeywords.avoidObstacles,
  ],
};

/**
 * Update a predator boid
 */
function updatePredator(boid: Boid, context: BoidUpdateContext): void {
  const { forcesCollector } = context;
  // Extract context for convenience
  const foodSources = context.simulation.foodSources;
  const parameters = context.config.parameters;
  const speciesTypes = context.config.species;
  const stance = boid.stance as PredatorStance;
  const activeRules = stanceRules[
    stance
  ] as (typeof ruleKeywords)[keyof typeof ruleKeywords][];

  // Find all prey (using pure filter)
  const speciesConfig = speciesTypes[boid.typeId];
  if (!speciesConfig) {
    console.warn(`Unknown species: ${boid.typeId}`);
    return;
  }

  // Stance-based behavior

  const energySpeedFactor = calculateEnergySpeedFactor(
    boid.energy,
    boid.phenotype.maxEnergy,
  );
  let effectiveMaxSpeed = boid.phenotype.maxSpeed * energySpeedFactor;

  for (const rule of activeRules) {
    switch (rule) {
      case ruleKeywords.seekFood: {
        // Seek food to recover energy
        const foodSeek = rules.seekFood(boid, context);
        if (foodSeek.targetFoodId) {
          const foodSeekingForce = foodSeek.force;
          forcesCollector.collect({
            force: foodSeekingForce,
            weight: 2.5,
          });
        }
        break;
      }
      case ruleKeywords.orbitFood: {
        // Find food source we're eating from and orbit it
        const targetFood = foodSources.find((food) => {
          if (food.sourceType !== roleKeywords.predator || food.energy <= 0)
            return false;
          const dx = boid.position.x - food.position.x;
          const dy = boid.position.y - food.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5;
        });

        if (targetFood) {
          const orbitForce = rules.orbitFood(
            boid,
            targetFood.position,
            FOOD_CONSTANTS.FOOD_EATING_RADIUS,
            context,
          );
          forcesCollector.collect({
            force: orbitForce,
            weight: 3.0,
          });
          // slow down while eating
          effectiveMaxSpeed *= calculateEatingSpeedFactor();
        }
        break;
      }
      case ruleKeywords.chase: {
        const chaseWeight = calculatePredatorChaseWeight(stance);
        // Chase prey
        const chaseForce = rules.chase(boid, context);
        forcesCollector.collect({
          force: chaseForce,
          weight: chaseWeight,
        });
        break;
      }
      case ruleKeywords.seekMate: {
        const mateSeekingForce = rules.seekMate(boid, context);
        forcesCollector.collect({
          force: mateSeekingForce,
          weight: 2.5,
        });
        break;
      }
      case ruleKeywords.avoidObstacles: {
        const avoidance = rules.avoidObstacles(boid, context);
        forcesCollector.collect({
          force: avoidance,
          weight: parameters.obstacleAvoidanceWeight,
        });
        break;
      }
      case ruleKeywords.avoidCrowdedAreas: {
        const crowdAvoidance = rules.avoidCrowdedAreas(boid, context);
        forcesCollector.collect({
          force: crowdAvoidance,
          weight: 1.0,
        });
        break;
      }
      case ruleKeywords.separation: {
        const sep = rules.separation(boid, context);
        forcesCollector.collect({
          force: sep,
          weight: boid.phenotype.separationWeight,
        });
        break;
      }
    }
  }

  const forces = forcesCollector.items.filter(
    (force) => force.weight > 0 && force.force.x !== 0 && force.force.y !== 0,
  );

  applyWeightedForces(boid, forces);

  // Update velocity with energy-based speed scaling
  const newVecX = boid.velocity.x + boid.acceleration.x;
  const newVecY = boid.velocity.y + boid.acceleration.y;
  const limitedVelocity = vec.limit(
    { x: newVecX, y: newVecY },
    effectiveMaxSpeed,
  );
  boid.velocity.x = limitedVelocity.x;
  boid.velocity.y = limitedVelocity.y;
}

/**
 * Update a prey boid
 * PERFORMANCE OPTIMIZATION: Only calculates forces needed for current stance
 */
function updatePrey(boid: Boid, context: BoidUpdateContext): void {
  const { forcesCollector } = context;
  // Extract context for convenience
  const { simulation, config } = context;
  const { foodSources } = simulation;
  const { parameters, species: speciesTypes } = config;
  const stance = boid.stance as PreyStance;
  const activeRules = stanceRules[
    stance
  ] as (typeof ruleKeywords)[keyof typeof ruleKeywords][];

  const speciesConfig = speciesTypes[boid.typeId];
  if (!speciesConfig) {
    console.warn(`Unknown species: ${boid.typeId}`);
    return;
  }

  // Calculate effective speed modifiers
  const energySpeedFactor = calculateEnergySpeedFactor(
    boid.energy,
    boid.phenotype.maxEnergy,
  );
  let effectiveMaxSpeed = boid.phenotype.maxSpeed * energySpeedFactor;

  // Always calculate fear-based forces (critical for survival)
  const fearResponse = rules.fear(boid, context);
  const fearFactor = boid.phenotype.fearFactor;

  // Always critical avoidance behaviors
  const deathAvoidance = rules.avoidDeathMarkers(boid, context);
  const predatorFoodAvoidance = rules.avoidPredatorFood(boid, context);
  const crowdAvoidance = rules.avoidCrowdedAreas(boid, context);

  // Apply fear-based forces first (always active)
  forcesCollector.collect({
    force: fearResponse.force,
    weight: fearFactor * 3.0,
  });
  forcesCollector.collect({
    force: deathAvoidance,
    weight: fearFactor * 1.5,
  });
  forcesCollector.collect({
    force: predatorFoodAvoidance,
    weight: fearFactor * 2.5,
  });
  forcesCollector.collect({
    force: crowdAvoidance,
    weight: 1.0,
  });

  // Stance-specific force calculation
  const flockingMultiplier = stance === stanceKeywords.eating ? 0.3 : 1.0;
  const cohesionWeight = calculatePreyCohesionWeight(
    boid.phenotype.cohesionWeight,
    stance,
  );

  for (const rule of activeRules) {
    switch (rule) {
      case ruleKeywords.separation: {
        const sep = rules.separation(boid, context);
        forcesCollector.collect({
          force: sep,
          weight: boid.phenotype.separationWeight * flockingMultiplier,
        });
        break;
      }
      case ruleKeywords.alignment: {
        const ali = rules.alignment(boid, context);
        forcesCollector.collect({
          force: ali,
          weight: boid.phenotype.alignmentWeight * flockingMultiplier,
        });
        break;
      }
      case ruleKeywords.cohesion: {
        const coh = rules.cohesion(boid, context);
        forcesCollector.collect({
          force: coh,
          weight: cohesionWeight * flockingMultiplier,
        });
        break;
      }
      case ruleKeywords.avoidObstacles: {
        const avoidance = rules.avoidObstacles(boid, context);
        forcesCollector.collect({
          force: avoidance,
          weight: parameters.obstacleAvoidanceWeight,
        });
        break;
      }
      case ruleKeywords.seekFood: {
        // Conditional: only seek when hungry in flocking/idle stance
        if (boid.energy < boid.phenotype.maxEnergy * 0.7) {
          const foodSeek = rules.seekFood(boid, context);
          if (foodSeek.targetFoodId) {
            forcesCollector.collect({
              force: foodSeek.force,
              weight: 2.0,
            });
          }
        }
        break;
      }
      case ruleKeywords.orbitFood: {
        // Find food source we're eating from
        const targetFood = foodSources.find((food) => {
          if (food.sourceType !== roleKeywords.prey || food.energy <= 0)
            return false;
          const dx = boid.position.x - food.position.x;
          const dy = boid.position.y - food.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < FOOD_CONSTANTS.FOOD_EATING_RADIUS * 1.5;
        });

        if (targetFood) {
          const orbitForce = rules.orbitFood(
            boid,
            targetFood.position,
            FOOD_CONSTANTS.FOOD_EATING_RADIUS,
            context,
          );
          forcesCollector.collect({
            force: orbitForce,
            weight: 3.0,
          });
          // Slow down while eating
          effectiveMaxSpeed *= calculateEatingSpeedFactor();
        }
        break;
      }
      case ruleKeywords.seekMate: {
        // SEEKING_MATE: Actively search for potential mates
        // MATING: seekMate rule keeps boids together without spiraling
        const mateSeekingForce = rules.seekMate(boid, context);
        forcesCollector.collect({
          force: mateSeekingForce,
          weight: 2.5,
        });
        break;
      }
    }
  }

  // Filter and apply all collected forces
  const forces = forcesCollector.items.filter(
    (force) => force.weight > 0 && (force.force.x !== 0 || force.force.y !== 0),
  );

  applyWeightedForces(boid, forces);

  // Update velocity with fear-induced speed boost
  const newVecX = boid.velocity.x + boid.acceleration.x;
  const newVecY = boid.velocity.y + boid.acceleration.y;

  // Apply adrenaline rush for fear response
  if (fearResponse.isAfraid) {
    const speedBoost = calculateFearSpeedBoost(fearFactor);
    effectiveMaxSpeed = boid.phenotype.maxSpeed * speedBoost;
  }

  const limitedVelocity = vec.limit(
    { x: newVecX, y: newVecY },
    effectiveMaxSpeed,
  );
  boid.velocity.x = limitedVelocity.x;
  boid.velocity.y = limitedVelocity.y;
}

/**
 * Update a single boid based on its neighbors and obstacles
 * Dispatches to role-specific update functions
 */
export function updateBoid(boid: Boid, context: BoidUpdateContext): void {
  const profiler = context.profiler;
  // Get this boid's type config
  const speciesConfig = context.config.species[boid.typeId];
  if (!speciesConfig) {
    console.warn(`Unknown boid type: ${boid.typeId}`);
    return;
  }

  // Reset acceleration
  boid.acceleration = { x: 0, y: 0 };
  context.forcesCollector.reset();

  // Dispatch to role-specific update function
  if (speciesConfig.role === roleKeywords.predator) {
    profiler?.start(profilerKeywords.engine.updatePredator);
    updatePredator(boid, context);
    profiler?.end(profilerKeywords.engine.updatePredator);
  } else {
    profiler?.start(profilerKeywords.engine.updatePrey);
    updatePrey(boid, context);
    profiler?.end(profilerKeywords.engine.updatePrey);
  }

  // Update position (common for all boids)
  // Scale velocity by deltaSeconds for frame-rate independent movement
  // PERFORMANCE OPTIMIZATION: Inline vector operations
  boid.position.x += boid.velocity.x * context.scaledTime;
  boid.position.y += boid.velocity.y * context.scaledTime;

  // Wrap around edges (toroidal space)
  wrapEdges(boid, context.config.world.width, context.config.world.height);

  // Enforce minimum distance (prevent overlap/stacking)
  enforceMinimumDistance(
    boid,
    context.nearbyBoids,
    {
      width: context.config.world.width,
      height: context.config.world.height,
    },
    context.config.parameters,
    context.config.species,
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
  nearbyBoids: ItemWithDistance<Boid>[],
  worldSize: { width: number; height: number },
  parameters: SimulationParameters,
  speciesTypes: Record<string, SpeciesConfig>,
): void {
  const speciesConfig = speciesTypes[boid.typeId];
  const minDist =
    speciesConfig?.overrides?.minDistance || parameters.minDistance;
  if (!speciesConfig) {
    console.warn(`Unknown species: ${boid.typeId}`);
    return;
  }

  for (const { item: other, distance } of nearbyBoids) {
    if (other.id === boid.id) continue;

    // Get other boid's type
    const otherSpeciesConfig = speciesTypes[other.typeId];
    if (!otherSpeciesConfig) {
      console.warn(`Unknown species: ${other.typeId}`);
      continue;
    }

    // Allow predators to overlap with prey (for catching)
    if (
      speciesConfig.role === roleKeywords.predator &&
      otherSpeciesConfig.role === roleKeywords.prey
    )
      continue;
    if (
      speciesConfig.role === roleKeywords.prey &&
      otherSpeciesConfig.role === roleKeywords.predator
    )
      continue;

    // If too close, push apart
    if (distance < minDist && distance > 0) {
      const overlap = minDist - distance;

      // Get toroidal direction vector
      const diff = vec.toroidalSubtract(
        boid.position,
        other.position,
        worldSize.width,
        worldSize.height,
      );

      // Normalize and scale by half the overlap
      const pushVector = vec.setMagnitude(diff, overlap * 0.5);

      boid.position.x += pushVector.x;
      boid.position.y += pushVector.y;
    }
  }
}
