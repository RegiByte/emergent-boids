import z from "zod";
import {
  deathCauseKeywords,
  renderModeKeywords,
  reproductionTypeKeywords,
  roleKeywords,
  stanceKeywords,
} from "../keywords";

/**
 * Primitive Schemas - Foundational types with zero dependencies
 *
 * This file contains the most basic building blocks of the simulation.
 * No imports from other schema files - only from keywords.
 *
 * Philosophy: Start with the simplest possible types, compose upward.
 */

/**
 * Vector2 - 2D position or velocity
 *
 * The most primitive type in the simulation.
 * Everything has a position or direction.
 */
export const vectorSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Vector2 = z.infer<typeof vectorSchema>;

/**
 * Role Schema - Indicates the role of a boid
 *
 * Used to determine the behavior of a boid in the simulation.
 */
export const roleSchema = z.enum([roleKeywords.prey, roleKeywords.predator]);

export type Role = z.infer<typeof roleSchema>;

// ============================================
// Stance Schemas
// ============================================

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

export type PreyStance = z.infer<typeof preyStanceSchema>;
export type PredatorStance = z.infer<typeof predatorStanceSchema>;
export type BoidStance = z.infer<typeof stanceSchema>;

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

export type DeathCause = z.infer<typeof deathCauseSchema>;

export const reproductionTypeSchema = z.enum([
  reproductionTypeKeywords.sexual, // Sexual reproduction needs a mate
  reproductionTypeKeywords.asexual, // Asexual reproduction does not need a mate
]);

export type ReproductionType = z.infer<typeof reproductionTypeSchema>;

export const renderModeSchema = z.enum([
  renderModeKeywords.canvas,
  renderModeKeywords.webgl,
]);
export type RenderMode = z.infer<typeof renderModeSchema>;
