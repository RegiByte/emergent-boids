import { z } from "zod";
import { bodyPartSchema } from "./visual";

/**
 * Genetics System - Type definitions for heritable traits and evolution
 *
 * This module defines the core types for the genetics system:
 * - WorldPhysics: Universal constants that define physical limits
 * - Genome: Heritable traits passed from parents to offspring
 * - BodyPart: Visual traits with mechanical effects
 * - Phenotype: Computed effective values (genome + physics + body parts)
 *
 * Philosophy: "Everything is information processing. Simple rules compose."
 *
 * Evolution emerges from:
 * 1. Variation (mutations)
 * 2. Selection (death filters unsuccessful traits)
 * 3. Inheritance (offspring copy parents with variation)
 * 4. Time (generations reveal patterns)
 */

// ============================================
// Genome Schema
// ============================================

/**
 * Genome - Heritable traits for each individual boid
 *
 * Contains all information passed from parents to offspring.
 * Mutations occur during inheritance.
 *
 * Simple blending inheritance (no recessive traits for now):
 * - Offspring = Parent1 traits × 0.5 + Parent2 traits × 0.5 + mutation
 * - Predictable, fast evolution
 * - Can add genetic memory later if needed
 */
export const genomeSchema = z.object({
  // Physical and behavioral traits (0.0 - 1.0, percentage of physics limits)
  traits: z.object({
    speed: z.number().min(0).max(1), // % of maxSpeed
    force: z.number().min(0).max(1), // % of maxForce
    vision: z.number().min(0).max(1), // % of maxVision
    size: z.number().min(0.5).max(3.0), // Absolute size (within physics limits)
    aggression: z.number().min(0).max(1), // Behavioral trait
    sociability: z.number().min(0).max(1), // Behavioral trait
    efficiency: z.number().min(0).max(1), // Energy efficiency (reduces metabolic cost)

    // Survival-critical traits (evolvable)
    fearResponse: z.number().min(0).max(1), // Fear intensity (0=fearless, 1=very afraid)
    maturityRate: z.number().min(0).max(1), // Reproduction age (0=early, 1=late)
    longevity: z.number().min(0).max(1), // Lifespan (0=short, 1=long)
  }),

  // Visual traits
  visual: z.object({
    color: z.string(), // LAB color (hex string)
    bodyParts: z.array(bodyPartSchema), // List of body parts
  }),

  // Genealogy
  parentIds: z.tuple([z.string(), z.string()]).nullable(), // [motherId, fatherId] or null for genesis
  generation: z.number().int().min(0), // 0 for genesis, parent.generation + 1
  mutations: z
    .array(
      z.object({
        generation: z.number(),
        trait: z.string(),
        oldValue: z.number(),
        newValue: z.number(),
        magnitude: z.number(),
      })
    )
    .optional(), // History of mutations (for analytics)
});

export type Genome = z.infer<typeof genomeSchema>;

// ============================================
// Phenotype Schema
// ============================================

/**
 * Phenotype - Computed effective values
 *
 * Pure function of genome + physics + body parts.
 * Always recomputable, never stored permanently.
 *
 * This is what the simulation actually uses for gameplay.
 * Genome is the "DNA", phenotype is the "expressed organism".
 */
export const phenotypeSchema = z.object({
  // Motion (from physics + genome + body parts)
  maxSpeed: z.number(), // physics.maxSpeed * genome.speed * (1 + bodyPartBonuses.speed)
  maxForce: z.number(), // physics.maxForce * genome.force * (1 + bodyPartBonuses.turnRate)

  // Perception (from physics + genome + body parts)
  visionRange: z.number(), // physics.maxVision * genome.vision * (1 + bodyPartBonuses.vision)

  // Resources (from physics + genome + body parts)
  maxEnergy: z.number(), // 100 * genome.size * physics.energyMultiplier
  maxHealth: z.number(), // 100 * genome.size * physics.healthMultiplier
  energyLossRate: z.number(), // baseMetabolic + movementCost + visionCost + bodyPartCost
  healthRegenRate: z.number(), // physics.baseRegenRate

  // Combat (from physics + genome + body parts)
  attackDamage: z.number(), // physics.baseDamage * genome.size * (1 + bodyPartBonuses.damage)
  defense: z.number(), // bodyPartBonuses.defense (damage reduction %)
  collisionRadius: z.number(), // genome.size * physics.collisionMultiplier * 10
  baseSize: z.number(), // same as collisionRadius (render/physics base)

  // Survival traits (evolvable)
  fearFactor: z.number(), // genome.traits.fearResponse
  minReproductionAge: z.number(), // 5 + genome.traits.maturityRate * 15
  maxAge: z.number(), // 100 + genome.traits.longevity * 200

  // Crowd behavior (from sociability)
  crowdTolerance: z.number(), // 10 + genome.traits.sociability * 40
  crowdAversionStrength: z.number(), // 2.0 - genome.traits.sociability * 1.2

  // Flocking weights (from sociability)
  separationWeight: z.number(), // 1.5 - genome.traits.sociability * 0.5
  alignmentWeight: z.number(), // 1.0 + genome.traits.sociability * 1.5
  cohesionWeight: z.number(), // 1.0 + genome.traits.sociability * 2.0

  // Visual (from genome)
  color: z.string(), // genome.visual.color
  bodyParts: z.array(bodyPartSchema), // genome.visual.bodyParts
});

export type Phenotype = z.infer<typeof phenotypeSchema>;

// ============================================
// Mutation Configuration Schema
// ============================================

/**
 * Mutation Configuration - Controls how traits mutate during inheritance
 *
 * Tunable per species to control evolution speed and diversity.
 */
export const mutationConfigSchema = z.object({
  traitRate: z.number().min(0).max(1).default(0.05), // 5% chance per trait
  traitMagnitude: z.number().min(0).max(1).default(0.1), // ±10% change
  visualRate: z.number().min(0).max(1).default(0.02), // 2% chance of body part mutation
  colorRate: z.number().min(0).max(1).default(0.1), // 10% chance of color shift
});
export type MutationConfig = z.infer<typeof mutationConfigSchema>;
