import { SimulationProfile } from "../boids/vocabulary/schemas/prelude.ts";

/**
 * Predator Paradise Profile
 *
 * A survival challenge featuring:
 * - High predator count (50 predators vs 100 prey)
 * - Asexual predator reproduction (solitary hunters don't need mates)
 * - Fast-paced, intense predator-prey dynamics
 * - Prey must use superior speed and coordination to survive
 *
 * This profile demonstrates:
 * - Emergent survival strategies under pressure
 * - Asexual reproduction balancing high predation
 * - Natural selection favoring fast, evasive prey
 */
export const predatorParadiseProfile: SimulationProfile = {
  id: "predator-paradise",
  seed: "predator-paradise-survival-42",
  name: "Predator Paradise",
  description:
    "Survival challenge: 50 asexual predators hunt 100 prey in intense dynamics",

  world: {
    width: 2000,
    height: 2000,
    backgroundColor: "#450a0a", // Dark blood red - danger atmosphere
    initialPreyCount: 100, // Fewer prey, high pressure
    initialPredatorCount: 50, // High predator count (50% of prey!)
  },

  parameters: {
    // Perception and interaction
    perceptionRadius: 60, // Slightly increased for predators
    obstacleAvoidanceWeight: 2.0,
    fearRadius: 180, // Increased fear radius (prey must flee early!)
    chaseRadius: 180, // Predators sense prey from further
    catchRadius: 12, // Slightly easier to catch
    mateRadius: 20,
    minDistance: 10,
    fearFactor: 0.7, // Higher baseline fear (dangerous world)

    // Population limits
    maxBoids: 1000,
    maxPreyBoids: 600, // Prey can expand if they survive
    maxPredatorBoids: 300, // Predators can dominate

    // Lifecycle parameters
    minReproductionAge: 5,
    reproductionEnergyThreshold: 0.5,
    reproductionCooldownTicks: 5,
    matingBuildupTicks: 2,
    eatingCooldownTicks: 2,
    attackCooldownTicks: 2, // Fast attack rate for predator paradise
  },

  species: {
    // Fast, evasive prey - survival specialists
    swift: {
      id: "swift",
      name: "Swift",
      role: "prey",

      visual: {
        color: "#00ffff", // Cyan - fast and agile
        shape: "diamond",
        size: 0.85, // Smaller, harder to catch
        trail: true,
        trailColor: "#ffffff",
        bodyParts: ["eyes", "tail"],
        tailColor: "#ffffff",
      },

      movement: {
        separationWeight: 1.8,
        alignmentWeight: 1.2,
        cohesionWeight: 2.0, // Tight flocking for safety
        maxSpeed: 5.2, // +30% speed (faster than predators!)
        maxForce: 0.15, // High agility
        trailLength: 10,
        crowdAversionThreshold: 25,
        crowdAversionWeight: 1.5,
      },

      lifecycle: {
        maxEnergy: 70,
        energyGainRate: 1.5, // Fast reproduction to counter predation
        energyLossRate: 0,
        maxAge: 200, // Shorter lifespan (dangerous world)
        fearFactor: 0.8, // Very afraid
      },

      reproduction: {
        type: "sexual",
        offspringCount: 3, // Triplets! Compensate for high mortality
        offspringEnergyBonus: 0.2, // +20% energy (strong offspring)
      },

      limits: {
        maxPopulation: 600,
        fearRadius: 200, // Exceptional awareness
      },

      affinities: {
        swift: 1.0,
        coordinated: 0.8, // High affinity (safety in numbers)
        predator: -0.5,
      },
    },

    // Coordinated prey - group survival
    coordinated: {
      id: "coordinated",
      name: "Coordinated",
      role: "prey",

      visual: {
        color: "#ffaa00", // Orange - visible group
        shape: "hexagon",
        size: 0.95,
        trail: true,
        bodyParts: ["eyes", "spikes"],
      },

      movement: {
        separationWeight: 1.2,
        alignmentWeight: 2.5, // Ultra-high alignment (tight groups)
        cohesionWeight: 2.8, // Ultra-high cohesion (never separate)
        maxSpeed: 4.5, // Moderate speed
        maxForce: 0.12,
        trailLength: 8,
        crowdAversionThreshold: 60, // Very high tolerance (prefer crowds)
        crowdAversionWeight: 0.5, // Weak avoidance
      },

      lifecycle: {
        maxEnergy: 80,
        energyGainRate: 1.4,
        energyLossRate: 0,
        maxAge: 250,
        fearFactor: 0.6, // Medium fear (rely on group)
      },

      reproduction: {
        type: "sexual",
        offspringCount: 2, // Twins
        offspringEnergyBonus: 0.3,
      },

      limits: {
        maxPopulation: 600,
        fearRadius: 180,
      },

      affinities: {
        coordinated: 1.0,
        swift: 0.8, // High affinity
        predator: -0.5,
      },
    },

    // Asexual predators - solitary hunters
    predator: {
      id: "predator",
      name: "Predator",
      role: "predator",

      visual: {
        color: "#ff0000", // Bright red - danger!
        shape: "diamond",
        size: 1.4, // Large and menacing
        trail: true,
        bodyParts: ["eyes", "fins", "tail", "glow"],
      },

      movement: {
        separationWeight: 2.8, // Spread out (territorial)
        alignmentWeight: 0.0,
        cohesionWeight: 0.0,
        maxSpeed: 4.8, // Fast, but prey can outrun if they react early
        maxForce: 0.22, // High turning ability
        trailLength: 15,
        crowdAversionThreshold: 12,
        crowdAversionWeight: 2.0,
      },

      lifecycle: {
        maxEnergy: 120, // Need 4-5 catches to reproduce
        energyGainRate: 30, // Energy per catch
        energyLossRate: 0.8, // Die in ~150 seconds without food
        maxAge: 350,
        fearFactor: 0, // Fearless
      },

      reproduction: {
        type: "asexual", // KEY: No mate needed! Solitary reproduction
        offspringCount: 1,
        offspringEnergyBonus: 0,
        cooldownTicks: 8, // 8 ticks cooldown (slower than prey sexual reproduction)
      },

      limits: {
        maxPopulation: 300,
      },

      affinities: {
        predator: 0.5, // Low affinity (solitary, territorial)
      },
    },
  },
};
