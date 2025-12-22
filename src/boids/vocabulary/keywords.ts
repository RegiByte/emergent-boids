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
    passed: "time/passed",
  },
  // Boid lifecycle events
  boids: {
    caught: "boids/caught",
    died: "boids/died",
    reproduced: "boids/reproduced",
    spawnPredator: "boids/spawnPredator",
    foodSourceCreated: "boids/foodSourceCreated",
  },

  ui: {
    sidebarToggled: "ui/sidebarToggled",
  },

  atmosphere: {
    eventStarted: "atmosphere/eventStarted",
    eventEnded: "atmosphere/eventEnded",
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

export const stanceKeywords = {
  flocking: "flocking",
  seeking_mate: "seeking_mate",
  mating: "mating",
  fleeing: "fleeing",
  hunting: "hunting",
  idle: "idle",
  eating: "eating",
} as const;

export const deathCauseKeywords = {
  old_age: "old_age",
  starvation: "starvation",
  predation: "predation",
} as const;

export const roleKeywords = {
  prey: "prey",
  predator: "predator",
} as const;

export const reproductionTypeKeywords = {
  sexual: "sexual",
  asexual: "asexual",
} as const;
