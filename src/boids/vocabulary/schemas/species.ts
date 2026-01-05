import { z } from "zod";
import { reproductionTypeSchema, roleSchema } from "./primitives";
import { shapeTypeSchema, bodyPartSchema } from "./visual";
import { mutationConfigSchema } from "./genetics";

/**
 * Species Schemas - Species configuration and relationships
 *
 * This file defines how species are configured, including their
 * base genome, visual preferences, reproduction rules, and limits.
 *
 * Dependencies: primitives, visual, genetics
 */

// ============================================
// Species Configuration Schema
// ============================================

/**
 * Species Configuration - Defines behavior and characteristics of a species
 *
 * UNIFIED GENOME-BASED ARCHITECTURE (Session 69)
 * - baseGenome: Required - Starting traits for genesis boids (evolvable)
 * - visualConfig: Required - Non-evolvable visual preferences (shape, trails)
 * - mutation: Optional - Mutation rates for evolution
 * - overrides: Optional - Species-specific parameter tweaks
 *
 * Legacy fields (movement, lifecycle, visual) have been removed.
 * All behavior now flows from genome → phenotype → behavior.
 *
 * Each species has its own configuration.
 */
export const speciesConfigSchema = z.object({
  id: z.string(), // Unique identifier of species
  name: z.string(), // Display name
  role: roleSchema, // "prey" or "predator"

  // Base genome (evolvable traits) required
  baseGenome: z.object({
    traits: z.object({
      speed: z.number().min(0).max(1), // % of physics.maxSpeed
      force: z.number().min(0).max(1), // % of physics.maxForce
      vision: z.number().min(0).max(1), // % of physics.maxVision
      size: z.number().min(0.5).max(3.0), // Absolute size
      aggression: z.number().min(0).max(1), // Behavioral trait
      sociability: z.number().min(0).max(1), // Behavioral trait
      efficiency: z.number().min(0).max(1), // Energy efficiency
      fearResponse: z.number().min(0).max(1), // Fear intensity (0=fearless, 1=very afraid)
      maturityRate: z.number().min(0).max(1), // Reproduction age (0=early, 1=late)
      longevity: z.number().min(0).max(1), // Lifespan (0=short, 1=long)
    }),
    visual: z.object({
      color: z.string(), // LAB color (hex string)
      bodyParts: z.array(bodyPartSchema), // Will be properly typed as BodyPart[]
    }),
  }),

  // Visual configuration (non-evolvable, species-level) required
  visualConfig: z.object({
    shape: shapeTypeSchema, // Render shape (diamond, circle, hexagon, etc.)
    trail: z.boolean().default(true), // Enable motion trails
    trailLength: z.number().default(10), // Trail history size (positions to keep)
    trailColor: z.string().optional(), // Custom trail color override (hex)
    tailColor: z.string().optional(), // Custom tail color override (hex)
  }),

  // Mutation configuration optional
  mutation: mutationConfigSchema.optional(), // Mutation rates (optional, uses defaults if not specified)

  // Reproduction - Mating and offspring required
  reproduction: z.object({
    type: reproductionTypeSchema, // "sexual" (needs mate) or "asexual" (solo)
    offspringCount: z.number(), // Number of offspring per reproduction (1-2 for twins)
    offspringEnergyBonus: z.number(), // Extra starting energy for offspring (0-1 ratio)
    cooldownFrames: z.number().optional(), // Frames to wait before reproducing again (overrides global)
  }),

  // Limits - Population caps and parameter overrides required
  limits: z.object({
    maxPopulation: z.number().optional(), // Maximum population for this species
    fearRadius: z.number().optional(), // How far this species can sense predators (overrides global)
  }),

  // Parameter overrides (species-specific tweaks) optional
  overrides: z
    .object({
      minDistance: z.number().optional(), // Personal space override
    })
    .optional(),

  // Affinities - Inter-species relationships (optional)
  // Maps species ID to affinity value (-1.0 to 1.0)
  // - 1.0: Strong attraction (flock together)
  // - 0.5: Neutral (default if not specified)
  // - 0.0: Indifferent (minimal interaction)
  // - -0.5: Repulsion (actively avoid)
  // Same species always defaults to 1.0 if not specified
  affinities: z.record(z.string(), z.number().min(-1).max(1)).optional(),
});

export const speciesRecordSchema = z.record(z.string(), speciesConfigSchema);

export type SpeciesConfig = z.infer<typeof speciesConfigSchema>;
export type SpeciesRecord = z.infer<typeof speciesRecordSchema>;
