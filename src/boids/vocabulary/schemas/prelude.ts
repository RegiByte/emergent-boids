import { z } from "zod";
import {
  deathCauseKeywords,
  stanceKeywords,
  roleKeywords,
  reproductionTypeKeywords,
  shapeKeywords,
  bodyPartKeywords,
} from "../keywords";
import {
  genomeSchema,
  phenotypeSchema,
  worldPhysicsSchema,
  mutationConfigSchema,
} from "./genetics";

export const vectorSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * Role Schema - Indicates the role of a boid
 *
 * Used to determine the behavior of a boid in the simulation.
 */
export const roleSchema = z.enum([roleKeywords.prey, roleKeywords.predator]);

const preyStanceSchema = z.enum([
  stanceKeywords.flocking, // Prey: Normal flocking behavior
  stanceKeywords.seeking_mate, // Looking for a mate
  stanceKeywords.mating, // Currently mating
  stanceKeywords.fleeing, // Prey: Running from predator
  stanceKeywords.eating, // Orbiting food source
]);

const predatorStanceSchema = z.enum([
  stanceKeywords.hunting, // Predator: Chasing prey
  stanceKeywords.seeking_mate, // Looking for a mate
  stanceKeywords.mating, // Currently mating
  stanceKeywords.idle, // Predator: Low energy, conserving
  stanceKeywords.eating, // Predator: Eating prey / Orbiting food source
]);

/**
 * Stance Schema - Indicates the current behavior of a boid
 *
 * Used to determine how a boid should behave in its current state.
 */

export const stanceSchema = z.union([preyStanceSchema, predatorStanceSchema]);

/**
 * Death Cause Schema - Indicates the cause of a boid's death
 *
 * Used to determine the cause of a boid's death.
 */

export const deathCauseSchema = z.enum([
  deathCauseKeywords.old_age,
  deathCauseKeywords.starvation,
  deathCauseKeywords.predation,
]);

/**
 * Prelude Schemas - Foundational types used across the simulation
 *
 * This file contains core domain types that are shared by multiple systems.
 * These schemas define the basic building blocks of the ecosystem.
 */

// ============================================
// Food Source Schema
// ============================================

/**
 * Food Source - Energy available in the environment
 *
 * Food sources are created from:
 * - Prey deaths (predator food) - Contains 80% of prey's remaining energy
 * - Periodic spawning (prey food) - Plant-based energy for herbivores
 *
 * Boids must orbit food sources to consume energy over time.
 */
export const foodSourceSchemas = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  energy: z.number(), // Current energy remaining (decreases as consumed)
  maxEnergy: z.number(), // Initial energy (used for visual scaling)
  sourceType: z.enum(["prey", "predator"]), // Determines which boids can eat it
  createdTick: z.number(), // Tick when created (for tracking age/decay)
});

export type FoodSource = z.infer<typeof foodSourceSchemas>;

const speciesRoleSchema = z.enum([
  roleKeywords.predator, // Hunts prey
  roleKeywords.prey, // Eats plants, escapes predators
]);

export const reproductionTypeSchema = z.enum([
  reproductionTypeKeywords.sexual, // Sexual reproduction needs a mate
  reproductionTypeKeywords.asexual, // Asexual reproduction does not need a mate
]);

export const shapeSchema = z.enum([
  shapeKeywords.diamond,
  shapeKeywords.circle,
  shapeKeywords.hexagon,
  shapeKeywords.square,
  shapeKeywords.triangle,
]);
export const bodyPartSchema = z.enum([
  bodyPartKeywords.eyes,
  bodyPartKeywords.fins,
  bodyPartKeywords.spikes,
  bodyPartKeywords.tail,
  bodyPartKeywords.glow,
]);

/**
 * Species Configuration - Defines behavior and characteristics of a species
 *
 * Updated with genetics system:
 * - baseGenome: Starting traits for genesis boids
 * - mutation: Mutation rates for evolution
 * - Legacy fields kept for backward compatibility (will be phased out)
 *
 * Each species has its own configuration.
 */
export const speciesConfigSchema = z.object({
  id: z.string(), // Unique identifier of species
  name: z.string(), // Display name
  role: speciesRoleSchema, // "predator" or "prey"

  // Genetics (NEW) - Base genome and mutation configuration
  baseGenome: z
    .object({
      traits: z.object({
        speed: z.number().min(0).max(1), // % of physics.maxSpeed
        force: z.number().min(0).max(1), // % of physics.maxForce
        vision: z.number().min(0).max(1), // % of physics.maxVision
        size: z.number().min(0.5).max(3.0), // Absolute size
        aggression: z.number().min(0).max(1), // Behavioral trait
        sociability: z.number().min(0).max(1), // Behavioral trait
        efficiency: z.number().min(0).max(1), // Energy efficiency
      }),
      visual: z.object({
        color: z.string(), // LAB color (hex string)
        bodyParts: z.array(z.any()), // Will be properly typed as BodyPart[]
      }),
    })
    .optional(), // Optional for backward compatibility

  mutation: mutationConfigSchema.optional(), // Mutation rates (optional, uses defaults if not specified)

  // Movement behavior - Flocking rules and physics (LEGACY - will be moved to baseGenome)
  movement: z.object({
    minDistance: z.number().optional(), // Minimum distance from other boids (overrides global)
    separationWeight: z.number(), // How strongly to avoid crowding
    alignmentWeight: z.number(), // How strongly to match neighbor velocities
    cohesionWeight: z.number(), // How strongly to move toward group center
    maxSpeed: z.number(), // Maximum velocity magnitude
    maxForce: z.number(), // Maximum steering force (affects turning speed)
    trailLength: z.number(), // Number of positions to keep for motion trails
    crowdAversionThreshold: z.number(), // Max nearby boids before avoiding crowded areas
    crowdAversionWeight: z.number(), // Strength of crowd avoidance force (0-3)
  }),

  // Lifecycle - Energy, aging, and survival (LEGACY - will be moved to baseGenome)
  lifecycle: z.object({
    maxEnergy: z.number(), // Maximum energy capacity
    energyGainRate: z.number(), // Energy gained per second (prey) or per catch (predator)
    energyLossRate: z.number(), // Energy lost per second (movement cost)
    maxAge: z.number(), // Maximum lifespan in seconds (0 = immortal)
    fearFactor: z.number(), // Fear response strength (0 = fearless, 1 = very afraid)
  }),

  // Reproduction - Mating and offspring
  reproduction: z.object({
    type: reproductionTypeSchema, // "sexual" (needs mate) or "asexual" (solo)
    offspringCount: z.number(), // Number of offspring per reproduction (1-2 for twins)
    offspringEnergyBonus: z.number(), // Extra starting energy for offspring (0-1 ratio)
    cooldownTicks: z.number().optional(), // Ticks to wait before reproducing again (overrides global)
    mutationConfig: z
      .object({
        traitRate: z.number().min(0).max(1).optional(), // Mutation chance per trait (default 0.05)
        traitMagnitude: z.number().min(0).max(1).optional(), // Mutation magnitude (default 0.1)
        visualRate: z.number().min(0).max(1).optional(), // Body part mutation chance (default 0.02)
        colorRate: z.number().min(0).max(1).optional(), // Color mutation chance (default 0.1)
      })
      .optional(), // Optional mutation configuration (uses defaults if not provided)
  }),

  // Limits - Population caps and parameter overrides
  limits: z.object({
    maxPopulation: z.number().optional(), // Maximum population for this species
    fearRadius: z.number().optional(), // How far this species can sense predators (overrides global)
  }),

  // Affinities - Inter-species relationships (optional)
  // Maps species ID to affinity value (-1.0 to 1.0)
  // - 1.0: Strong attraction (flock together)
  // - 0.5: Neutral (default if not specified)
  // - 0.0: Indifferent (minimal interaction)
  // - -0.5: Repulsion (actively avoid)
  // Same species always defaults to 1.0 if not specified
  affinities: z.record(z.string(), z.number().min(-1).max(1)).optional(),

  // Visual appearance - How this species is rendered (LEGACY - kept for backward compatibility)
  visual: z.object({
    color: z.string(), // Hex color for rendering (e.g., "#00ff88")
    shape: shapeSchema, // Shape type for rendering
    size: z.number().min(0.5).max(2.0).default(1.0), // Size multiplier
    trail: z.boolean().default(true), // Whether this species leaves motion trails
    trailColor: z.string().optional(), // Optional trail color override (hex color, defaults to species color)
    bodyParts: z.array(bodyPartSchema).optional(), // Optional body parts for visual variety
    tailColor: z.string().optional(), // Optional tail color override (hex color)
  }),
});

export const speciesRecordSchema = z.record(z.string(), speciesConfigSchema);

/**
 * Boid Schema - Defines the structure of a boid in the simulation
 *
 * Updated with genetics system:
 * - genome: Heritable traits (DNA)
 * - phenotype: Computed effective values (expressed organism)
 * - health: Damage buffer (separate from energy)
 */
export const boidSchema = z.object({
  id: z.string(),
  position: vectorSchema,
  velocity: vectorSchema,
  acceleration: vectorSchema,
  typeId: z.string(),

  // Genetics (NEW)
  genome: genomeSchema, // Heritable traits
  phenotype: phenotypeSchema, // Computed effective values

  // Resources (UPDATED)
  energy: z.number(), // Current energy (0 - phenotype.maxEnergy)
  health: z.number(), // Current health (0 - phenotype.maxHealth) [NEW]

  // Lifecycle
  age: z.number(), // Age in seconds
  reproductionCooldown: z.number(), // Time passages until can reproduce again (0 = ready)
  seekingMate: z.boolean(), // Cached state: actively seeking mate (updated by lifecycleManager)
  mateId: z.string().nullable(), // ID of current mate (if paired)
  matingBuildupCounter: z.number(), // Time passages spent close to mate (0-3, reproduce at 3)
  eatingCooldown: z.number(), // Time passages until can eat from food again (prevents monopolizing food)
  attackCooldown: z.number(), // Time passages until can attack again (predators only)
  stance: stanceSchema, // Current behavioral stance
  previousStance: stanceSchema.nullable(), // Previous stance (for returning from fleeing)
  positionHistory: z.array(vectorSchema), // Trail of recent positions for rendering motion trails
});

/**
 * Death Marker - Marks dangerous locations where boids died
 *
 * Created when boids die from starvation or old age (not predation).
 * Prey avoid death markers, creating emergent "danger zones".
 *
 * Consolidation: Multiple deaths within 100px radius strengthen existing markers
 * instead of creating new ones, preventing marker spam.
 */
export const deathMarkerSchema = z.object({
  position: z.object({ x: z.number(), y: z.number() }),
  remainingTicks: z.number(), // Countdown timer (decreases each tick, marker fades)
  strength: z.number(), // Repulsive force strength (1.0-5.0, increases with consolidation)
  maxLifetimeTicks: z.number(), // Maximum lifetime (20 ticks, prevents immortal markers)
  typeId: z.string(), // Species ID of boid that died (determines marker color)
});

/**
 * Obstacle - Physical barrier in the environment
 *
 * All boids avoid obstacles using steering forces.
 * Obstacles are circular and immovable.
 */
export const obstacleSchema = z.object({
  position: z.object({ x: z.number(), y: z.number() }),
  radius: z.number(), // Obstacle radius in pixels
});

// ============================================
// Simulation Parameters Schema
// ============================================

/**
 * Simulation Parameters - Global rules that govern all species
 *
 * These are world-level constants that affect all boids.
 * Species-specific overrides are defined in SpeciesConfig.limits.
 */
export const simulationParametersSchema = z.object({
  // Perception and interaction radii (in pixels)
  perceptionRadius: z.number(), // How far boids can see neighbors for flocking
  obstacleAvoidanceWeight: z.number(), // Steering force strength for avoiding obstacles
  fearRadius: z.number(), // How far prey can sense predators
  fearFactor: z.number(), // Baseline fear factor for all species
  chaseRadius: z.number(), // How far predators can sense prey
  catchRadius: z.number(), // How close predator must be to catch prey
  mateRadius: z.number(), // How close boids must be to initiate mating
  minDistance: z.number(), // Minimum distance between boids (prevents overlap/stacking)

  // Population limits (safety caps)
  maxBoids: z.number(), // Global population cap (hard limit for performance)
  maxPreyBoids: z.number(), // Maximum total prey population
  maxPredatorBoids: z.number(), // Maximum total predator population

  // Lifecycle parameters (timing and thresholds)
  minReproductionAge: z.number(), // Minimum age to start reproducing (seconds)
  reproductionEnergyThreshold: z.number(), // Energy % needed to seek mates (0-1 ratio)
  reproductionCooldownTicks: z.number(), // Ticks to wait before reproducing again
  matingBuildupTicks: z.number(), // Ticks boids must stay close before reproducing
  eatingCooldownTicks: z.number(), // Ticks predator must wait after eating (prevents monopolizing food)
  attackCooldownTicks: z.number(), // Ticks predator must wait between attacks
});

/**
 * Physical dimensions and initial conditions
 *
 * Defines the simulation space and starting populations.
 * The world uses toroidal (wrap-around) topology.
 */
export const worldConfigSchema = z.object({
  width: z.number(), // World width in pixels
  height: z.number(), // World height in pixels
  backgroundColor: z.string(), // World background color (CSS color)
  initialPreyCount: z.number(), // Number of prey to spawn at start
  initialPredatorCount: z.number().optional(), // Number of predators to spawn at start
});

/**
 * Simulation Profile - Complete preset for a simulation scenario
 *
 * Profiles are immutable configurations that define:
 * - World dimensions and initial populations
 * - Species definitions and behaviors
 * - Global simulation parameters
 * - World physics (NEW) - Universal constants for this world
 *
 * Think of profiles as "game levels" or "experimental conditions".
 * They can be shared, saved, and loaded as JSON files.
 *
 * Examples: "stable-ecosystem", "predator-paradise", "chaos-mode"
 */
export const simulationProfileSchema = z.object({
  id: z.string(), // Unique profile identifier
  seed: z.string(), // Seed for reproducible randomness
  name: z.string(), // Display name
  description: z.string(), // Human-readable description
  world: worldConfigSchema, // Physical world setup
  species: speciesRecordSchema, // All species in this scenario
  parameters: simulationParametersSchema, // Global rules
  physics: worldPhysicsSchema.optional(), // World physics (NEW - optional, uses defaults if not specified)
});

// ============================================
// Type Exports
// ============================================

export type SimulationParameters = z.infer<typeof simulationParametersSchema>;
export type SimulationProfile = z.infer<typeof simulationProfileSchema>;
export type WorldConfig = z.infer<typeof worldConfigSchema>;
export type SpeciesRecord = z.infer<typeof speciesRecordSchema>;
export type DeathMarker = z.infer<typeof deathMarkerSchema>;
export type SpeciesRole = z.infer<typeof speciesRoleSchema>;
export type ReproductionType = z.infer<typeof reproductionTypeSchema>;
export type SpeciesConfig = z.infer<typeof speciesConfigSchema>;
export type PreyStance = z.infer<typeof preyStanceSchema>;
export type PredatorStance = z.infer<typeof predatorStanceSchema>;
export type BoidStance = z.infer<typeof stanceSchema>;
export type Boid = z.infer<typeof boidSchema>;
export type Vector2 = z.infer<typeof vectorSchema>;
export type Obstacle = z.infer<typeof obstacleSchema>;
export type RenderShapeType = z.infer<typeof shapeSchema>;
export type RenderBodyPartType = z.infer<typeof bodyPartSchema>;
