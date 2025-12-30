import type { BehaviorRule } from "../../vocabulary/schemas/behavior";
import {
  behaviorKeywords,
  reproductionTypeKeywords,
  roleKeywords,
} from "../../vocabulary/keywords";
import { FOOD_CONSTANTS } from "../../food";

const { prey, substates, reasons } = behaviorKeywords;

/**
 * Prey Behavior Rules - Maps existing imperative stance logic to scoring system
 *
 * These rules replicate the priority ladder from updatePreyStance():
 * Priority 0: Desperate eating (< 30% energy, overrides fear)
 * Priority 1: Fleeing (predators nearby)
 * Priority 2: Normal eating (< 70% energy, safe)
 * Priority 3: Mating (has mate)
 * Priority 4: Seeking mate (ready to mate)
 * Default: Flocking
 */

/**
 * Desperate Eating Rule (Highest Priority)
 *
 * Maps: Priority 0 from updatePreyStance
 * When energy is critical (< 30%), eat even near predators.
 * Creates risk/reward dynamics.
 */
export const desperateEatingRule: BehaviorRule = {
  metadata: {
    name: "desperate_eating",
    role: roleKeywords.prey,
    description: "Critical energy overrides fear (< 30%)",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.energyRatio > 0.3) return null; // Not desperate
    if (ctx.nearbyFoodCount === 0) return null; // No food
    if (ctx.closestFoodDistance === null) return null;
    if (ctx.closestFoodDistance > FOOD_CONSTANTS.FOOD_EATING_RADIUS)
      return null; // Too far

    return {
      stance: prey.eating,
      substate: substates.desperate,
      score: 1000, // Highest priority
      reason: reasons.critical_energy,
      urgent: true, // Overrides minimum duration
      ruleName: desperateEatingRule.metadata.name,
    };
  },
};

/**
 * Fleeing Rule
 *
 * Maps: Priority 1 from updatePreyStance
 * Flee from predators with panic/tactical substates.
 */
export const fleeingRule: BehaviorRule = {
  metadata: {
    name: "fleeing",
    role: roleKeywords.prey,
    description: "Flee from nearby predators",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.nearbyPredatorCount === 0) return null;
    if (ctx.closestPredatorDistance === null) return null;

    // Score based on danger level (closer = higher score)
    const dangerScore = 1.0 - ctx.closestPredatorDistance / 200;

    // Panic if very close, tactical if farther
    const isPanic = ctx.closestPredatorDistance < 50;

    return {
      stance: prey.fleeing,
      substate: isPanic ? substates.panic : substates.tactical,
      score: 800 * dangerScore,
      reason: reasons.predator_nearby,
      urgent: isPanic, // Panic overrides duration
      ruleName: fleeingRule.metadata.name,
    };
  },
};

/**
 * Normal Eating Rule
 *
 * Maps: Priority 2 from updatePreyStance
 * Eat when energy is low (< 70%) and safe (no predators).
 */
export const normalEatingRule: BehaviorRule = {
  metadata: {
    name: "normal_eating",
    role: roleKeywords.prey,
    description: "Eat when hungry and safe (< 70% energy)",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.energyRatio > 0.7) return null; // Not hungry
    if (ctx.nearbyFoodCount === 0) return null;
    if (ctx.closestFoodDistance === null) return null;
    if (ctx.closestFoodDistance > FOOD_CONSTANTS.FOOD_EATING_RADIUS)
      return null;
    if (ctx.nearbyPredatorCount > 0) return null; // Not safe

    return {
      stance: prey.eating,
      substate: substates.normal,
      score: 600,
      reason: reasons.low_energy,
      urgent: false,
      ruleName: normalEatingRule.metadata.name,
    };
  },
};

/**
 * Mating Rule
 *
 * Maps: Priority 3 from updatePreyStance
 * Currently mating with paired mate.
 */
export const matingRule: BehaviorRule = {
  metadata: {
    name: "mating",
    role: roleKeywords.prey,
    description: "Currently mating (has mate)",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.reproductionType !== reproductionTypeKeywords.sexual) return null; // Asexual boids don't mate
    if (!ctx.hasMate) return null; // No mate

    return {
      stance: prey.mating,
      substate: null,
      score: 500,
      reason: reasons.mate_found,
      urgent: false,
      ruleName: matingRule.metadata.name,
    };
  },
};

/**
 * Seeking Mate Rule
 *
 * Maps: Priority 4 from updatePreyStance
 * Looking for a mate (ready to reproduce).
 */
export const seekingMateRule: BehaviorRule = {
  metadata: {
    name: "seeking_mate",
    role: "prey",
    description: "Looking for mate (ready to reproduce)",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.reproductionType !== reproductionTypeKeywords.sexual) return null; // Asexual boids don't mate
    if (ctx.hasMate) return null; // Already has mate
    // Note: isReadyToMate check is done by lifecycleManager, reflected in seekingMate field
    // For now, we assume if this rule is evaluated, the boid is ready
    // TODO: Add readyToMate flag to context

    return {
      stance: prey.seeking_mate,
      substate: null,
      score: 400,
      reason: reasons.mate_ready,
      urgent: false,
      ruleName: seekingMateRule.metadata.name,
    };
  },
};

/**
 * Flocking Rule (Default)
 *
 * Maps: Default from updatePreyStance
 * Normal flocking behavior when no other priorities.
 */
export const flockingRule: BehaviorRule = {
  metadata: {
    name: "flocking",
    role: roleKeywords.prey,
    description: "Default social behavior",
    enabled: true,
  },
  evaluate: (_ctx) => {
    // Always applicable as fallback
    return {
      stance: prey.flocking,
      substate: null,
      score: 100, // Low priority (fallback)
      reason: reasons.default,
      urgent: false,
      ruleName: flockingRule.metadata.name,
    };
  },
};

// Export all prey rules
export const preyRules: BehaviorRule[] = [
  desperateEatingRule,
  fleeingRule,
  normalEatingRule,
  matingRule,
  seekingMateRule,
  flockingRule,
];
