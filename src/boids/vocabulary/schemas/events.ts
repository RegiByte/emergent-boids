import { z } from "zod";
import { eventKeywords } from "../keywords.ts";
import { deathCauseSchema, foodSourceSchemas } from "./prelude.ts";

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

// ============================================
// Control Events - User interactions
// ============================================

export const controlEventSchemas = {
  // User adjusts species movement parameters via sliders
  setTypeConfig: z.object({
    type: z.literal(eventKeywords.controls.typeConfigChanged),
    typeId: z.string(), // Which species to modify
    field: z.enum([
      "separationWeight",
      "alignmentWeight",
      "cohesionWeight",
      "maxSpeed",
      "maxForce",
    ]),
    value: z.number(), // New value for the field
  }),
  // User adjusts global perception radius
  setPerceptionRadius: z.object({
    type: z.literal(eventKeywords.controls.perceptionRadiusChanged),
    value: z.number(),
  }),
  // User adjusts obstacle avoidance strength
  setObstacleAvoidance: z.object({
    type: z.literal(eventKeywords.controls.obstacleAvoidanceChanged),
    value: z.number(),
  }),
};

// ============================================
// Obstacle Events - Environment manipulation
// ============================================

export const obstacleEventSchemas = {
  // User clicks to add an obstacle
  addObstacle: z.object({
    type: z.literal(eventKeywords.obstacles.added),
    x: z.number(), // Click position X
    y: z.number(), // Click position Y
    radius: z.number(), // Obstacle size
  }),
  // User removes a specific obstacle
  removeObstacle: z.object({
    type: z.literal(eventKeywords.obstacles.removed),
    index: z.number(), // Index in obstacles array
  }),
  // User clears all obstacles
  clearObstacles: z.object({
    type: z.literal(eventKeywords.obstacles.cleared),
  }),
};

// ============================================
// Time Events - Periodic updates
// ============================================

export const timeEventSchemas = {
  // Timer tick for lifecycle updates (every 1 second)
  passed: z.object({
    type: z.literal(eventKeywords.time.passed),
    deltaMs: z.number(), // Time since last tick (milliseconds)
  }),
};

// ============================================
// Boid Events - Lifecycle and interactions
// ============================================

export const boidEventSchemas = {
  // Predator catches prey
  caught: z.object({
    type: z.literal(eventKeywords.boids.caught),
    predatorId: z.string(),
    preyId: z.string(),
    preyTypeId: z.string(), // Species of prey (for analytics)
    preyEnergy: z.number(), // Energy to convert to food
    preyPosition: z.object({ x: z.number(), y: z.number() }), // Where to place food
  }),
  // Boid dies (any reason)
  died: z.object({
    type: z.literal(eventKeywords.boids.died),
    boidId: z.string(),
    typeId: z.string(), // Species (for analytics)
    reason: deathCauseSchema, // Cause of death
  }),
  // Boid successfully reproduces
  reproduced: z.object({
    type: z.literal(eventKeywords.boids.reproduced),
    parentId: z.string(),
    childId: z.string(), // First offspring ID
    typeId: z.string(), // Species
    offspringCount: z.number(), // Total offspring (1-2 for twins)
  }),
  // User manually spawns a predator
  spawnPredator: z.object({
    type: z.literal(eventKeywords.boids.spawnPredator),
    x: z.number(), // Spawn position X
    y: z.number(), // Spawn position Y
  }),
  // Food source created (from catch or periodic spawn)
  foodSourceCreated: z.object({
    type: z.literal(eventKeywords.boids.foodSourceCreated),
    foodSource: foodSourceSchemas, // Complete food source data
  }),
};

// ============================================
// UI Events - User interface interactions
// ============================================

export const uiEventSchemas = {
  // User toggles the sidebar
  toggleSidebar: z.object({
    type: z.literal(eventKeywords.ui.sidebarToggled),
    open: z.boolean(),
  }),
  // User toggles the header navbar
  toggleHeader: z.object({
    type: z.literal(eventKeywords.ui.headerToggled),
    collapsed: z.boolean(),
  }),
};

export const uiEventSchema = z.discriminatedUnion("type", [
  uiEventSchemas.toggleSidebar,
  uiEventSchemas.toggleHeader,
]);

// ============================================
// Atmosphere Events - Environmental mood changes
// ============================================

export const atmosphereEventSchemas = {
  // Atmosphere event started (mating season, extinction, etc.)
  eventStarted: z.object({
    type: z.literal(eventKeywords.atmosphere.eventStarted),
    eventType: z.enum([
      "mating-season",
      "mass-extinction",
      "predator-dominance",
      "population-boom",
      "starvation-crisis",
    ]),
    settings: z.object({
      trailAlpha: z.number().min(0).max(1).optional(),
      fogColor: z.string().optional(), // CSS color string
      fogIntensity: z.number().min(0).max(1).optional(),
      fogOpacity: z.number().min(0).max(1).optional(),
    }),
    minDurationTicks: z.number(), // Minimum time before another event can override
  }),

  // Atmosphere event ended (return to base settings)
  eventEnded: z.object({
    type: z.literal(eventKeywords.atmosphere.eventEnded),
    eventType: z.string(), // Which event ended
  }),
};

export const atmosphereEventSchema = z.discriminatedUnion("type", [
  atmosphereEventSchemas.eventStarted,
  atmosphereEventSchemas.eventEnded,
]);

// ============================================
// Analytics Events - Event tracking configuration
// ============================================

export const analyticsEventSchemas = {
  // User changes event filter settings
  filterChanged: z.object({
    type: z.literal(eventKeywords.analytics.filterChanged),
    maxEvents: z.number().int().min(10).max(500).optional(), // Max events to track
    allowedEventTypes: z.array(z.string()).optional(), // Whitelist of event types (null = all)
  }),

  // User clears custom filter (revert to default)
  filterCleared: z.object({
    type: z.literal(eventKeywords.analytics.filterCleared),
  }),
};

export const analyticsEventSchema = z.discriminatedUnion("type", [
  analyticsEventSchemas.filterChanged,
  analyticsEventSchemas.filterCleared,
]);

// ============================================
// Event Union Types
// ============================================

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

// Union of all time events
export const timeEventSchema = z.discriminatedUnion("type", [
  timeEventSchemas.passed,
]);

// Union of all boid events
export const boidEventSchema = z.discriminatedUnion("type", [
  boidEventSchemas.caught,
  boidEventSchemas.died,
  boidEventSchemas.reproduced,
  boidEventSchemas.spawnPredator,
  boidEventSchemas.foodSourceCreated,
]);

// Union of all events (for runtime controller)
export const allEventSchema = z.union([
  controlEventSchema,
  obstacleEventSchema,
  timeEventSchema,
  boidEventSchema,
  uiEventSchema,
  atmosphereEventSchema,
  analyticsEventSchema,
]);

// ============================================
// Type Exports
// ============================================

export type ControlEvent = z.infer<typeof controlEventSchema>;
export type ObstacleEvent = z.infer<typeof obstacleEventSchema>;
export type TimeEvent = z.infer<typeof timeEventSchema>;
export type BoidEvent = z.infer<typeof boidEventSchema>;
export type AtmosphereEvent = z.infer<typeof atmosphereEventSchema>;
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type AllEvents = z.infer<typeof allEventSchema>;
