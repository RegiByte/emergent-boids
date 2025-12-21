import { z } from "zod";
import { effectKeywords } from "../keywords.ts";
import { allEventSchema } from "./events.ts";
import { runtimeStoreSchema } from "./state.ts";
import { vectorSchema, stanceSchema } from "./prelude.ts";

/**
 * Effect Schemas - Side effects produced by event handlers
 *
 * Effects are the "what to do" instructions produced by pure event handlers.
 * Effect executors perform the actual side effects (state updates, timer scheduling, etc.)
 *
 * This separation enables:
 * - Pure event handlers (testable)
 * - Composable effects
 * - Clear side effect boundaries
 */

// ============================================
// Control Effects - System operations
// ============================================

export const controlEffectSchemas = {
  // Update runtime store state
  stateUpdate: z.object({
    type: z.literal(effectKeywords.state.update),
    state: runtimeStoreSchema.partial(), // Partial update (merge with existing)
  }),
  // Schedule a timer to dispatch an event after delay
  timerSchedule: z.object({
    type: z.literal(effectKeywords.timer.schedule),
    id: z.string(), // Timer identifier (for cancellation)
    delayMs: z.number(), // Delay in milliseconds
    onExpire: allEventSchema, // Event to dispatch when timer expires
  }),
  // Cancel a scheduled timer
  timerCancel: z.object({
    type: z.literal(effectKeywords.timer.cancel),
    id: z.string(), // Timer identifier to cancel
  }),
  // Add a boid to the engine (used for spawning)
  engineAddBoid: z.object({
    type: z.literal(effectKeywords.engine.addBoid),
    boid: z.object({
      id: z.string(),
      position: vectorSchema,
      velocity: vectorSchema,
      acceleration: vectorSchema,
      typeId: z.string(), // Species ID
      energy: z.number(),
      age: z.number(), // Age in seconds
      reproductionCooldown: z.number(), // Ticks until can reproduce
      seekingMate: z.boolean(),
      mateId: z.string().nullable(), // ID of current mate (if mating)
      matingBuildupCounter: z.number(), // Ticks spent close to mate
      eatingCooldown: z.number(), // Ticks until can eat again
      stance: stanceSchema,
      previousStance: stanceSchema.nullable(), // No previous stance (just spawned)
      positionHistory: z.array(vectorSchema), // For motion trails (past positions)
    }),
  }),
  // Remove a boid from the engine (used for death)
  engineRemoveBoid: z.object({
    type: z.literal(effectKeywords.engine.removeBoid),
    boidId: z.string(), // ID of boid to remove
  }),
};
// Union of all control effects
export const controlEffectSchema = z.discriminatedUnion("type", [
  controlEffectSchemas.stateUpdate,
  controlEffectSchemas.timerSchedule,
  controlEffectSchemas.timerCancel,
  controlEffectSchemas.engineAddBoid,
  controlEffectSchemas.engineRemoveBoid,
]);

// ============================================
// Runtime Effects - Event dispatching
// ============================================

export const runtimeEffectSchemas = {
  // Dispatch another event (for effect chaining)
  dispatch: z.object({
    type: z.literal(effectKeywords.runtime.dispatch),
    event: allEventSchema, // Event to dispatch
  }),
};

// Union of all runtime effects
export const runtimeEffectSchema = z.discriminatedUnion("type", [
  runtimeEffectSchemas.dispatch,
]);

// ============================================
// Effect Union Types
// ============================================

// Union of all effects (for runtime controller)
export const allEffectSchema = z.union([
  controlEffectSchema,
  runtimeEffectSchema,
]);

// ============================================
// Type Exports
// ============================================

export type ControlEffect = z.infer<typeof controlEffectSchema>;
export type AllEffects = z.infer<typeof allEffectSchema>;
