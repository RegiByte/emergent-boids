import type { OffspringData } from "../mating";

/**
 * Lifecycle Events - Internal events collected during engine update
 * 
 * These are lightweight events collected per-boid during the staggered
 * lifecycle checks. They're processed in batch at the end of each frame.
 * 
 * Philosophy: "Everything is information processing. Simple rules compose."
 * - Events are facts (past tense)
 * - Collectors accumulate (no side effects)
 * - Processors apply (isolated side effects)
 */

export type LifecycleDeath = {
  type: "lifecycle:death";
  boidId: string;
  typeId: string;
  reason: "old_age" | "starvation" | "predation";
};

export type LifecycleReproduction = {
  type: "lifecycle:reproduction";
  offspring: OffspringData;
};

export type LifecycleEnergyLow = {
  type: "lifecycle:energy-low";
  boidId: string;
  energy: number;
};

export type LifecycleHealthLow = {
  type: "lifecycle:health-low";
  boidId: string;
  health: number;
};

export type LifecycleFoodConsumed = {
  type: "lifecycle:food-consumed";
  foodId: string;
  energyConsumed: number;
};

/**
 * Union of all lifecycle events
 */
export type LifecycleEvent =
  | LifecycleDeath
  | LifecycleReproduction
  | LifecycleEnergyLow
  | LifecycleHealthLow
  | LifecycleFoodConsumed;

/**
 * Lifecycle event collector callback type
 */
export type CollectLifecycleEvent = (event: LifecycleEvent) => void;

