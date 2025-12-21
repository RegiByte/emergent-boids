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

// ============================================
// Event Schemas
// ============================================

// ============================================
// Runtime State Schema (Single Source of Truth)
// ============================================

// ============================================
// Effect Schemas
// ============================================

// ============================================
// Inferred Types
// ============================================

