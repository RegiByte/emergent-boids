import { z } from "zod";
import {
  roleSchema,
  reproductionTypeSchema,
} from "@/boids/vocabulary/schemas/prelude.ts";

// ============================================
// Evolution Snapshot Schema
// ============================================

/**
 * Evolution Snapshot - Comprehensive time-series data for AI training
 *
 * Philosophy: Store raw state data, not derived metrics.
 * The AI should learn what percentages mean, not consume pre-computed ones.
 *
 * This schema captures:
 * - Population dynamics (counts, not percentages)
 * - Behavioral distribution (stance counts per species)
 * - Death analysis (causes, not just totals)
 * - Environmental state (food, obstacles, danger zones)
 * - Spatial patterns (clustering, dispersion)
 * - Configuration snapshot (what parameters were active)
 *
 * Design for ML training:
 * - Input features (X): populations, energy, stances, environment, config
 * - Output labels (Y): births/deaths, stability, events
 * - Enables: stability prediction, parameter optimization, trait evolution
 */
export const evolutionSnapshotSchema = z.object({
  // ============================================
  // Temporal Context
  // ============================================
  tick: z.number(), // Simulation tick number
  timestamp: z.number(), // Real-world timestamp (ms since epoch)
  deltaSeconds: z.number(), // Time elapsed since last snapshot (for rate calculations)

  // ============================================
  // Population Dynamics (per species)
  // ============================================
  populations: z.record(z.string(), z.number()), // Current count per species
  births: z.record(z.string(), z.number()), // Births since last snapshot
  deaths: z.record(z.string(), z.number()), // Deaths since last snapshot

  // Death breakdown by cause (per species)
  deathsByCause: z.record(
    z.string(), // species ID
    z.object({
      old_age: z.number(),
      starvation: z.number(),
      predation: z.number(),
    })
  ),

  // ============================================
  // Energy Dynamics (per species)
  // ============================================
  energy: z.record(
    z.string(), // species ID
    z.object({
      total: z.number(), // Sum of all energy in this species
      mean: z.number(), // Average energy per boid
      min: z.number(), // Lowest energy boid
      max: z.number(), // Highest energy boid
      stdDev: z.number(), // Energy distribution spread
    })
  ),

  // ============================================
  // Behavioral Distribution (per species)
  // ============================================
  stances: z.record(
    z.string(), // species ID
    z.object({
      flocking: z.number().optional(),
      fleeing: z.number().optional(),
      hunting: z.number().optional(),
      seeking_mate: z.number().optional(),
      mating: z.number().optional(),
      idle: z.number().optional(),
      eating: z.number().optional(),
    })
  ),

  // ============================================
  // Age Distribution (per species)
  // ============================================
  age: z.record(
    z.string(), // species ID
    z.object({
      mean: z.number(),
      min: z.number(),
      max: z.number(),
      youngCount: z.number(), // Age < minReproductionAge
      matureCount: z.number(), // Age >= minReproductionAge
      elderCount: z.number(), // Age > 75% of maxAge
    })
  ),

  // ============================================
  // Environmental State
  // ============================================
  environment: z.object({
    foodSources: z.object({
      prey: z.object({
        count: z.number(),
        totalEnergy: z.number(),
        meanEnergy: z.number(),
      }),
      predator: z.object({
        count: z.number(),
        totalEnergy: z.number(),
        meanEnergy: z.number(),
      }),
    }),
    deathMarkers: z.object({
      count: z.number(),
      totalStrength: z.number(), // Sum of all marker strengths
      meanStrength: z.number(),
    }),
    obstacles: z.object({
      count: z.number(),
    }),
  }),

  // ============================================
  // Spatial Patterns (emergent properties)
  // ============================================
  spatial: z.record(
    z.string(), // species ID
    z.object({
      // Clustering metrics
      meanNearestNeighborDistance: z.number(), // How tightly clustered
      clusterCount: z.number(), // Number of distinct groups
      largestClusterSize: z.number(), // Supercluster detection

      // Dispersion metrics
      centerOfMass: z.object({ x: z.number(), y: z.number() }), // Population center
      spreadRadius: z.number(), // How far population spreads from center

      // Territory metrics (predators)
      territoryOverlap: z.number().optional(), // % of space shared with other predators
    })
  ),

  // ============================================
  // Predator-Prey Dynamics
  // ============================================
  interactions: z.object({
    catches: z.record(z.string(), z.number()), // Catches by predator species
    escapes: z.record(z.string(), z.number()), // Successful fleeing events by prey species
    averageChaseDistance: z.number(), // Mean distance covered during hunts
    averageFleeDistance: z.number(), // Mean distance covered during fleeing
  }),

  // ============================================
  // Reproduction Dynamics
  // ============================================
  reproduction: z.record(
    z.string(), // species ID
    z.object({
      seekingMateCount: z.number(), // How many actively seeking
      matingCount: z.number(), // How many currently paired
      reproductionReadyCount: z.number(), // Mature + enough energy + no cooldown
      avgReproductionCooldown: z.number(), // Mean cooldown remaining
    })
  ),

  // ============================================
  // Configuration Snapshot (what parameters were active)
  // ============================================
  // This allows the AI to learn: "When fearRadius=150 and population=300, X happens"
  activeParameters: z.object({
    // Global parameters
    perceptionRadius: z.number(),
    fearRadius: z.number(),
    chaseRadius: z.number(),
    reproductionEnergyThreshold: z.number(),

    // Per-species parameters (only store what varies)
    speciesConfigs: z.record(
      z.string(), // species ID
      z.object({
        role: roleSchema,
        maxSpeed: z.number(),
        maxForce: z.number(),
        maxEnergy: z.number(),
        energyLossRate: z.number(),
        fearFactor: z.number(),
        reproductionType: reproductionTypeSchema,
        offspringCount: z.number(),
      })
    ),
  }),

  // ============================================
  // Genetics & Evolution Tracking
  // ============================================
  // Tracks genome-level changes and trait drift over generations
  genetics: z.record(
    z.string(), // species ID
    z.object({
      // Generation distribution
      generationDistribution: z.record(z.string(), z.number()), // {"0": 10, "1": 45, "2": 23, ...}
      maxGeneration: z.number(),
      avgGeneration: z.number(),

      // Trait statistics (raw values, 0-1 range for most traits)
      traits: z.object({
        speed: z.object({
          mean: z.number(),
          min: z.number(),
          max: z.number(),
          stdDev: z.number(),
        }),
        size: z.object({
          mean: z.number(),
          min: z.number(),
          max: z.number(),
          stdDev: z.number(),
        }),
        vision: z.object({
          mean: z.number(),
          min: z.number(),
          max: z.number(),
          stdDev: z.number(),
        }),
        force: z.object({
          mean: z.number(),
          min: z.number(),
          max: z.number(),
          stdDev: z.number(),
        }),
        aggression: z.object({
          mean: z.number(),
          min: z.number(),
          max: z.number(),
          stdDev: z.number(),
        }),
        sociability: z.object({
          mean: z.number(),
          min: z.number(),
          max: z.number(),
          stdDev: z.number(),
        }),
        efficiency: z.object({
          mean: z.number(),
          min: z.number(),
          max: z.number(),
          stdDev: z.number(),
        }),
      }),

      // Color diversity metrics
      colorDiversity: z.number(), // Average LAB distance from species base color
      uniqueColors: z.number(), // Count of distinct colors (quantized to reduce noise)

      // Body parts statistics
      bodyPartStats: z.object({
        avgPartsPerBoid: z.number(),
        minParts: z.number(),
        maxParts: z.number(),
        partTypeCounts: z.record(z.string(), z.number()), // {"eyes": 45, "fins": 23, ...}
      }),

      // Mutation tracking (since last snapshot)
      mutationsSinceLastSnapshot: z.object({
        traitMutations: z.number(), // Count of trait mutations
        colorMutations: z.number(), // Count of color mutations
        bodyPartMutations: z.number(), // Count of body part changes
        totalOffspring: z.number(), // Total offspring created
      }),
    })
  ),

  // ============================================
  // Atmosphere/Events (emergent drama detection)
  // ============================================
  atmosphere: z.object({
    activeEvent: z.string().nullable(), // "mass_extinction", "mating_season", etc.
    eventStartedAtTick: z.number().nullable(),
    eventDurationTicks: z.number().nullable(),
  }),
});

export type EvolutionSnapshot = z.infer<typeof evolutionSnapshotSchema>;
