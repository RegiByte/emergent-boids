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
    workerStateUpdated: "boids/workerStateUpdated", // NEW: Worker → Main state sync
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
  // Local boid store effects (NEW - Session 115)
  localBoidStore: {
    syncWorkerState: "localBoidStore:syncWorkerState",
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
  // Session 98: New shapes from expanded atlas
  oval: "oval",
  rectangle: "rectangle",
  pentagon_inverted: "pentagon_inverted",
  heptagon: "heptagon",
  nonagon: "nonagon",
  trapezoid: "trapezoid",
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

    // Foraging substates (NEW - Session 75)
    wandering: "wandering", // Searching for food

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
    searching_for_food: "searching_for_food", // Foraging (Session 75)
    locked_on_target: "locked_on_target", // Continuing chase
    new_target: "new_target", // Starting new chase
    target_escaped: "target_escaped", // Lost target
    recovering_energy: "recovering_energy", // Idle/resting
    mate_ready: "mate_ready", // Ready to mate
    mate_found: "mate_found", // Has mate
    mate_committed: "mate_committed", // Committed to mate (minimum duration)
    mate_lost: "mate_lost", // Mate died or disappeared
    reproduction_failed: "reproduction_failed", // Reproduction couldn't complete
    environment_pressure: "environment_pressure", // Overpopulation pressure
    default: "default", // Fallback behavior
  },

  // Reproduction failure reasons (NEW - Session 75)
  reproductionFailures: {
    population_at_cap: "population_at_cap", // Max population reached
    insufficient_energy: "insufficient_energy", // Parent(s) lack energy
    mate_too_far: "mate_too_far", // Mates separated during buildup
    mate_lost: "mate_lost", // Mate died or disappeared
    cooldown_active: "cooldown_active", // Still on reproduction cooldown
    not_ready: "not_ready", // Conditions not met (age, health, etc.)
  },
} as const;

export const renderModeKeywords = {
  canvas: "canvas",
  webgl: "webgl",
} as const;

export const profilerKeywords = {
  engine: {
    addBoid: "engine.addBoid",
    removeBoid: "engine.removeBoid",
    update: "engine.update",
    updateBoids: "engine.updateBoids",
    updateBoid: "engine.updateBoid",
    updateTrail: "engine.updateTrail",
    createFrameUpdateContext: "engine.createFrameUpdateContext",
    buildFrameUpdateContext: "engine.buildFrameUpdateContext",
    insertBoidSpatialHash: "engine.insertBoidSpatialHash",
    insertFoodSpatialHash: "engine.insertFoodSpatialHash",
    insertObstacleSpatialHash: "engine.insertObstacleSpatialHash",
    insertDeathMarkerSpatialHash: "engine.insertDeathMarkerSpatialHash",
    updatePredator: "engine.updatePredator",
    updatePrey: "engine.updatePrey",
  },
  behavior: {
    evaluate: "behavior.evaluate",
    applyDecision: "behavior.applyDecision",
  },
  boids: {
    syncSharedMemory: "boids.syncSharedMemory",
    getNeighbors: "boids.getNeighbors",
    getNearbyFoodSources: "boids.getNearbyFoodSources",
    getNearbyObstacles: "boids.getNearbyObstacles",
    getNearbyDeathMarkers: "boids.getNearbyDeathMarkers",
  },
  renderer: {
    draw: "renderer.draw",
    createRenderContext: "renderer.createRenderContext",
  },
  updateLoop: {
    update: "updateLoop.update",
    frameTotal: "updateLoop.frameTotal",
    frameUpdateTime: "updateLoop.frameUpdate",
    frameTimePassed: "updateLoop.frameTimePassed",
    frameCatches: "updateLoop.frameCatches",
    frameStep: "updateLoop.frameStep",
  },
  rules: {
    separation: "rules.separation",
    alignment: "rules.alignment",
    cohesion: "rules.cohesion",
    avoidObstacles: "rules.avoidObstacles",
    fear: "rules.fear",
    chase: "rules.chase",
    seekMate: "rules.seekMate",
    avoidDeathMarkers: "rules.avoidDeathMarkers",
    seekFood: "rules.seekFood",
    orbitFood: "rules.orbitFood",
    avoidPredatorFood: "rules.avoidPredatorFood",
    avoidCrowdedAreas: "rules.avoidCrowdedAreas",
  },
} as const;

export const ruleKeywords = {
  separation: "separation",
  alignment: "alignment",
  cohesion: "cohesion",
  avoidObstacles: "avoidObstacles",
  fear: "fear",
  selectBestPrey: "selectBestPrey",
  chase: "chase",
  selectBestMate: "selectBestMate",
  seekMate: "seekMate",
  avoidDeathMarkers: "avoidDeathMarkers",
  selectBestFood: "selectBestFood",
  seekFood: "seekFood",
  orbitFood: "orbitFood",
  avoidPredatorFood: "avoidPredatorFood",
  avoidCrowdedAreas: "avoidCrowdedAreas",
} as const;

export const cameraKeywords = {
  mode: {
    free: "free",
    picker: "picker",
    following: "following",
  },
} as const;

export const simulationKeywords = {
  commands: {
    // Simulation commands
    start: "simulation:start",
    pause: "simulation:pause",
    resume: "simulation:resume",
    step: "simulation:step", // Step the simulation forward by one frame
    setTimeScale: "simulation:setTimeScale", // Change speed (0.25x - 4x)
    // UI/UX commands
    toggleTrails: "simulation:toggleTrails", // Toggle trails on/off
    toggleEnergyBar: "simulation:toggleEnergyBar", // Toggle energy bar on/off
    toggleMatingHearts: "simulation:toggleMatingHearts", // Toggle mating hearts on/off
    toggleStanceSymbols: "simulation:toggleStanceSymbols", // Toggle stance symbols on/off
    setRendererMode: "simulation:setRendererMode", // Set renderer mode (canvas/webgl)
    spawnFood: "simulation:spawnFood", // Spawn food at cursor position
    spawnObstacle: "simulation:spawnObstacle", // Spawn obstacle at cursor position
    spawnPredator: "simulation:spawnPredator", // Spawn predator at cursor position
    clearFood: "simulation:clearFood", // Clear all food
    clearDeathMarkers: "simulation:clearDeathMarkers", // Clear all death markers
    // Boid commands
    addBoid: "simulation:addBoid",
    removeBoid: "simulation:removeBoid",
    followBoid: "simulation:followBoid",
    stopFollowingBoid: "simulation:stopFollowingBoid",
    // Environment commands
    addObstacle: "simulation:addObstacle",
    clearObstacle: "simulation:clearObstacle",
    clearAllObstacles: "simulation:clearAllObstacles",
  },
  events: {
    timeScaleChanged: "simulation:timeScaleChanged",
    // Simulation events
    initialized: "simulation:initialized",
    updated: "simulation:updated",
    error: "simulation:error",
    // Boid events
    boidsDied: "simulation:boidsDied",
    boidsCaught: "simulation:boidsCaught",
    boidsEvolved: "simulation:boidsEvolved",
    boidsReproduced: "simulation:boidsReproduced",
    boidsStanceChanged: "simulation:boidsStanceChanged",
    // Environment events
    foodSourcesCreated: "simulation:foodSourcesCreated",
    foodSourcesUpdated: "simulation:foodSourcesUpdated",
    foodSourceConsumed: "simulation:foodSourceConsumed",
    obstaclesAdded: "simulation:obstaclesAdded",
    obstaclesUpdated: "simulation:obstaclesUpdated",
    obstaclesRemoved: "simulation:obstaclesRemoved",
    obstaclesCleared: "simulation:obstaclesCleared",
  },
} as const;
