import { Profiler } from "@/resources/shared/profiler";
import { ItemWithDistance } from "../spatialHash";
import {
  profilerKeywords,
  roleKeywords,
  stanceKeywords,
} from "../vocabulary/keywords";
import type {
  BehaviorContext,
  BehaviorRuleset,
  BehaviorScore,
  MinimumStanceDuration,
  StanceDecision,
} from "../vocabulary/schemas/behavior";
import type { Boid, FoodSource } from "../vocabulary/schemas/entities";
import type { Role } from "../vocabulary/schemas/primitives";
import { SpeciesConfig } from "../vocabulary/schemas/species";

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
  frame: number,
  minDurations: MinimumStanceDuration,
  profiler: Profiler | undefined,
): StanceDecision | null {
  profiler?.start(profilerKeywords.behavior.applyDecision);
  const framesSinceTransition = frame - boid.stanceEnteredAtFrame;
  const minDuration = minDurations[boid.stance] ?? 0;
  const canTransition = framesSinceTransition >= minDuration || decision.urgent;

  if (!canTransition) {
    profiler?.end(profilerKeywords.behavior.applyDecision);
    return null; // Blocked by minimum duration
  }

  // Check if actually changing stance or substate
  const isChanging =
    boid.stance !== decision.stance || boid.substate !== decision.substate;

  if (!isChanging) {
    profiler?.end(profilerKeywords.behavior.applyDecision);
    return null; // Already in desired stance
  }

  // Create decision record
  const stanceDecision: StanceDecision = {
    boidId: boid.id,
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
  boid.stanceEnteredAtFrame = frame;

  profiler?.end(profilerKeywords.behavior.applyDecision);
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
  speciesConfig: SpeciesConfig,
  context: {
    frame: number;
    populationRatio: number;
    readyToMate: boolean;
    nearbyPrey: ItemWithDistance<Boid>[];
    nearbyFood: ItemWithDistance<FoodSource>[];
    nearbyFlock: ItemWithDistance<Boid>[];
    nearbyPredators: ItemWithDistance<Boid>[];
  },
): BehaviorContext {
  // Find closest distances (inline for performance)
  let closestPredatorDistance: number | null = null;
  let closestPredatorStance: string | null = null;
  let threatLevel = 0;

  const closestPredator = context.nearbyPredators.reduce(
    (closest, current) => {
      return current.distance < (closest?.distance ?? Infinity)
        ? current
        : closest;
    },
    null as ItemWithDistance<Boid> | null,
  );

  if (closestPredator) {
    const dx = boid.position.x - closestPredator.item.position.x;
    const dy = boid.position.y - closestPredator.item.position.y;
    closestPredatorDistance = Math.sqrt(dx * dx + dy * dy);
    closestPredatorStance = closestPredator.item.stance;

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

  const closestPrey = context.nearbyPrey.reduce(
    (closest, current) => {
      return current.distance < (closest?.distance ?? Infinity)
        ? current
        : closest;
    },
    null as ItemWithDistance<Boid> | null,
  );
  let closestPreyDistance: number | null = null;
  if (closestPrey) {
    const dx = boid.position.x - closestPrey.item.position.x;
    const dy = boid.position.y - closestPrey.item.position.y;
    closestPreyDistance = Math.sqrt(dx * dx + dy * dy);
  }

  const closestFood = context.nearbyFood.reduce(
    (closest, current) => {
      return current.distance < (closest?.distance ?? Infinity)
        ? current
        : closest;
    },
    null as ItemWithDistance<FoodSource> | null,
  );
  let closestFoodDistance: number | null = null;
  if (closestFood) {
    const dx = boid.position.x - closestFood.item.position.x;
    const dy = boid.position.y - closestFood.item.position.y;
    closestFoodDistance = Math.sqrt(dx * dx + dy * dy);
  }

  // Count available mates (Session 75: Seeking mates that are ready)
  // Only count flock members that are seeking mates or ready to mate
  const nearbyAvailableMatesCount = context.nearbyFlock.filter(
    (b) => b.item.seekingMate || b.item.stance === stanceKeywords.seeking_mate,
  ).length;

  // Calculate environment pressure from population ratio
  // 0.0-0.7 = no pressure, 0.7-0.9 = moderate, 0.9-1.0 = extreme
  const environmentPressure = Math.max(
    0,
    (context.populationRatio - 0.7) / 0.3,
  );

  return {
    boidId: boid.id,
    boidIndex: boid.index,
    currentStance: boid.stance,
    currentSubstate: boid.substate,
    stanceEnteredAt: boid.stanceEnteredAtFrame,
    energyRatio: boid.energy / boid.phenotype.maxEnergy,
    healthRatio: boid.health / boid.phenotype.maxHealth,
    nearbyPredatorCount: context.nearbyPredators.length,
    nearbyPreyCount: context.nearbyPrey.length,
    nearbyFoodCount: context.nearbyFood.length,
    nearbyFlockCount: context.nearbyFlock.length,
    nearbyAvailableMatesCount, // NEW - Session 75
    closestPredatorDistance,
    closestPreyDistance,
    closestFoodDistance,
    closestPredatorStance, // NEW - Session 75: Stance-aware threat
    threatLevel, // NEW - Session 75: Calculated threat based on stance + distance
    hasLockedTarget: boid.targetId !== null && boid.targetLockStrength > 0,
    targetLockStrength: boid.targetLockStrength,
    targetLockDuration: boid.targetLockFrame,
    hasMate: boid.mateId !== null,
    mateCommitmentFrames: boid.mateCommitmentFrames,
    readyToMate: context.readyToMate,
    populationRatio: context.populationRatio,
    environmentPressure,
    frame: context.frame,
    framesSinceTransition: context.frame - boid.stanceEnteredAtFrame,
    role: speciesConfig.role,
    reproductionType: speciesConfig.reproduction.type,
  };
}
