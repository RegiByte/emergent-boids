import type { BehaviorRule } from "../../vocabulary/schemas/behavior";
import { behaviorKeywords, roleKeywords } from "../../vocabulary/keywords";
import { FOOD_CONSTANTS } from "../../food";

const { predator, substates, reasons } = behaviorKeywords;

/**
 * Predator Behavior Rules - Maps existing imperative stance logic to scoring system
 *
 * These rules replicate the priority ladder from updatePredatorStance():
 * Priority 1: Eating (near food OR has eating cooldown)
 * Priority 2: Mating (has mate)
 * Priority 3: Seeking mate (ready to mate)
 * Priority 4: Idle (low energy with hysteresis: enter at 30%, exit at 50%)
 * Default: Hunting
 *
 * NEW: Target tracking for chase commitment
 * - Locked targets get higher priority (continue chase)
 * - New targets start with stalking substate
 * - Chase substate when locked on target
 */

/**
 * Eating Rule (Highest Priority)
 *
 * Maps: Priority 1 from updatePredatorStance
 * Eat when food is nearby or on cooldown.
 *
 * FIXED (Session 75): Use actual eating radius, not detection radius.
 * Old code used 1.5x which caused eating stance to trigger too far away.
 */
export const eatingRule: BehaviorRule = {
  metadata: {
    name: "eating",
    role: roleKeywords.predator,
    description: "Consume nearby food",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.nearbyFoodCount === 0) return null;
    if (ctx.closestFoodDistance === null) return null;
    // Use actual eating radius (30px), not detection radius (45px)
    if (ctx.closestFoodDistance > FOOD_CONSTANTS.FOOD_EATING_RADIUS)
      return null; // Too far to eat

    return {
      stance: predator.eating,
      substate: null,
      score: 900,
      reason: reasons.food_nearby,
      urgent: false,
      ruleName: eatingRule.metadata.name,
    };
  },
};

/**
 * Chase Commitment Rule (NEW - Target Tracking)
 *
 * Continue chasing locked target with high priority.
 * Lock strength increases score (commitment bonus).
 */
export const chaseCommitmentRule: BehaviorRule = {
  metadata: {
    name: "chase_commitment",
    role: roleKeywords.predator,
    description: "Commit to locked target",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (!ctx.hasLockedTarget) return null;

    // Strong preference for continuing chase
    // Lock strength 1.0 = +300 score (very high priority)
    const commitmentBonus = ctx.targetLockStrength * 300;

    return {
      stance: predator.hunting,
      substate: substates.chasing,
      score: 700 + commitmentBonus,
      reason: reasons.locked_on_target,
      urgent: false,
      ruleName: chaseCommitmentRule.metadata.name,
    };
  },
};

/**
 * New Hunt Rule
 *
 * Start hunting when prey detected (no locked target).
 */
export const newHuntRule: BehaviorRule = {
  metadata: {
    name: "new_hunt",
    role: roleKeywords.predator,
    description: "Hunt newly detected prey",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.nearbyPreyCount === 0) return null;
    if (ctx.hasLockedTarget) return null; // Already hunting (use chase commitment instead)

    // Closer prey = higher score
    const proximityScore = ctx.closestPreyDistance
      ? 1.0 - ctx.closestPreyDistance / 200
      : 0.5;

    return {
      stance: predator.hunting,
      substate: substates.stalking,
      score: 600 * proximityScore,
      reason: reasons.prey_detected,
      urgent: false,
      ruleName: newHuntRule.metadata.name,
    };
  },
};

/**
 * Mating Rule (UPDATED - Session 75: Mate Commitment)
 *
 * Maps: Priority 2 from updatePredatorStance
 * Currently mating with paired mate.
 *
 * NEW: Commitment bonus prevents switching mates midway through mating.
 * Score increases with time spent together (commitment time).
 */
export const matingRule: BehaviorRule = {
  metadata: {
    name: "mating",
    role: roleKeywords.predator,
    description: "Currently mating (has mate with commitment)",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.reproductionType !== "sexual") return null; // Asexual boids don't mate
    if (!ctx.hasMate) return null; // No mate

    // Commitment bonus: score increases with time spent with mate
    // Prevents switching mates midway through mating buildup
    const commitmentBonus = Math.min(ctx.mateCommitmentTime * 10, 200);

    return {
      stance: predator.mating,
      substate: null,
      score: 500 + commitmentBonus, // Higher score with more commitment
      reason:
        ctx.mateCommitmentTime > 0
          ? reasons.mate_committed
          : reasons.mate_found,
      urgent: false,
      ruleName: matingRule.metadata.name,
    };
  },
};

/**
 * Seeking Mate Rule (UPDATED - Session 75: Ready Check + Environment Pressure + Availability)
 *
 * Maps: Priority 3 from updatePredatorStance
 * Looking for a mate (ready to reproduce).
 *
 * NEW: Checks readyToMate flag (age, cooldown, energy requirements).
 * NEW: Environment pressure reduces mating desire when overpopulated.
 * NEW: Only seek mate if available mates nearby (prevents pointless stance switch).
 */
export const seekingMateRule: BehaviorRule = {
  metadata: {
    name: "seeking_mate",
    role: roleKeywords.predator,
    description: "Looking for mate (ready to reproduce)",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.reproductionType !== "sexual") return null; // Asexual boids don't mate
    if (ctx.hasMate) return null; // Already has mate
    if (!ctx.readyToMate) return null; // Not ready (age, cooldown, energy)
    if (ctx.nearbyAvailableMatesCount === 0) return null; // No available mates nearby

    // Environment pressure penalty: reduce score when overpopulated
    // 0% pressure = full score (400), 100% pressure = 50% score (200)
    const pressurePenalty = 1.0 - ctx.environmentPressure * 0.5;
    const adjustedScore = 400 * pressurePenalty;

    return {
      stance: predator.seeking_mate,
      substate: null,
      score: adjustedScore,
      reason:
        ctx.environmentPressure > 0.5
          ? reasons.environment_pressure
          : reasons.mate_ready,
      urgent: false,
      ruleName: seekingMateRule.metadata.name,
    };
  },
};

/**
 * Idle Rule (with Hysteresis)
 *
 * Maps: Priority 4 from updatePredatorStance
 * Rest when energy is low, stay resting until recovered.
 * Hysteresis: enter at 30%, exit at 50%
 */
export const idleRule: BehaviorRule = {
  metadata: {
    name: "idle",
    role: roleKeywords.predator,
    description: "Conserve energy when low",
    enabled: true,
  },
  evaluate: (ctx) => {
    // Hysteresis: enter at 30%, exit at 50%
    if (ctx.currentStance === predator.idle) {
      // Already idle: stay until energy recovers to 50%
      if (ctx.energyRatio < 0.5) {
        return {
          stance: predator.idle,
          substate: ctx.energyRatio < 0.2 ? substates.resting : null,
          score: 500,
          reason: reasons.recovering_energy,
          urgent: false,
          ruleName: idleRule.metadata.name,
        };
      }
      return null; // Exit idle (energy recovered)
    }

    // Not idle: enter if energy drops below 30%
    if (ctx.energyRatio < 0.3) {
      return {
        stance: predator.idle,
        substate: substates.resting,
        score: 500,
        reason: reasons.low_energy,
        urgent: false,
        ruleName: idleRule.metadata.name,
      };
    }

    return null;
  },
};

/**
 * Hunting Rule (Default)
 *
 * Maps: Default from updatePredatorStance
 * Default active behavior when no other priorities.
 */
export const huntingRule: BehaviorRule = {
  metadata: {
    name: "hunting",
    role: roleKeywords.predator,
    description: "Default active behavior",
    enabled: true,
  },
  evaluate: (_ctx) => {
    // Always applicable as fallback
    return {
      stance: predator.hunting,
      substate: substates.searching,
      score: 100, // Low priority (fallback)
      reason: reasons.default,
      urgent: false,
      ruleName: "hunting",
    };
  },
};

// Export all predator rules
export const predatorRules: BehaviorRule[] = [
  eatingRule,
  chaseCommitmentRule,
  newHuntRule,
  matingRule,
  seekingMateRule,
  idleRule,
  huntingRule,
];
