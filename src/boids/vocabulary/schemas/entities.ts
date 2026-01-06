import { z } from "zod";
import { vectorSchema, roleSchema, stanceSchema } from "./primitives";
import { genomeSchema, phenotypeSchema } from "./genetics";

/**
 * Entity Schemas - Core simulation entities
 *
 * This file contains the main entities that exist in the simulation world:
 * - Boid: The autonomous agents
 * - FoodSource: Energy available in the environment
 * - Obstacle: Physical barriers
 * - DeathMarker: Danger zones where boids died
 *
 * Dependencies: primitives, genetics
 */

// ============================================
// Boid Schema
// ============================================

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
  isDead: z.boolean().default(false),
  index: z.number(), // index when the boid was added, may change over time, used for tracking shared buffer state
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
  matingBuildupFrames: z.number(), // Frames spent close to mate (0-3, reproduce at 3)
  eatingCooldownFrames: z.number(), // Frames until can eat from food again (prevents monopolizing food)
  attackCooldownFrames: z.number(), // Frames until can attack again (predators only)
  stance: stanceSchema, // Current behavioral stance
  previousStance: stanceSchema.nullable(), // Previous stance (for returning from fleeing)
  positionHistory: z.array(vectorSchema), // Trail of recent positions for rendering motion trails

  // Target tracking (NEW - Session 74: Behavior Scoring System)
  targetId: z.string().nullable().default(null), // ID of locked target (predators only)
  targetLockFrame: z.number().default(0), // Frames spent locked on current target
  targetLockStrength: z.number().min(0).max(1).default(0), // Lock strength (1.0 = full lock, decays when target escapes)

  // Mate commitment tracking (NEW - Session 75: Mate Persistence)
  mateCommitmentFrames: z.number().default(0), // Frames spent with current mate (prevents switching)

  // Stance transition tracking (Session 74: Behavior Scoring System)
  stanceEnteredAtFrame: z.number().default(0), // Frame when current stance was entered
  substate: z.string().nullable().default(null), // Rich substate (e.g., "searching", "chasing", "panic")

  knockbackVelocity: vectorSchema.nullable().default(null), // Velocity applied during knockback (for escape momentum)
  knockbackFramesRemaining: z.number().default(0), // Frames remaining for knockback effect
});

export type Boid = z.infer<typeof boidSchema>;
export type LogicalBoid = Omit<Boid, "position" | "velocity" | "acceleration">;
export type PhysicalBoid = Pick<Boid, "position" | "velocity" | "acceleration">;

export const boidsById = z.record(z.string(), boidSchema);
export type BoidsById = z.infer<typeof boidsById>;


export const offspringDataSchema = z.object({
  parent1Id: z.string(),
  parent2Id: z.string().optional(),
  typeId: z.string(),
  position: vectorSchema,
});
export type OffspringData = z.infer<typeof offspringDataSchema>;

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
export const foodSourceSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  energy: z.number(), // Current energy remaining (decreases as consumed)
  maxEnergy: z.number(), // Initial energy (used for visual scaling)
  sourceType: roleSchema, // Determines which boids can eat it
  createdFrame: z.number(), // Frame when created (for tracking age/decay)
});

export type FoodSource = z.infer<typeof foodSourceSchema>;

// ============================================
// Obstacle Schema
// ============================================

/**
 * Obstacle - Physical barrier in the environment
 *
 * All boids avoid obstacles using steering forces.
 * Obstacles are circular and immovable.
 */
export const obstacleSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  radius: z.number(), // Obstacle radius in pixels
});

export type Obstacle = z.infer<typeof obstacleSchema>;

// ============================================
// Death Marker Schema
// ============================================

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
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  remainingFrames: z.number(), // Countdown timer (decreases each frame, marker fades)
  strength: z.number(), // Repulsive force strength (1.0-5.0, increases with consolidation)
  maxLifetimeFrames: z.number(), // Maximum lifetime (600 frames, prevents immortal markers)
  typeId: z.string(), // Species ID of boid that died (determines marker color)
});

export type DeathMarker = z.infer<typeof deathMarkerSchema>;
