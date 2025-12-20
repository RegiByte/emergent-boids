/**
 * Vocabulary - Single Source of Truth for Event and Effect Types
 *
 * This file defines all event and effect schemas using Zod.
 * Benefits:
 * - Runtime validation
 * - Type inference from schemas
 * - Single source of truth
 * - Autocomplete support
 * - Refactoring safety
 */

import { z } from "zod";

// ============================================
// Event Keywords
// ============================================

export const eventKeywords = {
  // Control events (per-type)
  controls: {
    typeConfigChanged: "controls/typeConfigChanged",
    perceptionRadiusChanged: "controls/perceptionRadiusChanged",
    obstacleAvoidanceChanged: "controls/obstacleAvoidanceChanged",
  },
  // Obstacle events
  obstacles: {
    added: "obstacles/obstacleAdded",
    removed: "obstacles/obstacleRemoved",
    cleared: "obstacles/obstaclesCleared",
  },
} as const;

// ============================================
// Effect Keywords
// ============================================

export const effectKeywords = {
  // State effects
  state: {
    update: "state:update",
  },
} as const;

// ============================================
// Event Schemas
// ============================================

export const controlEventSchemas = {
  setTypeConfig: z.object({
    type: z.literal(eventKeywords.controls.typeConfigChanged),
    typeId: z.string(),
    field: z.enum([
      "separationWeight",
      "alignmentWeight",
      "cohesionWeight",
      "maxSpeed",
      "maxForce",
    ]),
    value: z.number(),
  }),
  setPerceptionRadius: z.object({
    type: z.literal(eventKeywords.controls.perceptionRadiusChanged),
    value: z.number(),
  }),
  setObstacleAvoidance: z.object({
    type: z.literal(eventKeywords.controls.obstacleAvoidanceChanged),
    value: z.number(),
  }),
};

export const obstacleEventSchemas = {
  addObstacle: z.object({
    type: z.literal(eventKeywords.obstacles.added),
    x: z.number(),
    y: z.number(),
    radius: z.number(),
  }),
  removeObstacle: z.object({
    type: z.literal(eventKeywords.obstacles.removed),
    index: z.number(),
  }),
  clearObstacles: z.object({
    type: z.literal(eventKeywords.obstacles.cleared),
  }),
};

// Union of all control events
export const controlEventSchema = z.discriminatedUnion("type", [
  controlEventSchemas.setTypeConfig,
  controlEventSchemas.setPerceptionRadius,
  controlEventSchemas.setObstacleAvoidance,
]);

// Union of all obstacle events
export const obstacleEventSchema = z.discriminatedUnion("type", [
  obstacleEventSchemas.addObstacle,
  obstacleEventSchemas.removeObstacle,
  obstacleEventSchemas.clearObstacles,
]);

// Union of all events
export const allEventSchema = z.union([
  controlEventSchema,
  obstacleEventSchema,
]);

// ============================================
// Runtime State Schema (Single Source of Truth)
// ============================================

// Boid type config schema
export const boidTypeConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  separationWeight: z.number(),
  alignmentWeight: z.number(),
  cohesionWeight: z.number(),
  maxSpeed: z.number(),
  maxForce: z.number(),
});

export const runtimeStateSchema = z.object({
  perceptionRadius: z.number(),
  obstacleAvoidanceWeight: z.number(),
  obstacles: z.array(
    z.object({
      position: z.object({ x: z.number(), y: z.number() }),
      radius: z.number(),
    })
  ),
  types: z.record(z.string(), boidTypeConfigSchema),
});

// Partial version for state updates (all fields optional)
export const partialRuntimeStateSchema = runtimeStateSchema.partial();

// ============================================
// Effect Schemas
// ============================================

export const controlEffectSchemas = {
  stateUpdate: z.object({
    type: z.literal(effectKeywords.state.update),
    state: partialRuntimeStateSchema,
  }),
};

// Union of all control effects
export const controlEffectSchema = z.discriminatedUnion("type", [
  controlEffectSchemas.stateUpdate,
]);

// ============================================
// Inferred Types
// ============================================

export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type PartialRuntimeState = z.infer<typeof partialRuntimeStateSchema>;
export type ControlEvent = z.infer<typeof controlEventSchema>;
export type ObstacleEvent = z.infer<typeof obstacleEventSchema>;
export type AllEvent = z.infer<typeof allEventSchema>;
export type ControlEffect = z.infer<typeof controlEffectSchema>;
