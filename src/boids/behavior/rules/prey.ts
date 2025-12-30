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
 * Fleeing Rule (UPDATED - Session 75: Stance-Aware Threat Assessment)
 *
 * Maps: Priority 1 from updatePreyStance
 * Flee from predators with panic/tactical substates.
 * 
 * NEW: Threat assessment based on predator stance:
 * - hunting = full threat (flee immediately)
 * - idle/eating = reduced threat (cautious but less urgent)
 * - mating/seeking_mate = minimal threat (barely react)
 * 
 * This makes prey behave intelligently - they recognize when predators
 * are distracted and don't waste energy fleeing unnecessarily.
 */
export const fleeingRule: BehaviorRule = {
  metadata: {
    name: "fleeing",
    role: roleKeywords.prey,
    description: "Flee from nearby predators (stance-aware)",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.nearbyPredatorCount === 0) return null;
    if (ctx.closestPredatorDistance === null) return null;

    // Use pre-calculated threat level (includes stance + distance)
    // threatLevel ranges from 0 (no threat) to 1 (imminent danger)
    const threatScore = ctx.threatLevel;

    // Don't flee if threat is too low (predator distracted/far away)
    // Threshold: 0.2 means only flee when threat is above 20%
    if (threatScore < 0.2) return null;

    // Panic threshold is higher for non-hunting predators
    // hunting predator + close = always panic
    // idle/eating predator = only panic if VERY close
    const isPanic =
      ctx.closestPredatorStance === "hunting"
        ? ctx.closestPredatorDistance < 50
        : ctx.closestPredatorDistance < 30; // Closer threshold for idle predators

    // Score: 800 = max, scaled by threat level
    // hunting + close = 800, idle + far = 200-400
    const fleeScore = 800 * threatScore;

    return {
      stance: prey.fleeing,
      substate: isPanic ? substates.panic : substates.tactical,
      score: fleeScore,
      reason: reasons.predator_nearby,
      urgent: isPanic, // Panic overrides duration
      ruleName: fleeingRule.metadata.name,
    };
  },
};

/**
 * Normal Eating Rule (UPDATED - Session 75: Stance-Aware Safety)
 *
 * Maps: Priority 2 from updatePreyStance
 * Eat when energy is low (< 70%) and reasonably safe.
 * 
 * NEW: Uses threat level instead of binary predator check.
 * Prey will eat near idle/eating predators if threat is low enough.
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
    if (ctx.closestFoodDistance > FOOD_CONSTANTS.FOOD_EATING_RADIUS) return null;
    
    // NEW: Check threat level instead of binary predator count
    // Allow eating if threat is low (< 0.3) even with predators nearby
    // This means: idle/mating predators won't stop eating, only hunting ones
    if (ctx.threatLevel > 0.3) return null; // Not safe enough!

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
 * Mating Rule (UPDATED - Session 75: Mate Commitment)
 *
 * Maps: Priority 3 from updatePreyStance
 * Currently mating with paired mate.
 * 
 * NEW: Commitment bonus prevents switching mates midway through mating.
 * Score increases with time spent together (commitment time).
 */
export const matingRule: BehaviorRule = {
  metadata: {
    name: "mating",
    role: roleKeywords.prey,
    description: "Currently mating (has mate with commitment)",
    enabled: true,
  },
  evaluate: (ctx) => {
    if (ctx.reproductionType !== reproductionTypeKeywords.sexual) return null; // Asexual boids don't mate
    if (!ctx.hasMate) return null; // No mate

    // Commitment bonus: score increases with time spent with mate
    // Prevents switching mates midway through mating buildup
    const commitmentBonus = Math.min(ctx.mateCommitmentTime * 10, 200);

    return {
      stance: prey.mating,
      substate: null,
      score: 500 + commitmentBonus, // Higher score with more commitment
      reason: ctx.mateCommitmentTime > 0 ? reasons.mate_committed : reasons.mate_found,
      urgent: false,
      ruleName: matingRule.metadata.name,
    };
  },
};

/**
 * Seeking Mate Rule (UPDATED - Session 75: Ready Check + Environment Pressure + Availability)
 *
 * Maps: Priority 4 from updatePreyStance
 * Looking for a mate (ready to reproduce).
 * 
 * NEW: Checks readyToMate flag (age, cooldown, energy requirements).
 * NEW: Environment pressure reduces mating desire when overpopulated.
 * NEW: Only seek mate if available mates nearby (prevents pointless stance switch).
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
    if (!ctx.readyToMate) return null; // Not ready (age, cooldown, energy)
    if (ctx.nearbyAvailableMatesCount === 0) return null; // No available mates nearby

    // Environment pressure penalty: reduce score when overpopulated
    // 0% pressure = full score (400), 100% pressure = 50% score (200)
    const pressurePenalty = 1.0 - (ctx.environmentPressure * 0.5);
    const adjustedScore = 400 * pressurePenalty;

    return {
      stance: prey.seeking_mate,
      substate: null,
      score: adjustedScore,
      reason: ctx.environmentPressure > 0.5 ? reasons.environment_pressure : reasons.mate_ready,
      urgent: false,
      ruleName: seekingMateRule.metadata.name,
    };
  },
};

/**
 * Foraging Rule (NEW - Session 75)
 *
 * Search for food when hungry but no food nearby.
 * This gives prey active food-seeking behavior instead of just waiting.
 * 
 * Score increases with hunger level (more hungry = higher priority).
 */
export const foragingRule: BehaviorRule = {
  metadata: {
    name: "foraging",
    role: roleKeywords.prey,
    description: "Search for food when hungry",
    enabled: true,
  },
  evaluate: (ctx) => {
    // Don't forage if food is already nearby (should eat instead)
    if (ctx.nearbyFoodCount > 0) return null;
    // Don't forage if predators nearby (should flee instead)
    if (ctx.nearbyPredatorCount > 0) return null;
    // Don't forage if not hungry (> 70% energy)
    if (ctx.energyRatio > 0.7) return null;

    // Score increases with hunger: 60-70% energy = 250, 0-60% energy = 350
    const hungerBonus = (1.0 - ctx.energyRatio) * 100;
    const baseScore = 250;

    return {
      stance: prey.flocking, // Use flocking stance but with food-seeking intent
      substate: "wandering", // Substate indicates foraging behavior
      score: baseScore + hungerBonus,
      reason: "searching_for_food",
      urgent: false,
      ruleName: foragingRule.metadata.name,
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
  foragingRule, // NEW - Session 75
  matingRule,
  seekingMateRule,
  flockingRule,
];
