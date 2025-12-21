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
  // Time events
  time: {
    passage: "time/passage",
  },
  // Boid lifecycle events
  boids: {
    caught: "boids/caught",
    died: "boids/died",
    reproduced: "boids/reproduced",
    spawnPredator: "boids/spawnPredator",
    foodSourceCreated: "boids/foodSourceCreated",
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
  // Timer effects
  timer: {
    schedule: "timer:schedule",
    cancel: "timer:cancel",
  },
  // Engine effects
  engine: {
    addBoid: "engine:addBoid",
    removeBoid: "engine:removeBoid",
  },

  runtime: {
    dispatch: "runtime:dispatch",
  },
} as const;

// ============================================
// Shared Schemas (used by events and state)
// ============================================

// Food source schema - consumable energy sources for boids
// Prey food spawns periodically, predator food spawns from catches
export const foodSourceSchema = z.object({
  id: z.string(), // Unique identifier
  position: z.object({ x: z.number(), y: z.number() }),
  energy: z.number(), // Current energy remaining
  maxEnergy: z.number(), // Initial energy (for visual scaling)
  sourceType: z.enum(["prey", "predator"]), // What type of boid can eat this
  createdTick: z.number(), // When created (for tracking age)
});

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

export const timeEventSchemas = {
  passage: z.object({
    type: z.literal(eventKeywords.time.passage),
    deltaMs: z.number(),
  }),
};

export const boidEventSchemas = {
  caught: z.object({
    type: z.literal(eventKeywords.boids.caught),
    predatorId: z.string(),
    preyId: z.string(),
    preyEnergy: z.number(), // Energy of prey at time of catch
    preyPosition: z.object({ x: z.number(), y: z.number() }), // Position where prey was caught
  }),
  died: z.object({
    type: z.literal(eventKeywords.boids.died),
    boidId: z.string(),
  }),
  reproduced: z.object({
    type: z.literal(eventKeywords.boids.reproduced),
    parentId: z.string(),
    childId: z.string(),
    typeId: z.string(),
  }),
  spawnPredator: z.object({
    type: z.literal(eventKeywords.boids.spawnPredator),
    x: z.number(),
    y: z.number(),
  }),
  foodSourceCreated: z.object({
    type: z.literal(eventKeywords.boids.foodSourceCreated),
    foodSource: foodSourceSchema,
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

// Union of all time events
export const timeEventSchema = z.discriminatedUnion("type", [
  timeEventSchemas.passage,
]);

// Union of all boid events
export const boidEventSchema = z.discriminatedUnion("type", [
  boidEventSchemas.caught,
  boidEventSchemas.died,
  boidEventSchemas.reproduced,
  boidEventSchemas.spawnPredator,
  boidEventSchemas.foodSourceCreated,
]);

// Union of all events
export const allEventSchema = z.union([
  controlEventSchema,
  obstacleEventSchema,
  timeEventSchema,
  boidEventSchema,
]);

// ============================================
// Runtime State Schema (Single Source of Truth)
// ============================================

// Boid type config schema
export const boidTypeConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  role: z.enum(["predator", "prey"]),
  separationWeight: z.number(),
  alignmentWeight: z.number(),
  cohesionWeight: z.number(),
  maxSpeed: z.number(),
  maxForce: z.number(),
  fearFactor: z.number(),
  maxEnergy: z.number(),
  energyGainRate: z.number(),
  energyLossRate: z.number(),
  maxAge: z.number(),
  trailLength: z.number(),
});

export const visualSettingsSchema = z.object({
  trailsEnabled: z.boolean(),
  energyBarsEnabled: z.boolean(),
  matingHeartsEnabled: z.boolean(),
  stanceSymbolsEnabled: z.boolean(),
  deathMarkersEnabled: z.boolean(),
  foodSourcesEnabled: z.boolean(),
});

// Death marker schema - marks locations where boids died from starvation or old age
// Markers consolidate nearby deaths (100px radius) and accumulate strength
export const deathMarkerSchema = z.object({
  position: z.object({ x: z.number(), y: z.number() }),
  remainingTicks: z.number(), // Countdown timer (decreases each time:passage)
  strength: z.number(), // Repulsive force strength (increases with nearby deaths)
  maxLifetimeTicks: z.number(), // Maximum lifetime (20 ticks, prevents immortal markers)
  typeId: z.string(), // Type of boid that died (for color)
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
  visualSettings: visualSettingsSchema,
  deathMarkers: z.array(deathMarkerSchema), // Markers for natural deaths (starvation/old age)
  foodSources: z.array(foodSourceSchema), // Consumable energy sources for boids
  // Canvas dimensions (for toroidal calculations in renderer)
  canvasWidth: z.number(),
  canvasHeight: z.number(),
  // Global simulation parameters
  fearRadius: z.number(),
  chaseRadius: z.number(),
  catchRadius: z.number(),
  mateRadius: z.number(),
  minDistance: z.number(),
  maxBoids: z.number(),
  maxPreyBoids: z.number(),
  maxPredatorBoids: z.number(),
  minReproductionAge: z.number(),
  reproductionEnergyThreshold: z.number(),
  reproductionCooldownTicks: z.number(),
  matingBuildupTicks: z.number(),
  eatingCooldownTicks: z.number(),
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
  timerSchedule: z.object({
    type: z.literal(effectKeywords.timer.schedule),
    id: z.string(),
    delayMs: z.number(),
    onExpire: allEventSchema,
  }),
  timerCancel: z.object({
    type: z.literal(effectKeywords.timer.cancel),
    id: z.string(),
  }),
  engineAddBoid: z.object({
    type: z.literal(effectKeywords.engine.addBoid),
    boid: z.object({
      id: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      velocity: z.object({ x: z.number(), y: z.number() }),
      acceleration: z.object({ x: z.number(), y: z.number() }),
      typeId: z.string(),
      energy: z.number(),
      age: z.number(),
      reproductionCooldown: z.number(),
      seekingMate: z.boolean(),
      mateId: z.string().nullable(),
      matingBuildupCounter: z.number(),
      eatingCooldown: z.number(),
      stance: z.union([
        z.literal("flocking"),
        z.literal("seeking_mate"),
        z.literal("mating"),
        z.literal("fleeing"),
        z.literal("hunting"),
        z.literal("idle"),
        z.literal("eating"),
      ]),
      previousStance: z.union([
        z.literal("flocking"),
        z.literal("seeking_mate"),
        z.literal("mating"),
        z.literal("fleeing"),
        z.literal("hunting"),
        z.literal("idle"),
        z.null(),
      ]),
      positionHistory: z.array(z.object({ x: z.number(), y: z.number() })),
    }),
  }),
  engineRemoveBoid: z.object({
    type: z.literal(effectKeywords.engine.removeBoid),
    boidId: z.string(),
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

export const runtimeEffectSchemas = {
  dispatch: z.object({
    type: z.literal(effectKeywords.runtime.dispatch),
    event: allEventSchema,
  }),
};

// Union of all runtime effects
export const runtimeEffectSchema = z.discriminatedUnion("type", [
  runtimeEffectSchemas.dispatch,
]);

export const allEffectSchema = z.union([
  controlEffectSchema,
  runtimeEffectSchema,
]);

// ============================================
// Inferred Types
// ============================================

export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type PartialRuntimeState = z.infer<typeof partialRuntimeStateSchema>;
export type ControlEvent = z.infer<typeof controlEventSchema>;
export type ObstacleEvent = z.infer<typeof obstacleEventSchema>;
export type TimeEvent = z.infer<typeof timeEventSchema>;
export type BoidEvent = z.infer<typeof boidEventSchema>;
export type ControlEffect = z.infer<typeof controlEffectSchema>;
export type AllEvents = z.infer<typeof allEventSchema>;
export type AllEffects = z.infer<typeof allEffectSchema>;
export type FoodSource = z.infer<typeof foodSourceSchema>;
export type DeathMarker = z.infer<typeof deathMarkerSchema>;
