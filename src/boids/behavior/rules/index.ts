import type {
  BehaviorRuleset,
  MinimumStanceDuration,
} from "../../vocabulary/schemas/behavior";
import { preyRules } from "./prey";
import { predatorRules } from "./predator";

/**
 * Behavior Ruleset Factory
 *
 * Creates the default behavior ruleset for the simulation.
 * Called once at initialization and reused for all evaluations.
 */
export function createBehaviorRuleset(): BehaviorRuleset {
  return {
    preyRules,
    predatorRules,
  };
}

/**
 * Minimum stance durations (in ticks at 30 UPS).
 *
 * Prevents rapid flickering between stances.
 * Urgent decisions can override these durations.
 *
 * Design: Conservative durations to maintain stable behavior.
 * Can be tuned based on feel during testing.
 *
 * Note: Shared stances (eating, seeking_mate, mating) have same duration for both roles.
 */
export const MINIMUM_STANCE_DURATION: MinimumStanceDuration = {
  // Prey-specific stances
  flocking: 0, // Can switch immediately
  fleeing: 10, // ~0.33 seconds (commit to fleeing)

  // Predator-specific stances
  hunting: 0, // Can switch immediately
  idle: 30, // ~1 second (rest before hunting again)

  // Shared stances (both prey and predator)
  eating: 20, // ~0.67 seconds (finish eating)
  seeking_mate: 15, // ~0.5 seconds
  mating: 60, // ~2 seconds (complete mating)
} as const;
