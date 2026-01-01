import { z } from "zod";
import { bodyPartKeywords, shapeKeywords } from "../keywords";

/**
 * Visual Schemas - Rendering and appearance types
 *
 * This file contains all visual/rendering-related schemas.
 * Used by both genetics (heritable visual traits) and rendering systems.
 *
 * Dependencies: None (except keywords)
 */

// ============================================
// Shape Type Schema
// ============================================

export const shapeTypeSchema = z.enum([
  shapeKeywords.diamond,
  shapeKeywords.circle,
  shapeKeywords.hexagon,
  shapeKeywords.square,
  shapeKeywords.triangle,
  // Session 98: New shapes from expanded atlas
  shapeKeywords.oval,
  shapeKeywords.rectangle,
  shapeKeywords.pentagon_inverted,
  shapeKeywords.heptagon,
  shapeKeywords.nonagon,
  shapeKeywords.trapezoid,
]);

export type RenderShapeType = z.infer<typeof shapeTypeSchema>;

// ============================================
// Body Part Type Schema
// ============================================

export const bodyPartTypeSchema = z.enum([
  bodyPartKeywords.eye,
  bodyPartKeywords.fin,
  bodyPartKeywords.spike,
  bodyPartKeywords.tail,
  bodyPartKeywords.antenna,
  bodyPartKeywords.glow,
  bodyPartKeywords.shell,
]);

export type RenderBodyPartType = z.infer<typeof bodyPartTypeSchema>;

// ============================================
// Body Part Schema
// ============================================

/**
 * Body Part - Visual traits with mechanical effects
 *
 * Key Decision: Use **list** instead of map for unlimited variety.
 *
 * Benefits:
 * - Allows multiple instances (1 eye, 2 eyes, 8 eyes like spiders!)
 * - Each part has position, size, rotation
 * - Effects are **additive** (more parts = more bonus)
 * - Energy cost scales with part count (trade-off)
 * - Inheritance mixes parts from both parents
 * - Mutations can add/remove/modify parts
 *
 * **Size Semantics (Session 98):**
 * - Size is percentage of body collision radius
 * - 0.5 = 50% of body (small part)
 * - 1.0 = 100% of body (fills collision circle)
 * - 2.0 = 200% of body (extends dramatically beyond)
 *
 * **Position:** Relative to body center (-1 to 1)
 * **Rotation:** Degrees relative to boid heading
 * **Effects:** Additive bonuses (more parts = more effect + more cost)
 */
export const bodyPartSchema = z.object({
  type: bodyPartTypeSchema,
  size: z.number().min(0.1).max(3.0), // Percentage of body radius (0.1-3.0 = 10%-300%)
  position: z.object({
    x: z.number().min(-10).max(10), // Relative to body center
    y: z.number().min(-10).max(10),
  }),
  rotation: z.number().min(-360).max(360), // Degrees

  // Mechanical effects (additive across all parts)
  effects: z.object({
    visionBonus: z.number().optional(), // +% vision range (eyes)
    turnRateBonus: z.number().optional(), // +% turn rate (fins)
    speedBonus: z.number().optional(), // +% speed (tail)
    damageBonus: z.number().optional(), // +% attack damage (spikes)
    defenseBonus: z.number().optional(), // +% damage reduction (shell)
    energyCost: z.number().optional(), // +% energy consumption (cost of having part)
  }),
});

export type BodyPart = z.infer<typeof bodyPartSchema>;
