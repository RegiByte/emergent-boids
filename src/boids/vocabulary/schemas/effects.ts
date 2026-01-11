import { z } from 'zod'
import { effectKeywords } from '../keywords.ts'
import { allEventSchema } from './events.ts'
import { boidSchema } from './entities'
import { runtimeStoreSchema } from './state.ts'

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

export const controlEffectSchemas = {
  stateUpdate: z.object({
    type: z.literal(effectKeywords.state.update),
    state: runtimeStoreSchema.partial(), // Partial update (merge with existing)
  }),
  timerSchedule: z.object({
    type: z.literal(effectKeywords.timer.schedule),
    id: z.string(), // Timer identifier (for cancellation)
    delayMs: z.number(), // Delay in milliseconds
    onExpire: allEventSchema, // Event to dispatch when timer expires
  }),
  timerCancel: z.object({
    type: z.literal(effectKeywords.timer.cancel),
    id: z.string(), // Timer identifier to cancel
  }),
  engineAddBoid: z.object({
    type: z.literal(effectKeywords.engine.addBoid),
    boid: boidSchema,
  }),
  engineRemoveBoid: z.object({
    type: z.literal(effectKeywords.engine.removeBoid),
    boidId: z.string(), // ID of boid to remove
  }),
  analyticsUpdateFilter: z.object({
    type: z.literal(effectKeywords.analytics.updateFilter),
    maxEvents: z.number().int().min(10).max(500).optional(),
    allowedEventTypes: z.array(z.string()).nullable().optional(),
  }),
  analyticsClearFilter: z.object({
    type: z.literal(effectKeywords.analytics.clearFilter),
  }),
  profileLoad: z.object({
    type: z.literal(effectKeywords.profile.load),
    profileId: z.string(),
  }),
  localBoidStoreSyncWorkerState: z.object({
    type: z.literal(effectKeywords.localBoidStore.syncWorkerState),
    updates: z.array(boidSchema.partial()),
  }),
}
export const controlEffectSchema = z.discriminatedUnion('type', [
  controlEffectSchemas.stateUpdate,
  controlEffectSchemas.timerSchedule,
  controlEffectSchemas.timerCancel,
  controlEffectSchemas.engineAddBoid,
  controlEffectSchemas.engineRemoveBoid,
  controlEffectSchemas.analyticsUpdateFilter,
  controlEffectSchemas.analyticsClearFilter,
  controlEffectSchemas.profileLoad,
  controlEffectSchemas.localBoidStoreSyncWorkerState,
])

export const runtimeEffectSchemas = {
  dispatch: z.object({
    type: z.literal(effectKeywords.runtime.dispatch),
    event: allEventSchema, // Event to dispatch
  }),
}

export const runtimeEffectSchema = z.discriminatedUnion('type', [
  runtimeEffectSchemas.dispatch,
])

export const allEffectSchema = z.union([
  controlEffectSchema,
  runtimeEffectSchema,
])

export type ControlEffect = z.infer<typeof controlEffectSchema>
export type AllEffects = z.infer<typeof allEffectSchema>
