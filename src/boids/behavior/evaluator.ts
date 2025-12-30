import { roleKeywords } from "../vocabulary/keywords";
import type {
  BehaviorContext,
  BehaviorScore,
  BehaviorRuleset,
  StanceDecision,
  MinimumStanceDuration,
} from "../vocabulary/schemas/behavior";
import type {
  Boid,
  FoodSource,
  ReproductionType,
  SpeciesRole,
} from "../vocabulary/schemas/prelude";

/**
 * Behavior Evaluator - Core logic for behavior scoring system
 *
 * This module provides the core evaluation loop:
 * 1. Build context from boid state + environment
 * 2. Evaluate all applicable rules
 * 3. Select highest-scoring behavior
 * 4. Apply decision (respecting minimum durations)
 *
 * Philosophy: Simple rules compose. Highest score wins.
 * Performance: Minimal allocations, early exits, inline operations.
 */

/**
 * Evaluate all applicable behavior rules and return the highest-scoring decision.
 *
 * @param context - Current boid state and environment
 * @param ruleset - Collection of behavior rules
 * @param role - "prey" or "predator"
 * @returns Highest-scoring behavior, or null if no rules match
 */
export function evaluateBehavior(
  context: BehaviorContext,
  ruleset: BehaviorRuleset,
  role: SpeciesRole
): BehaviorScore | null {
  const rules =
    role === roleKeywords.prey ? ruleset.preyRules : ruleset.predatorRules;

  let bestScore: BehaviorScore | null = null;

  // Evaluate all rules, keep highest score
  for (const rule of rules) {
    if (!rule.metadata.enabled) continue;

    const score = rule.evaluate(context);
    if (!score) continue;

    if (!bestScore || score.score > bestScore.score) {
      bestScore = score;
    }
  }

  return bestScore;
}

/**
 * Apply a behavior decision to a boid, respecting minimum durations.
 *
 * @param boid - Boid to update
 * @param decision - Behavior score to apply
 * @param tick - Current simulation tick
 * @param minDurations - Minimum duration config
 * @returns StanceDecision if transition occurred, null if blocked by duration
 */
export function applyBehaviorDecision(
  boid: Boid,
  decision: BehaviorScore,
  tick: number,
  minDurations: MinimumStanceDuration
): StanceDecision | null {
  const ticksSinceTransition = tick - boid.stanceEnteredAt;
  const minDuration = minDurations[boid.stance] ?? 0;
  const canTransition = ticksSinceTransition >= minDuration || decision.urgent;

  if (!canTransition) {
    return null; // Blocked by minimum duration
  }

  // Check if actually changing stance or substate
  const isChanging =
    boid.stance !== decision.stance || boid.substate !== decision.substate;

  if (!isChanging) {
    return null; // Already in desired stance
  }

  // Create decision record
  const stanceDecision: StanceDecision = {
    boidId: boid.id,
    boidIndex: -1, // Will be set by caller
    tick,
    previousStance: boid.stance,
    previousSubstate: boid.substate,
    newStance: decision.stance,
    newSubstate: decision.substate,
    score: decision.score,
    reason: decision.reason,
    ruleName: decision.ruleName,
    urgent: decision.urgent,
    energyRatio: boid.energy / boid.phenotype.maxEnergy,
    healthRatio: boid.health / boid.phenotype.maxHealth,
    nearbyPredatorCount: 0, // Will be set by caller
    nearbyPreyCount: 0, // Will be set by caller
  };

  // Apply transition
  boid.previousStance = boid.stance;
  boid.stance = decision.stance;
  boid.substate = decision.substate;
  boid.stanceEnteredAt = tick;

  return stanceDecision;
}

/**
 * Build behavior context from boid state and environment.
 *
 * Performance: Reuse context object to avoid allocations in hot loop.
 *
 * @param boid - Boid to build context for
 * @param boidIndex - Array index of boid
 * @param nearbyPredators - Nearby predator boids
 * @param nearbyPrey - Nearby prey boids
 * @param nearbyFood - Nearby food sources
 * @param nearbyFlock - Nearby same-species boids
 * @param tick - Current simulation tick
 * @param role - "prey" or "predator"
 * @param reproductionType - "sexual" or "asexual"
 * @returns BehaviorContext object
 */
export function buildBehaviorContext(
  boid: Boid,
  boidIndex: number,
  nearbyPredators: Boid[],
  nearbyPrey: Boid[],
  nearbyFood: FoodSource[],
  nearbyFlock: Boid[],
  tick: number,
  role: SpeciesRole,
  reproductionType: ReproductionType
): BehaviorContext {
  // Find closest distances (inline for performance)
  let closestPredatorDistance: number | null = null;
  if (nearbyPredators.length > 0) {
    // Assume sorted by distance (from spatial hash)
    const dx = boid.position.x - nearbyPredators[0].position.x;
    const dy = boid.position.y - nearbyPredators[0].position.y;
    closestPredatorDistance = Math.sqrt(dx * dx + dy * dy);
  }

  let closestPreyDistance: number | null = null;
  if (nearbyPrey.length > 0) {
    const dx = boid.position.x - nearbyPrey[0].position.x;
    const dy = boid.position.y - nearbyPrey[0].position.y;
    closestPreyDistance = Math.sqrt(dx * dx + dy * dy);
  }

  let closestFoodDistance: number | null = null;
  if (nearbyFood.length > 0) {
    const dx = boid.position.x - nearbyFood[0].position.x;
    const dy = boid.position.y - nearbyFood[0].position.y;
    closestFoodDistance = Math.sqrt(dx * dx + dy * dy);
  }

  return {
    boidId: boid.id,
    boidIndex,
    currentStance: boid.stance,
    currentSubstate: boid.substate,
    stanceEnteredAt: boid.stanceEnteredAt,
    energyRatio: boid.energy / boid.phenotype.maxEnergy,
    healthRatio: boid.health / boid.phenotype.maxHealth,
    nearbyPredatorCount: nearbyPredators.length,
    nearbyPreyCount: nearbyPrey.length,
    nearbyFoodCount: nearbyFood.length,
    nearbyFlockCount: nearbyFlock.length,
    closestPredatorDistance,
    closestPreyDistance,
    closestFoodDistance,
    hasLockedTarget: boid.targetId !== null && boid.targetLockStrength > 0,
    targetLockStrength: boid.targetLockStrength,
    targetLockDuration: boid.targetLockTime,
    hasMate: boid.mateId !== null,
    tick,
    ticksSinceTransition: tick - boid.stanceEnteredAt,
    role,
    reproductionType,
  };
}
