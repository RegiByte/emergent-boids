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
    headerToggled: "ui/headerToggled",
  },

  profile: {
    switched: "profile/switched",
  },

  atmosphere: {
    eventStarted: "atmosphere/eventStarted",
    eventEnded: "atmosphere/eventEnded",
  },

  analytics: {
    filterChanged: "analytics/filterChanged",
    filterCleared: "analytics/filterCleared",
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
  // Analytics effects
  analytics: {
    updateFilter: "analytics:updateFilter",
    clearFilter: "analytics:clearFilter",
  },
  // Runtime effects
  runtime: {
    dispatch: "runtime:dispatch",
  },
  // Profile effects
  profile: {
    load: "profile:load",
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
  both: "both",
} as const;

export const reproductionTypeKeywords = {
  sexual: "sexual",
  asexual: "asexual",
} as const;

export const shapeKeywords = {
  diamond: "diamond",
  circle: "circle",
  hexagon: "hexagon",
  square: "square",
  triangle: "triangle",
} as const;

export const bodyPartKeywords = {
  eye: "eye",
  fin: "fin",
  spike: "spike",
  tail: "tail",
  antenna: "antenna",
  glow: "glow",
  shell: "shell",
} as const;

/**
 * Behavior Keywords - Stances and Substates for Behavior System
 *
 * Maps existing imperative stance system to new scoring system.
 * Substates allow rich behaviors (e.g., hunting → searching/stalking/chasing).
 */
export const behaviorKeywords = {
  // Prey stances (existing)
  prey: {
    flocking: "flocking", // Default: normal flocking behavior
    fleeing: "fleeing", // Running from predators
    eating: "eating", // Orbiting food source
    seeking_mate: "seeking_mate", // Looking for mate (sexual reproduction)
    mating: "mating", // Currently mating
  },

  // Predator stances (existing)
  predator: {
    hunting: "hunting", // Default: chasing prey
    eating: "eating", // Orbiting food source
    seeking_mate: "seeking_mate", // Looking for mate (sexual reproduction)
    mating: "mating", // Currently mating
    idle: "idle", // Low energy, conserving
  },

  // Substates (NEW - for rich behaviors)
  substates: {
    // Hunting substates
    searching: "searching", // Looking for prey
    stalking: "stalking", // Approaching prey
    chasing: "chasing", // Active pursuit (locked target)

    // Fleeing substates
    panic: "panic", // Very close predator
    tactical: "tactical", // Farther predator

    // Eating substates
    desperate: "desperate", // Critical energy (< 30%)
    normal: "normal", // Normal eating (< 70%)

    // Idle substates
    resting: "resting", // Recovering energy
  },

  // Decision reasons (for analytics)
  reasons: {
    critical_energy: "critical_energy", // < 30% energy
    low_energy: "low_energy", // < 70% energy
    predator_nearby: "predator_nearby", // Prey fleeing
    prey_detected: "prey_detected", // Predator hunting
    food_nearby: "food_nearby", // Food within eating radius
    locked_on_target: "locked_on_target", // Continuing chase
    new_target: "new_target", // Starting new chase
    target_escaped: "target_escaped", // Lost target
    recovering_energy: "recovering_energy", // Idle/resting
    mate_ready: "mate_ready", // Ready to mate
    mate_found: "mate_found", // Has mate
    default: "default", // Fallback behavior
  },
} as const;
