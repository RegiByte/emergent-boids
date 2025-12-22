import {SimulationProfile} from "../vocabulary/schemas/prelude.ts";

/**
 * Stable Ecosystem Profile
 *
 * A balanced multi-species ecosystem demonstrating:
 * - Coexistence of 4 prey species with different strategies
 * - Predator-prey dynamics with natural emergence
 * - Sexual and asexual reproduction
 * - Resource competition and energy flow
 *
 * This profile represents the current "default" simulation that has been
 * tuned over many sessions for stable, interesting dynamics.
 */
export const stableEcosystemProfile: SimulationProfile = {
  id: "stable-ecosystem",
  name: "Stable Ecosystem",
  description: "Balanced multi-species coexistence with predator-prey dynamics",

  world: {
    canvasWidth: 1400,
    canvasHeight: 1000,
    initialPreyCount: 50,
    initialPredatorCount: 0, // Predators emerge from prey evolution
  },

  species: {
    explorer: {
      id: "explorer",
      name: "Explorer",
      color: "#00ff88", // Green
      role: "prey",

      movement: {
        separationWeight: 1.5,
        alignmentWeight: 1.0,
        cohesionWeight: 1.8,
        maxSpeed: 4.4, // +10% speed (endurance specialist)
        maxForce: 0.1,
        trailLength: 8, // Reduced for performance (was 15)
      },

      lifecycle: {
        maxEnergy: 84, // +40% energy (140 * 0.6 scaled to food system)
        energyGainRate: 1.2, // Reduced from 1.0 - reproduce in ~100 seconds
        energyLossRate: 0, // No passive loss (only lose energy when fleeing)
        maxAge: 90, // Longer lifespan for multiple reproduction cycles
        fearFactor: 0.5, // Balanced fear response
      },

      reproduction: {
        type: "sexual",
        offspringCount: 2, // Twins! (compensate for rarity when finding mates)
        offspringEnergyBonus: 0, // Standard offspring
      },

      limits: {
        maxPopulation: 150, // Cap at 150 explorers (30% of prey cap)
      },
    },

    social: {
      id: "social",
      name: "Social",
      color: "#ff4488", // Pink
      role: "prey",

      movement: {
        separationWeight: 0.5,
        alignmentWeight: 2.4,
        cohesionWeight: 2.5,
        maxSpeed: 4.0, // Baseline speed
        maxForce: 0.08,
        trailLength: 6, // Reduced for performance (was 12)
      },

      lifecycle: {
        maxEnergy: 60, // Baseline energy (100 * 0.6 scaled to food system)
        energyGainRate: 1.3, // Reduced from 0.8 - reproduce in ~120 seconds
        energyLossRate: 0, // No passive loss (only lose energy when fleeing)
        maxAge: 110, // Longer lifespan for multiple reproduction cycles
        fearFactor: 0.3, // Low fear, stays in group
      },

      reproduction: {
        type: "sexual",
        offspringCount: 1, // Standard single offspring
        offspringEnergyBonus: 0, // Standard offspring
      },

      limits: {
        maxPopulation: 150, // Cap at 150 socials (30% of prey cap)
      },
    },

    independent: {
      id: "independent",
      name: "Independent",
      color: "#ffaa00", // Orange
      role: "prey",

      movement: {
        separationWeight: 2.5,
        alignmentWeight: 0.5,
        cohesionWeight: 0.5,
        maxSpeed: 5.0, // +25% speed (fast solo hunters)
        maxForce: 0.15,
        trailLength: 10, // Reduced for performance (was 20)
      },

      lifecycle: {
        maxEnergy: 72, // +20% energy (120 * 0.6 scaled to food system)
        energyGainRate: 1.5, // Reduced from 1.2 - reproduce in ~75 seconds (still fastest)
        energyLossRate: 0, // No passive loss (only lose energy when fleeing)
        maxAge: 90, // Longer lifespan for multiple reproduction cycles
        fearFactor: 0.8, // High fear, scatters immediately
      },

      reproduction: {
        type: "asexual", // KEY: Solo reproduction!
        offspringCount: 1, // Single offspring
        offspringEnergyBonus: 0, // Standard offspring
        cooldownTicks: 15, // 3x longer cooldown (5 → 15) to balance asexual advantage
      },

      limits: {
        maxPopulation: 150, // Cap at 150 independents (30% of prey cap) - CRITICAL for diversity!
      },
    },

    cautious: {
      id: "cautious",
      name: "Cautious",
      color: "#00aaff", // Blue
      role: "prey",

      movement: {
        separationWeight: 2.0,
        alignmentWeight: 1.5,
        cohesionWeight: 2.0,
        maxSpeed: 3.9, // Slower, defensive
        maxForce: 0.12,
        trailLength: 5, // Reduced for performance (was 10)
      },

      lifecycle: {
        maxEnergy: 60, // -10% energy (90 * 0.6 scaled to food system)
        energyGainRate: 1.6, // Reduced from 0.9 - reproduce in ~109 seconds
        energyLossRate: 0, // No passive loss (only lose energy when fleeing)
        maxAge: 100, // Longest lifespan - cautious types live longer
        fearFactor: 0.6, // Medium-high fear, coordinated escape
      },

      reproduction: {
        type: "sexual",
        offspringCount: 2, // Twins
        offspringEnergyBonus: 0.3, // +30% energy (stronger offspring)
      },

      limits: {
        maxPopulation: 150, // Cap at 150 cautious (30% of prey cap)
        fearRadius: 175, // +33% detection range (150 → 175)
      },
    },

    predator: {
      id: "predator",
      name: "Predator",
      color: "#ff0000", // Bright red
      role: "predator",

      movement: {
        separationWeight: 2.5, // Spread out more
        alignmentWeight: 0.0, // Don't align with prey
        cohesionWeight: 0.0, // Don't flock with prey
        maxSpeed: 3.2, // Faster than socials, slower than independents
        maxForce: 0.2, // High turning ability
        trailLength: 12, // Reduced for performance (was 25)
      },

      lifecycle: {
        maxEnergy: 150, // Need 6 catches to reproduce
        energyGainRate: 25, // Less energy per catch
        energyLossRate: 3.0, // Die in 75 seconds without food
        maxAge: 90, // More time to reproduce
        fearFactor: 0, // Predators don't fear
      },

      reproduction: {
        type: "sexual",
        offspringCount: 1, // Single offspring
        offspringEnergyBonus: 0, // Standard offspring
      },

      limits: {},
    },
  },

  parameters: {
    // Perception and interaction
    perceptionRadius: 50,
    obstacleAvoidanceWeight: 2.0,
    fearRadius: 150, // Increased from 100 - earlier warning system
    chaseRadius: 150,
    catchRadius: 10,
    mateRadius: 20, // Proximity-based reproduction
    minDistance: 10, // Prevents overlap/stacking

    // Population limits
    maxBoids: 600, // Global safety limit
    maxPreyBoids: 500, // Per-role cap for prey
    maxPredatorBoids: 50, // Per-role cap for predators

    // Lifecycle parameters
    minReproductionAge: 5, // Can start reproducing at 5 seconds old
    reproductionEnergyThreshold: 0.5, // Need 50% energy to seek mates
    reproductionCooldownTicks: 5, // 5 time passages (~5 seconds) cooldown
    matingBuildupTicks: 2, // Must stay close to mate for 3 ticks before reproducing
    eatingCooldownTicks: 2, // Predators must wait 3 ticks after eating
  },
};

