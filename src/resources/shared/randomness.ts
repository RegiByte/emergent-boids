/**
 * Randomness Resource - Hierarchical Seeded RNG System
 *
 * Provides reproducible randomness across the entire simulation.
 * Based on a single master seed, creates domain-specific RNG streams.
 *
 * Philosophy: "Everything is information processing"
 * - Single source of truth (master seed)
 * - Domain separation (spawning, movement, reproduction, etc.)
 * - Composable (other resources depend on this)
 * - No central governor (each domain independent)
 *
 * Domains:
 * - spawning: Initial boid creation, species selection
 * - movement: Velocity initialization, position jitter
 * - reproduction: Offspring position, energy bonus variation
 * - lifecycle: Random selection for culling, food spawning
 * - food: Food source placement
 *
 * @example
 * const randomness = useResource("randomness");
 * const spawning = randomness.domain("spawning");
 * const typeId = spawning.pick(typeIds);
 */

import { defineResource } from "braided";
import { createSeededRNG, type DomainRNG } from "@/lib/seededRandom.ts";
import { createSubscription } from "@/lib/state.ts";

type RandomnessEvent = {
  type: "seedUpdated";
  newSeed: string | number;
};

export interface RandomnessResource {
  /** Get the current master seed */
  getMasterSeed(): string;

  /** Get the master seed as number */
  getMasterSeedNumber(): number;

  /** Get a domain-specific RNG */
  domain(_name: string): DomainRNG;

  /** Get all active domain names */
  getDomains(): string[];

  /** Reset RNG with new seed (triggers re-initialization) */
  setSeed(_newSeed: string | number): void;

  /** Watch for seed updates */
  watch: (callback: (event: RandomnessEvent) => void) => () => void;
}

/**
 * Randomness Resource
 *
 * Depends on: runtimeStore (for seed configuration)
 * Used by: All systems that need randomness
 */
export const randomness = defineResource({
  dependencies: [],
  start: (): RandomnessResource => {
    // Get seed from store, or use default
    const seed = "simulation-42";

    // Create hierarchical RNG
    let rng = createSeededRNG(seed);

    const outptutSubscription = createSubscription<RandomnessEvent>();

    console.log(
      `[randomness] Initialized with seed: "${seed}" (${rng.getMasterSeedNumber()})`
    );

    const api = {
      getMasterSeed: () => rng.getMasterSeed(),
      getMasterSeedNumber: () => rng.getMasterSeedNumber(),
      domain: (name: string) => rng.domain(name),
      getDomains: () => rng.getDomains(),

      setSeed: (newSeed: string | number) => {
        // Notify subscribers and re-initialize RNG with new seed
        rng = createSeededRNG(newSeed);
        outptutSubscription.notify({ type: "seedUpdated", newSeed: newSeed });
      },
      watch: outptutSubscription.subscribe,
    };

    return api;
  },
  halt: () => {
    // No cleanup needed - RNG is stateless
  },
});
