import { z } from 'zod'
import { reproductionTypeKeywords, roleKeywords } from '../keywords'
import { stanceSchema } from './primitives'

/**
 * Behavior Schemas - Type-safe behavior scoring system
 *
 * This file defines the core types for the behavior scoring system.
 * The system replaces imperative stance ladders with composable rules
 * that "vote" on what a boid should do.
 *
 * Philosophy: Simple rules compose. Highest score wins.
 */

/**
 * Behavior Context Schema
 *
 * All information a behavior rule needs to make decisions.
 * Passed to every rule evaluation.
 *
 * Design: Minimal allocations - reuse context object when possible.
 */
export const behaviorContextSchema = z.object({
  boidId: z.string(),
  boidIndex: z.number(),

  currentStance: z.string(),
  currentSubstate: z.string().nullable(),
  stanceEnteredAt: z.number(),

  energyRatio: z.number().min(0).max(1),
  healthRatio: z.number().min(0).max(1),

  nearbyPredatorCount: z.number(),
  nearbyPreyCount: z.number(),
  nearbyFoodCount: z.number(),
  nearbyFlockCount: z.number(),
  nearbyAvailableMatesCount: z.number(), // NEW -

  closestPredatorDistance: z.number().nullable(),
  closestPreyDistance: z.number().nullable(),
  closestFoodDistance: z.number().nullable(),

  closestPredatorStance: z.string().nullable(), // Stance of closest predator
  threatLevel: z.number().min(0).max(1), // 0 = no threat, 1 = imminent danger

  hasLockedTarget: z.boolean(),
  targetLockStrength: z.number().min(0).max(1),
  targetLockDuration: z.number(),

  hasMate: z.boolean(),
  mateCommitmentFrames: z.number().default(0), // Frames spent with current mate
  readyToMate: z.boolean(), // isReadyToMate() result (age, cooldown, energy checks)

  populationRatio: z.number().min(0).max(1), // current / max population
  environmentPressure: z.number().min(0).max(1), // 0 = no pressure, 1 = max pressure

  frame: z.number(),
  framesSinceTransition: z.number(),

  role: z.enum([roleKeywords.prey, roleKeywords.predator]),
  reproductionType: z.enum([
    reproductionTypeKeywords.sexual,
    reproductionTypeKeywords.asexual,
  ]),
})

/**
 * Behavior Score Schema
 *
 * Result of evaluating a behavior rule.
 * Describes what the boid should do and why.
 */
export const behaviorScoreSchema = z.object({
  stance: stanceSchema,
  substate: z.string().nullable(),

  score: z.number().min(0),

  reason: z.string(),

  urgent: z.boolean(),

  ruleName: z.string(),
})

/**
 * Behavior Rule Metadata Schema
 *
 * Metadata about a behavior rule.
 * Actual evaluation function is not in schema (it's a function).
 */
export const behaviorRuleMetadataSchema = z.object({
  name: z.string(),
  role: z.enum([roleKeywords.prey, roleKeywords.predator, roleKeywords.both]),
  description: z.string(),
  enabled: z.boolean().default(true),
})

/**
 * Stance Decision Schema
 *
 * Record of a stance transition for analytics.
 * Captures context + decision for ML training and debugging.
 */
export const stanceDecisionSchema = z.object({
  boidId: z.string(),
  frame: z.number(),

  previousStance: z.string(),
  previousSubstate: z.string().nullable(),
  newStance: z.string(),
  newSubstate: z.string().nullable(),

  score: z.number(),
  reason: z.string(),
  ruleName: z.string(),
  urgent: z.boolean(),

  energyRatio: z.number(),
  healthRatio: z.number(),
  nearbyPredatorCount: z.number(),
  nearbyPreyCount: z.number(),
})

/**
 * Minimum Stance Duration Config Schema
 *
 * How long boids must stay in each stance before transitioning.
 * Prevents rapid flickering between states.
 */
export const minimumStanceDurationSchema = z.record(
  z.string(),
  z.number().int().min(0)
)

export type BehaviorContext = z.infer<typeof behaviorContextSchema>
export type BehaviorScore = z.infer<typeof behaviorScoreSchema>
export type BehaviorRuleMetadata = z.infer<typeof behaviorRuleMetadataSchema>
export type StanceDecision = z.infer<typeof stanceDecisionSchema>
export type MinimumStanceDuration = z.infer<typeof minimumStanceDurationSchema>

/**
 * Behavior Rule Type
 *
 * A function that evaluates whether a boid should adopt a behavior.
 * Returns a score if the behavior is applicable, null otherwise.
 *
 * Design: Pure function - no side effects, easy to test.
 */
export type BehaviorRule = {
  metadata: BehaviorRuleMetadata
  evaluate: (context: BehaviorContext) => BehaviorScore | null
}

/**
 * Behavior Ruleset Type
 *
 * Collection of rules for prey and predators.
 * Created once at initialization, reused for all evaluations.
 */
export type BehaviorRuleset = {
  preyRules: BehaviorRule[]
  predatorRules: BehaviorRule[]
}
