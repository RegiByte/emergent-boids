import { roleKeywords } from "../vocabulary/keywords";
import type {
  BehaviorContext,
  BehaviorScore,
  BehaviorRuleset,
  StanceDecision,
  MinimumStanceDuration,
} from "../vocabulary/schemas/behavior";
import type { Boid, FoodSource } from "../vocabulary/schemas/entities";
import type { ReproductionType, Role } from "../vocabulary/schemas/primitives";

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
  role: Role,
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
  frame: number,
  minDurations: MinimumStanceDuration,
): StanceDecision | null {
  const framesSinceTransition = frame - boid.stanceEnteredAt;
  const minDuration = minDurations[boid.stance] ?? 0;
  const canTransition = framesSinceTransition >= minDuration || decision.urgent;

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
    frame,
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
  boid.stanceEnteredAt = frame;

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
 * @param readyToMate - Is boid ready to mate (from isReadyToMate predicate)
 * @param populationRatio - Current population / max population (0-1)
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
  role: Role,
  reproductionType: ReproductionType,
  readyToMate: boolean,
  populationRatio: number,
): BehaviorContext {
  // Find closest distances (inline for performance)
  let closestPredatorDistance: number | null = null;
  let closestPredatorStance: string | null = null;
  let threatLevel = 0;

  if (nearbyPredators.length > 0) {
    const closestPredator = nearbyPredators[0];
    const dx = boid.position.x - closestPredator.position.x;
    const dy = boid.position.y - closestPredator.position.y;
    closestPredatorDistance = Math.sqrt(dx * dx + dy * dy);
    closestPredatorStance = closestPredator.stance;

    // Threat assessment based on predator stance (Session 75)
    // hunting = full threat, idle/eating = reduced, mating = minimal
    const stanceThreatMultiplier =
      closestPredatorStance === "hunting"
        ? 1.0 // Full threat
        : closestPredatorStance === "idle" || closestPredatorStance === "eating"
          ? 0.5 // Half threat
          : 0.25; // Minimal threat (mating, seeking_mate)

    // Distance factor: closer = higher threat (inverse square for realism)
    const maxThreatDistance = 200; // Beyond this, no threat
    const distanceFactor = Math.max(
      0,
      1.0 - closestPredatorDistance / maxThreatDistance,
    );

    threatLevel = stanceThreatMultiplier * distanceFactor;
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

  // Count available mates (Session 75: Seeking mates that are ready)
  // Only count flock members that are seeking mates or ready to mate
  const nearbyAvailableMatesCount = nearbyFlock.filter(
    (b) => b.seekingMate || b.stance === "seeking_mate",
  ).length;

  // Calculate environment pressure from population ratio
  // 0.0-0.7 = no pressure, 0.7-0.9 = moderate, 0.9-1.0 = extreme
  const environmentPressure = Math.max(0, (populationRatio - 0.7) / 0.3);

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
    nearbyAvailableMatesCount, // NEW - Session 75
    closestPredatorDistance,
    closestPreyDistance,
    closestFoodDistance,
    closestPredatorStance, // NEW - Session 75: Stance-aware threat
    threatLevel, // NEW - Session 75: Calculated threat based on stance + distance
    hasLockedTarget: boid.targetId !== null && boid.targetLockStrength > 0,
    targetLockStrength: boid.targetLockStrength,
    targetLockDuration: boid.targetLockTime,
    hasMate: boid.mateId !== null,
    mateCommitmentTime: boid.mateCommitmentTime,
    readyToMate,
    populationRatio,
    environmentPressure,
    tick,
    ticksSinceTransition: tick - boid.stanceEnteredAt,
    role,
    reproductionType,
  };
}
