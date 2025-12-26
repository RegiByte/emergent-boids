import { SimulationProfile } from "../boids/vocabulary/schemas/prelude.ts";

/**
 * Peaceful Coexistence Profile
 *
 * A harmonious multi-species ecosystem featuring:
 * - NO predators (pure prey species only)
 * - 4 distinct species with different survival strategies
 * - Resource competition and coexistence dynamics
 * - Demonstrates inter-species cooperation and competition
 *
 * This profile shows:
 * - Emergent social behaviors without predation pressure
 * - Resource management and food competition
 * - Species diversity through different reproductive strategies
 * - Natural population balance through energy constraints
 */
export const peacefulCoexistenceProfile: SimulationProfile = {
  id: "peaceful-coexistence",
  seed: "peaceful-coexistence-harmony-42",
  name: "Peaceful Coexistence",
  description: "Harmonious ecosystem: 4 prey species coexist without predators",

  world: {
    width: 2000,
    height: 2000,
    backgroundColor: "#006994", // Peaceful ocean blue
    initialPreyCount: 300, // More prey (no predation)
    initialPredatorCount: 0, // NO predators!
  },

  parameters: {
    // Perception and interaction
    perceptionRadius: 50,
    obstacleAvoidanceWeight: 2.0,
    fearRadius: 100, // Still need fear radius for death markers
    chaseRadius: 0, // No chasing (no predators)
    catchRadius: 0, // No catching (no predators)
    mateRadius: 20,
    minDistance: 10,
    fearFactor: 0.3, // Low fear (peaceful world)

    // Population limits
    maxBoids: 1000, // Higher cap (no predators to control population)
    maxPreyBoids: 1000, // All prey
    maxPredatorBoids: 0, // No predators

    // Lifecycle parameters
    minReproductionAge: 8, // Longer maturation (less pressure)
    reproductionEnergyThreshold: 0.6, // Higher threshold (resources matter)
    reproductionCooldownTicks: 8, // Slower reproduction
    matingBuildupTicks: 3, // Longer courtship
    eatingCooldownTicks: 0, // N/A (no predators)
  },

  species: {
    // Graceful floaters - Large, slow, social
    graceful: {
      id: "graceful",
      name: "Graceful",
      role: "prey",

      visual: {
        color: "#00ffaa", // Turquoise - peaceful
        shape: "circle",
        size: 1.2, // Large and prominent
        trail: true,
        trailColor: "#ffffff",
        bodyParts: ["eyes", "fins"],
      },

      movement: {
        separationWeight: 0.8,
        alignmentWeight: 2.0,
        cohesionWeight: 2.2,
        maxSpeed: 3.2, // Slow and graceful
        maxForce: 0.08,
        trailLength: 12,
        crowdAversionThreshold: 50,
        crowdAversionWeight: 0.8,
      },

      lifecycle: {
        maxEnergy: 100, // High energy capacity
        energyGainRate: 0.8, // Slow energy gain (resource competition)
        energyLossRate: 0,
        maxAge: 400, // Long lifespan (peaceful world)
        fearFactor: 0.2, // Very calm
      },

      reproduction: {
        type: "sexual",
        offspringCount: 1, // Single offspring (slow growth)
        offspringEnergyBonus: 0.4, // Strong offspring
      },

      limits: {
        maxPopulation: 500,
      },

      affinities: {
        graceful: 1.0,
        social: 0.85, // High affinity with other social species
        wanderer: 0.6, // Medium affinity
        hermit: 0.3, // Low affinity (different lifestyles)
      },
    },

    // Social butterflies - Medium speed, tight groups
    social: {
      id: "social",
      name: "Social",
      role: "prey",

      visual: {
        color: "#ff66ff", // Pink-magenta - friendly
        shape: "hexagon",
        size: 0.95,
        trail: true,
        bodyParts: ["eyes", "tail"],
      },

      movement: {
        separationWeight: 0.6,
        alignmentWeight: 2.5,
        cohesionWeight: 2.8,
        maxSpeed: 3.8,
        maxForce: 0.1,
        trailLength: 8,
        crowdAversionThreshold: 70, // Very high tolerance
        crowdAversionWeight: 0.5,
      },

      lifecycle: {
        maxEnergy: 80,
        energyGainRate: 1.0, // Moderate energy gain
        energyLossRate: 0,
        maxAge: 350,
        fearFactor: 0.2,
      },

      reproduction: {
        type: "sexual",
        offspringCount: 2, // Twins
        offspringEnergyBonus: 0.2,
      },

      limits: {
        maxPopulation: 600,
      },

      affinities: {
        social: 1.0,
        graceful: 0.85,
        wanderer: 0.65,
        hermit: 0.2,
      },
    },

    // Wanderers - Fast explorers, medium groups
    wanderer: {
      id: "wanderer",
      name: "Wanderer",
      role: "prey",

      visual: {
        color: "#ffdd00", // Golden yellow - adventurous
        shape: "diamond",
        size: 0.9,
        trail: true,
        trailColor: "#ffffff",
        bodyParts: ["eyes", "tail"],
        tailColor: "#ffffff",
      },

      movement: {
        separationWeight: 1.3,
        alignmentWeight: 1.2,
        cohesionWeight: 1.5,
        maxSpeed: 4.5, // Fast explorers
        maxForce: 0.12,
        trailLength: 10,
        crowdAversionThreshold: 30,
        crowdAversionWeight: 1.3,
      },

      lifecycle: {
        maxEnergy: 90,
        energyGainRate: 1.2, // Good foragers
        energyLossRate: 0,
        maxAge: 300,
        fearFactor: 0.3,
      },

      reproduction: {
        type: "sexual",
        offspringCount: 2,
        offspringEnergyBonus: 0.1,
      },

      limits: {
        maxPopulation: 500,
      },

      affinities: {
        wanderer: 1.0,
        social: 0.65,
        graceful: 0.6,
        hermit: 0.4,
      },
    },

    // Hermits - Solitary, asexual, independent
    hermit: {
      id: "hermit",
      name: "Hermit",
      role: "prey",

      visual: {
        color: "#9966ff", // Purple - mysterious
        shape: "square",
        size: 1.0,
        trail: false, // No trail (solitary)
        bodyParts: ["eyes"],
      },

      movement: {
        separationWeight: 2.5, // Strong separation (solitary)
        alignmentWeight: 0.3,
        cohesionWeight: 0.3,
        maxSpeed: 4.0,
        maxForce: 0.15,
        trailLength: 5,
        crowdAversionThreshold: 5, // Very low tolerance
        crowdAversionWeight: 2.5,
      },

      lifecycle: {
        maxEnergy: 70,
        energyGainRate: 1.5, // Efficient solo forager
        energyLossRate: 0,
        maxAge: 250,
        fearFactor: 0.4,
      },

      reproduction: {
        type: "asexual", // Solo reproduction
        offspringCount: 1,
        offspringEnergyBonus: 0,
        cooldownTicks: 12, // Longer cooldown to balance asexual advantage
      },

      limits: {
        maxPopulation: 400,
      },

      affinities: {
        hermit: 0.7, // Even hermits tolerate their own kind somewhat
        wanderer: 0.4,
        graceful: 0.3,
        social: 0.2,
      },
    },
  },
};
