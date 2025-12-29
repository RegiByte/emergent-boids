import { SimulationProfile } from "../boids/vocabulary/schemas/prelude.ts";

/**
 * Stable Ecosystem Profile - Fast Evolution Testbed
 *
 * Optimized for rapid evolutionary experimentation:
 * - FAST GENERATION TURNOVER: Reduced lifespans and reproduction ages
 * - PERFORMANCE OPTIMIZED: Lower population caps for 60 FPS
 * - BALANCED DYNAMICS: Predator speed tuned for ecosystem stability
 * - RICH DATA: Reach Gen 20-30+ in 5-10 minutes
 *
 * Key Parameters (Session 68 tuning):
 * - Predator speed: 4.5 (critical for balance)
 * - Reproduction age: 2 seconds (was 5)
 * - Max age: 80-120 seconds (was 150-350)
 * - Population caps: 300-400 per species (was 800+)
 * - World size: 2500x2500 (was 4000x4000)
 *
 * This profile is our TESTBED for evolution experiments.
 */
export const stableEcosystemProfile: SimulationProfile = {
  id: "stable-ecosystem",
  seed: "stable-ecosystem-42",
  name: "Stable Ecosystem",
  description: "Balanced multi-species coexistence with predator-prey dynamics",

  world: {
    width: 2500,
    height: 2500,
    backgroundColor: "#0369a1", // Deep space blue-black
    initialPreyCount: 100, // Start small for performance
    initialPredatorCount: 20, // Balanced ratio (~1:5)
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
    fearFactor: 0.5, // Baseline fear factor for all species

    // Population limits (FAST EVOLUTION: Lower caps for performance)
    maxBoids: 2000, // Global safety limit (60 FPS target)
    maxPreyBoids: 1500, // Per-role cap for prey
    maxPredatorBoids: 500, // Per-role cap for predators

    // Lifecycle parameters (FAST EVOLUTION: Accelerated reproduction)
    minReproductionAge: 2, // Can start reproducing at 2 seconds old (was 5)
    reproductionEnergyThreshold: 0.4, // Need 40% energy to seek mates (was 0.5)
    reproductionCooldownTicks: 3, // 3 time passages (~3 seconds) cooldown (was 5)
    matingBuildupTicks: 2, // Must stay close to mate for 3 ticks before reproducing
    eatingCooldownTicks: 2, // Predators must wait 3 ticks after eating
    attackCooldownTicks: 3, // Predators must wait 3 ticks between attacks
  },

  species: {
    explorer: {
      id: "explorer",
      name: "Explorer",
      role: "prey",

      visual: {
        color: "#00ff88", // Green
        shape: "diamond", // Fast and agile - diamond shape
        size: 0.9, // Slightly smaller than average
        trail: true, // Birds leave trails (flight paths)
        trailColor: "#ffffff", // White trails for contrast
        bodyParts: ["eyes", "tail"], // Eyes for character, tail for direction
        tailColor: "#ffffff", // White tail for contrast
      },

      movement: {
        separationWeight: 1.5,
        alignmentWeight: 1.0,
        cohesionWeight: 1.8,
        maxSpeed: 4.4, // +10% speed (endurance specialist)
        maxForce: 0.1,
        trailLength: 8, // Reduced for performance (was 15)
        crowdAversionThreshold: 20, // Moderate tolerance for groups
        crowdAversionWeight: 1.5, // Moderate avoidance when crowded
      },

      lifecycle: {
        maxEnergy: 84, // +40% energy (140 * 0.6 scaled to food system)
        energyGainRate: 2.0, // FAST EVOLUTION: 2.0 (was 1.2) - reproduce in ~40 seconds
        energyLossRate: 0, // No passive loss (only lose energy when fleeing)
        maxAge: 100, // FAST EVOLUTION: 100 (was 300) - 3x faster turnover
        fearFactor: 0.5, // Balanced fear response
      },

      reproduction: {
        type: "sexual",
        offspringCount: 2, // Twins! (compensate for rarity when finding mates)
        offspringEnergyBonus: 0, // Standard offspring
      },

      limits: {
        maxPopulation: 400, // FAST EVOLUTION: 400 (was 800) - performance target
      },

      // Affinity System: Inter-species relationships
      affinities: {
        explorer: 1.0, // High affinity with own species
        social: 0.65, // Medium-high affinity (comfortable together, but not tight)
        cautious: 0.55, // Medium affinity (tolerate each other)
        independent: 0.2, // Low affinity (independents prefer solitude)
        predator: -0.5, // Negative (fear overrides this anyway)
      },
    },

    social: {
      id: "social",
      name: "Social",
      role: "prey",

      visual: {
        color: "#ff4488", // Pink
        shape: "circle", // Smooth and social - circle shape
        size: 1.0, // Average size
        trail: true, // Fish leave trails (water currents)
        bodyParts: ["eyes", "fins"], // Eyes for character, fins for aquatic look
      },

      movement: {
        separationWeight: 0.5,
        alignmentWeight: 2.4,
        cohesionWeight: 2.5,
        maxSpeed: 4.0, // Baseline speed
        maxForce: 0.2,
        trailLength: 6, // Reduced for performance (was 12)
        crowdAversionThreshold: 40, // High tolerance (loves groups)
        crowdAversionWeight: 1.0, // Mild avoidance when very crowded
      },

      lifecycle: {
        maxEnergy: 60, // Baseline energy (100 * 0.6 scaled to food system)
        energyGainRate: 2.2, // FAST EVOLUTION: 2.2 (was 1.3) - reproduce in ~27 seconds
        energyLossRate: 0, // No passive loss (only lose energy when fleeing)
        maxAge: 120, // FAST EVOLUTION: 120 (was 350) - 3x faster turnover
        fearFactor: 0.3, // Low fear, stays in group
      },

      reproduction: {
        type: "sexual",
        offspringCount: 1, // Standard single offspring
        offspringEnergyBonus: 0, // Standard offspring
      },

      limits: {
        maxPopulation: 400, // FAST EVOLUTION: 400 (was 800) - performance target
      },

      // Affinity System: Ultra-social species
      affinities: {
        social: 1.0, // Ultra-high affinity with own species
        cautious: 0.75, // High affinity (both prefer groups, safety in numbers)
        explorer: 0.65, // Medium-high affinity (like explorers, both are social)
        independent: 0.15, // Very low (independents avoid groups)
        predator: -0.5,
      },
    },

    independent: {
      id: "independent",
      name: "Independent",
      role: "prey",

      visual: {
        color: "#ffaa00", // Orange
        shape: "hexagon", // Sturdy and grounded - hexagon shape
        size: 1.1, // Slightly larger
        trail: false, // Ground animals don't leave trails (cleaner look)
        bodyParts: ["eyes"], // Just eyes, simple ground animal
      },

      movement: {
        separationWeight: 2.3,
        alignmentWeight: 0.5,
        cohesionWeight: 0.5,
        maxSpeed: 5.0, // +25% speed (fast solo hunters)
        maxForce: 0.15,
        trailLength: 10, // Reduced for performance (was 20)
        crowdAversionThreshold: 8, // Very low tolerance (solitary)
        crowdAversionWeight: 2.0, // Strong avoidance when crowded
      },

      lifecycle: {
        maxEnergy: 72, // +20% energy (120 * 0.6 scaled to food system)
        energyGainRate: 2.5, // FAST EVOLUTION: 2.5 (was 1.5) - reproduce in ~29 seconds
        energyLossRate: 0, // No passive loss (only lose energy when fleeing)
        maxAge: 80, // FAST EVOLUTION: 80 (was 150) - fastest turnover (solitary lifestyle)
        fearFactor: 0.8, // High fear, scatters immediately
      },

      reproduction: {
        type: "asexual", // KEY: Solo reproduction!
        offspringCount: 1, // Single offspring
        offspringEnergyBonus: 0, // Standard offspring
        cooldownTicks: 8, // FAST EVOLUTION: 8 (was 50) - still longer than sexual (3)
      },

      limits: {
        maxPopulation: 300, // FAST EVOLUTION: 300 (was 800) - lower cap for diversity
      },

      // Affinity System: Solitary species
      affinities: {
        independent: 0.6, // Even independents tolerate their own kind somewhat
        explorer: 0.52, // Low affinity but not zero (prefer solitude)
        social: 0.15, // Very low (avoid crowds)
        cautious: 0.25, // Low affinity (different strategies)
        predator: -0.5,
      },
    },

    cautious: {
      id: "cautious",
      name: "Cautious",
      role: "prey",

      visual: {
        color: "#00aaff", // Blue
        shape: "hexagon", // Sturdy and grounded - hexagon shape
        size: 0.95, // Slightly smaller, defensive
        trail: false, // Ground animals don't leave trails (cleaner look)
        bodyParts: ["eyes", "spikes"], // Just eyes, cautious and simple
      },

      movement: {
        separationWeight: 2.0,
        alignmentWeight: 1.5,
        cohesionWeight: 2.0,
        maxSpeed: 3.9, // Slower, defensive
        maxForce: 0.12,
        trailLength: 5, // Reduced for performance (was 10)
        crowdAversionThreshold: 50, // Very high tolerance (safety in numbers)
        crowdAversionWeight: 0.8, // Weak avoidance (prefer staying together)
      },

      lifecycle: {
        maxEnergy: 60, // -10% energy (90 * 0.6 scaled to food system)
        energyGainRate: 2.7, // FAST EVOLUTION: 2.7 (was 1.6) - reproduce in ~22 seconds
        energyLossRate: 0, // No passive loss (only lose energy when fleeing)
        maxAge: 100, // FAST EVOLUTION: 100 (was 300) - 3x faster turnover
        fearFactor: 0.6, // Medium-high fear, coordinated escape
      },

      reproduction: {
        type: "sexual",
        offspringCount: 2, // Twins
        offspringEnergyBonus: 0.3, // +30% energy (stronger offspring)
      },

      limits: {
        maxPopulation: 400, // FAST EVOLUTION: 400 (was 800) - performance target
        fearRadius: 175, // +33% detection range (150 → 175)
      },

      // Affinity System: Defensive group-oriented species
      affinities: {
        cautious: 1.0, // High affinity with own species
        social: 0.75, // High affinity (both prefer groups, safety in numbers)
        explorer: 0.55, // Medium affinity (different strategies but compatible)
        independent: 0.25, // Low affinity (independents don't fit defensive strategy)
        predator: -0.5,
      },
    },

    predator: {
      id: "predator",
      name: "Predator",
      role: "predator",

      visual: {
        color: "#ff0000", // Bright red
        shape: "diamond", // Fast and aggressive - diamond shape
        size: 1.3, // Larger and more menacing
        trail: true, // Predators leave trails (hunting paths)
        bodyParts: ["eyes", "fins", "tail", "glow"], // Eyes, fins on sides, tail fin, glow for menace
      },

      movement: {
        separationWeight: 2.5, // Spread out more
        alignmentWeight: 0.0, // Don't align with prey
        cohesionWeight: 0.0, // Don't flock with prey
        maxSpeed: 4.5, // CRITICAL: 4.5 (Session 68 finding) - must catch prey!
        maxForce: 0.2, // High turning ability
        trailLength: 12, // Reduced for performance (was 25)
        crowdAversionThreshold: 15, // Moderate tolerance (territorial)
        crowdAversionWeight: 1.8, // Strong avoidance (maintain hunting territory)
      },

      lifecycle: {
        maxEnergy: 150, // Need ~4 catches to reproduce
        energyGainRate: 40, // FAST EVOLUTION: 40 (was 25) - easier to feed
        energyLossRate: 1.2, // FAST EVOLUTION: 1.2 (was 1.0) - starve in ~125 seconds
        maxAge: 100, // FAST EVOLUTION: 100 (was 300) - 3x faster turnover
        fearFactor: 0, // Predators don't fear
      },

      reproduction: {
        type: "sexual",
        offspringCount: 1, // Single offspring
        offspringEnergyBonus: 0, // Standard offspring
      },

      limits: {
        maxPopulation: 300, // FAST EVOLUTION: 300 (was 800) - performance target
      },

      // Affinity System: Solitary hunters
      affinities: {
        predator: 0.7, // Moderate affinity with other predators (tolerate but compete)
        // Prey affinities don't matter (chase/fear overrides flocking)
      },
    },
  },
};
