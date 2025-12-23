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
import type { RuntimeStoreResource } from "./runtimeStore";
import { createSeededRNG, type DomainRNG } from "@/lib/seededRandom";

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
}

/**
 * Randomness Resource
 *
 * Depends on: runtimeStore (for seed configuration)
 * Used by: All systems that need randomness
 */
export const randomness = defineResource({
  dependencies: ["runtimeStore"],
  start: ({
    runtimeStore,
  }: {
    runtimeStore: RuntimeStoreResource;
  }): RandomnessResource => {
    // Get seed from store, or use default
    const seed =
      runtimeStore.store.getState().config.randomSeed || "simulation-42";

    // Create hierarchical RNG
    let rng = createSeededRNG(seed);

    console.log(
      `[randomness] Initialized with seed: "${seed}" (${rng.getMasterSeedNumber()})`
    );

    return {
      getMasterSeed: () => rng.getMasterSeed(),
      getMasterSeedNumber: () => rng.getMasterSeedNumber(),
      domain: (name: string) => rng.domain(name),
      getDomains: () => rng.getDomains(),

      setSeed: (newSeed: string | number) => {
        // Update store with new seed
        const currentState = runtimeStore.store.getState();
        runtimeStore.store.setState({
          ...currentState,
          config: {
            ...currentState.config,
            randomSeed: String(newSeed),
          },
        });
        // Re-initialize RNG with new seed
        rng = createSeededRNG(newSeed);
        console.log(
          `[randomness] Reset-initialized with seed: "${newSeed}" (${rng.getMasterSeedNumber()})`
        );
      },
    };
  },
  halt: () => {
    // No cleanup needed - RNG is stateless
  },
});
