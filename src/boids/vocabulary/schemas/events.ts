import { z } from 'zod'
import { eventKeywords, lifecycleKeywords } from '../keywords.ts'
import { boidSchema, foodSourceSchema, offspringDataSchema } from './entities'
import { deathCauseSchema } from './primitives'
import { simulationEventSchema } from './simulation.ts'

/**
 * Event Schemas - Messages that trigger state changes
 *
 * Events are dispatched by:
 * - User interactions (UI controls)
 * - Simulation logic (lifecycle events)
 * - Timer expirations (periodic updates)
 *
 * Events flow through the emergent system to produce effects.
 */

export const controlEventSchemas = {
  setTypeConfig: z.object({
    type: z.literal(eventKeywords.controls.typeConfigChanged),
    typeId: z.string(), // Which species to modify
    field: z.enum([
      'separationWeight',
      'alignmentWeight',
      'cohesionWeight',
      'maxSpeed',
      'maxForce',
    ]),
    value: z.number(), // New value for the field
  }),
  setPerceptionRadius: z.object({
    type: z.literal(eventKeywords.controls.perceptionRadiusChanged),
    value: z.number(),
  }),
  setObstacleAvoidance: z.object({
    type: z.literal(eventKeywords.controls.obstacleAvoidanceChanged),
    value: z.number(),
  }),
}

export const obstacleEventSchemas = {
  addObstacle: z.object({
    type: z.literal(eventKeywords.obstacles.added),
    x: z.number(), // Click position X
    y: z.number(), // Click position Y
    radius: z.number(), // Obstacle size
  }),
  removeObstacle: z.object({
    type: z.literal(eventKeywords.obstacles.removed),
    index: z.number(), // Index in obstacles array
  }),
  clearObstacles: z.object({
    type: z.literal(eventKeywords.obstacles.cleared),
  }),
}

export const timeEventSchemas = {
  passed: z.object({
    type: z.literal(eventKeywords.time.passed),
    deltaMs: z.number(), // Time since last tick (milliseconds)
  }),
}

export const catchEventSchema = z.object({
  type: z.literal(eventKeywords.boids.caught),
  predatorId: z.string(),
  preyId: z.string(),
  preyTypeId: z.string(), // Species of prey (for analytics)
  preyEnergy: z.number(), // Energy to convert to food
  preyPosition: z.object({ x: z.number(), y: z.number() }), // Where to place food
})

export const boidEventSchemas = {
  caught: catchEventSchema,
  died: z.object({
    type: z.literal(eventKeywords.boids.died),
    boidId: z.string(),
    typeId: z.string(), // Species (for analytics)
    reason: deathCauseSchema, // Cause of death
  }),
  reproduced: z.object({
    type: z.literal(eventKeywords.boids.reproduced),
    parentId: z.string(),
    childId: z.string(), // First offspring ID
    typeId: z.string(), // Species
    offspringCount: z.number(), // Total offspring (1-2 for twins)
  }),
  spawnPredator: z.object({
    type: z.literal(eventKeywords.boids.spawnPredator),
    x: z.number(), // Spawn position X
    y: z.number(), // Spawn position Y
  }),
  foodSourceCreated: z.object({
    type: z.literal(eventKeywords.boids.foodSourceCreated),
    foodSource: foodSourceSchema, // Complete food source data
  }),
  workerStateUpdated: z.object({
    type: z.literal(eventKeywords.boids.workerStateUpdated),
    updates: z.array(boidSchema.partial()),
  }),
}

export const uiEventSchemas = {
  toggleSidebar: z.object({
    type: z.literal(eventKeywords.ui.sidebarToggled),
    open: z.boolean(),
  }),
  toggleHeader: z.object({
    type: z.literal(eventKeywords.ui.headerToggled),
    collapsed: z.boolean(),
  }),
}

export const uiEventSchema = z.discriminatedUnion('type', [
  uiEventSchemas.toggleSidebar,
  uiEventSchemas.toggleHeader,
])

export const profileEventSchemas = {
  switched: z.object({
    type: z.literal(eventKeywords.profile.switched),
    profileId: z.string(), // Profile to switch to
  }),
}

export const profileEventSchema = z.discriminatedUnion('type', [
  profileEventSchemas.switched,
])

export const atmosphereEventSchemas = {
  eventStarted: z.object({
    type: z.literal(eventKeywords.atmosphere.eventStarted),
    eventType: z.enum([
      'mating-season',
      'mass-extinction',
      'predator-dominance',
      'population-boom',
      'starvation-crisis',
    ]),
    settings: z.object({
      trailAlpha: z.number().min(0).max(1).optional(),
      fogColor: z.string().optional(), // CSS color string
      fogIntensity: z.number().min(0).max(1).optional(),
      fogOpacity: z.number().min(0).max(1).optional(),
    }),
    minDurationTicks: z.number(), // Minimum time before another event can override
  }),

  eventEnded: z.object({
    type: z.literal(eventKeywords.atmosphere.eventEnded),
    eventType: z.string(), // Which event ended
  }),
}

export const atmosphereEventSchema = z.discriminatedUnion('type', [
  atmosphereEventSchemas.eventStarted,
  atmosphereEventSchemas.eventEnded,
])

export const lifecycleEventSchemas = {
  death: z.object({
    type: z.literal(lifecycleKeywords.events.death),
    boidId: z.string(),
    typeId: z.string(),
    reason: deathCauseSchema,
  }),
  reproduction: z.object({
    type: z.literal(lifecycleKeywords.events.reproduction),
    offspring: offspringDataSchema,
  }),
  energyLow: z.object({
    type: z.literal(lifecycleKeywords.events.energyLow),
    boidId: z.string(),
    energy: z.number(),
  }),
  healthLow: z.object({
    type: z.literal(lifecycleKeywords.events.healthLow),
    boidId: z.string(),
    health: z.number(),
  }),
  foodConsumed: z.object({
    type: z.literal(lifecycleKeywords.events.foodConsumed),
    foodId: z.string(),
    energyConsumed: z.number(),
  }),
}

export const lifecycleEventSchema = z.discriminatedUnion('type', [
  lifecycleEventSchemas.death,
  lifecycleEventSchemas.reproduction,
  lifecycleEventSchemas.energyLow,
  lifecycleEventSchemas.healthLow,
  lifecycleEventSchemas.foodConsumed,
])

export const analyticsEventSchemas = {
  filterChanged: z.object({
    type: z.literal(eventKeywords.analytics.filterChanged),
    maxEvents: z.number().int().min(10).max(500).optional(), // Max events to track
    allowedEventTypes: z.array(z.string()).optional(), // Whitelist of event types (null = all)
  }),

  filterCleared: z.object({
    type: z.literal(eventKeywords.analytics.filterCleared),
  }),
}

export const analyticsEventSchema = z.discriminatedUnion('type', [
  analyticsEventSchemas.filterChanged,
  analyticsEventSchemas.filterCleared,
])

export const controlEventSchema = z.discriminatedUnion('type', [
  controlEventSchemas.setTypeConfig,
  controlEventSchemas.setPerceptionRadius,
  controlEventSchemas.setObstacleAvoidance,
])

export const obstacleEventSchema = z.discriminatedUnion('type', [
  obstacleEventSchemas.addObstacle,
  obstacleEventSchemas.removeObstacle,
  obstacleEventSchemas.clearObstacles,
])

export const timeEventSchema = z.discriminatedUnion('type', [
  timeEventSchemas.passed,
])

export const boidEventSchema = z.discriminatedUnion('type', [
  boidEventSchemas.caught,
  boidEventSchemas.died,
  boidEventSchemas.reproduced,
  boidEventSchemas.spawnPredator,
  boidEventSchemas.foodSourceCreated,
  boidEventSchemas.workerStateUpdated,
])
export const allEventSchema = z.union([
  controlEventSchema,
  obstacleEventSchema,
  timeEventSchema,
  boidEventSchema,
  uiEventSchema,
  profileEventSchema,
  atmosphereEventSchema,
  analyticsEventSchema,
  simulationEventSchema,
])

export type ControlEvent = z.infer<typeof controlEventSchema>
export type ObstacleEvent = z.infer<typeof obstacleEventSchema>
export type TimeEvent = z.infer<typeof timeEventSchema>
export type BoidEvent = z.infer<typeof boidEventSchema>
export type ProfileEvent = z.infer<typeof profileEventSchema>
export type AtmosphereEvent = z.infer<typeof atmosphereEventSchema>
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>
export type AllEvents = z.infer<typeof allEventSchema>
export type CatchEvent = z.infer<typeof catchEventSchema>
export type LifecycleEvent = z.infer<typeof lifecycleEventSchema>
