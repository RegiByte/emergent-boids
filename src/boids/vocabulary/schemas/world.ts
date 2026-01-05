import { z } from "zod";
import { speciesRecordSchema } from "./species";

/**
 * World Schemas - World configuration and simulation profiles
 *
 * This file defines the "universe" of a simulation:
 * - World dimensions and initial conditions
 * - Global simulation parameters
 * - Complete simulation profiles (worlds)
 *
 * Dependencies: species
 */

// ============================================
// World Physics Schema
// ============================================

/**
 * World Physics - Universal constants that define physical limits
 *
 * These values define the "possible" - all traits operate within these bounds.
 * Trait values become percentages of physics limits, making them meaningful
 * and comparable across species.
 *
 * Benefits:
 * - Trait values are meaningful (percentage of possible)
 * - Easy to balance (adjust physics, not every species)
 * - Trade-offs emerge naturally (high speed = high energy cost)
 * - Comparable across species (0.8 speed always means same thing)
 *
 * Note: This is profile configuration, not a resource.
 * Different profiles can have different physics!
 */
export const worldPhysicsSchema = z.object({
  // Motion physics
  motion: z.object({
    maxSpeed: z.number().default(10.0), // Absolute speed limit
    maxForce: z.number().default(0.5), // Absolute turning force
    friction: z.number().default(0.98), // Velocity damping
  }),

  // Energy costs
  energy: z.object({
    baseMetabolicRate: z.number().default(0.01), // Minimum cost per tick (breathing)
    movementCostPerSpeed: z.number().default(0.001), // Cost per unit of speed
    visionCostPerUnit: z.number().default(0.0001), // Cost per unit of vision range
    combatCost: z.number().default(0.05), // Cost per attack
  }),

  // Perception limits
  perception: z.object({
    maxVisionRange: z.number().default(300), // Absolute vision limit
  }),

  // Size effects
  size: z.object({
    min: z.number().default(0.5), // Minimum boid size
    max: z.number().default(3.0), // Maximum boid size
    energyMultiplier: z.number().default(1.5), // Larger = more energy capacity
    healthMultiplier: z.number().default(2.0), // Larger = more health
    collisionMultiplier: z.number().default(1.0), // Size affects collision radius
  }),

  // Combat mechanics
  combat: z.object({
    baseDamage: z.number().default(10), // Base attack damage
    sizeMultiplier: z.number().default(1.5), // Larger = more damage
  }),

  // Health mechanics
  health: z.object({
    baseRegenRate: z.number().default(0.05), // Health regen per tick
    foodHealingMultiplier: z.number().default(0.5), // % of energy gained also heals
  }),
});

export type WorldPhysics = z.infer<typeof worldPhysicsSchema>;

// ============================================
// World Configuration Schema
// ============================================

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

export type WorldConfig = z.infer<typeof worldConfigSchema>;

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
  reproductionCooldownFrames: z.number(), // Frames to wait before reproducing again
  matingBuildupFrames: z.number(), // Frames boids must stay close before reproducing
  eatingCooldownFrames: z.number(), // Frames predator must wait after eating (prevents monopolizing food)
  attackCooldownFrames: z.number(), // Frames predator must wait between attacks
});

export type SimulationParameters = z.infer<typeof simulationParametersSchema>;

// ============================================
// Simulation Profile Schema
// ============================================

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

export type SimulationProfile = z.infer<typeof simulationProfileSchema>;
