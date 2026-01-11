import type { BodyPart } from '../boids/vocabulary/schemas/visual'
import type { SimulationProfile } from '../boids/vocabulary/schemas/world'
import {
  bodyPartKeywords,
  shapeKeywords,
} from '../boids/vocabulary/keywords.ts'

/**
 * Stable Ecosystem Profile - Fast Evolution Testbed
 *
 * UNIFIED GENOME-BASED ARCHITECTURE
 *
 * Optimized for rapid evolutionary experimentation:
 * - FAST GENERATION TURNOVER: Reduced lifespans and reproduction ages
 * - PERFORMANCE OPTIMIZED: Lower population caps for 60 FPS
 * - BALANCED DYNAMICS: Predator speed tuned for ecosystem stability
 * - RICH DATA: Reach Gen 20-30+ in 5-10 minutes
 *
 * Key Parameters:
 * - Predator speed: 0.45 (45% of physics maxSpeed = 4.5)
 * - Reproduction age: 2 seconds (maturityRate = 0.0)
 * - Max age: 80-120 seconds (longevity = 0.0 to 0.1)
 * - Population caps: 300-400 per species
 * - World size: 2500x2500
 *
 * This profile is our TESTBED for evolution experiments.
 */

type PartialBodyPart = Partial<Omit<BodyPart, 'type'>>

/**
 * Create an eye with optional overrides
 * Default: Small size, positioned for side-by-side pairs
 */
export const createEye = (overrides?: PartialBodyPart): BodyPart => ({
  type: bodyPartKeywords.eye,
  size: 0.3,
  position: { x: 0, y: -0.1 },
  rotation: 0,
  effects: { visionBonus: 0.1 },
  ...overrides,
})

/**
 * Create a pair of eyes (left and right)
 * Returns array of two eyes positioned symmetrically
 */
export const createEyePair = (overrides?: {
  size?: number
  y?: number
  spacing?: number
}): BodyPart[] => {
  const size = overrides?.size ?? 0.3
  const y = overrides?.y ?? -0.1
  const spacing = overrides?.spacing ?? 0.25

  return [
    createEye({ size, position: { x: -spacing, y } }),
    createEye({ size, position: { x: spacing, y } }),
  ]
}

/**
 * Create a fin with optional overrides
 * Default: Medium size, positioned on sides
 */
export const createFin = (overrides?: PartialBodyPart): BodyPart => ({
  type: bodyPartKeywords.fin,
  size: 0.7,
  position: { x: -1.2, y: 0.6 },
  rotation: -130,
  effects: { turnRateBonus: 0.05 },
  ...overrides,
})

/**
 * Create a pair of fins (left and right)
 * Returns array of two fins positioned symmetrically
 */
export const createFinPair = (overrides?: {
  size?: number
  y?: number
  x?: number
}): BodyPart[] => {
  const size = overrides?.size ?? 0.7
  const y = overrides?.y ?? 0.6
  const x = overrides?.x ?? 1.2

  return [
    createFin({ size, position: { x: -x, y }, rotation: -130 }),
    createFin({ size, position: { x, y }, rotation: 130 }),
  ]
}

/**
 * Create a tail with optional overrides
 * Default: Points backward (180°)
 */
export const createTail = (overrides?: PartialBodyPart): BodyPart => ({
  type: bodyPartKeywords.tail,
  size: 0.7,
  position: { x: 0, y: 1.8 },
  rotation: -180,
  effects: { speedBonus: 0.05 },
  ...overrides,
})

/**
 * Create a spike with optional overrides
 * Default: Medium size, points forward
 */
export const createSpike = (overrides?: PartialBodyPart): BodyPart => ({
  type: bodyPartKeywords.spike,
  size: 0.7,
  position: { x: 0, y: -0.3 },
  rotation: 0,
  effects: { damageBonus: 0.15, energyCost: 0.05 },
  ...overrides,
})

/**
 * Create a spike pair (left and right)
 * Returns array of two spikes positioned symmetrically
 */
export const createSpikePair = (overrides?: {
  size?: number
  y?: number
  x?: number
}): BodyPart[] => {
  const size = overrides?.size ?? 0.7
  const y = overrides?.y ?? 0.6
  const x = overrides?.x ?? 0.5

  return [
    createSpike({ size, position: { x: -x, y }, rotation: -130 }),
    createSpike({ size, position: { x, y }, rotation: 130 }),
  ]
}

/**
 * Create a glow effect with optional overrides
 * Default: Centered on boid
 */
export const createGlow = (overrides?: PartialBodyPart): BodyPart => ({
  type: bodyPartKeywords.glow,
  size: 0.7,
  position: { x: 0, y: 0 },
  rotation: 0,
  effects: { energyCost: 0.02 },
  ...overrides,
})

/**
 * Create an antenna with optional overrides
 * Default: Points upward from head
 */
export const createAntenna = (overrides?: PartialBodyPart): BodyPart => ({
  type: bodyPartKeywords.antenna,
  size: 0.6,
  position: { x: 0, y: -0.7 },
  rotation: 0,
  effects: { visionBonus: 0.15 },
  ...overrides,
})

/**
 * Create a shell with optional overrides
 * Default: Large, centered, heavy armor
 */
export const createShell = (overrides?: PartialBodyPart): BodyPart => ({
  type: bodyPartKeywords.shell,
  size: 1.2,
  position: { x: 0, y: 0 },
  rotation: 0,
  effects: { defenseBonus: 0.3, energyCost: 0.05 },
  ...overrides,
})

export const stableEcosystemProfile: SimulationProfile = {
  id: 'stable-ecosystem',
  seed: 'stable-ecosystem-42',
  name: 'Stable Ecosystem',
  description: 'Balanced multi-species coexistence with predator-prey dynamics',

  world: {
    width: 3000,
    height: 3000,
    backgroundColor: '#0369a1', // Deep space blue-black
    initialPreyCount: 100, // Start small for performance
    initialPredatorCount: 13, // Balanced ratio (~1:5)
  },

  parameters: {
    perceptionRadius: 50,
    obstacleAvoidanceWeight: 2.0,
    fearRadius: 150, // Increased from 100 - earlier warning system
    chaseRadius: 150,
    catchRadius: 10,
    mateRadius: 20, // Proximity-based reproduction
    minDistance: 15, // Prevents overlap/stacking
    fearFactor: 0.5, // Baseline fear factor for all species

    maxBoids: 2000, // Global safety limit (60 FPS target)
    maxPreyBoids: 1800, // Per-role cap for prey
    maxPredatorBoids: 200, // Per-role cap for predators

    minReproductionAge: 2,
    reproductionEnergyThreshold: 0.4, // Need 40% energy to seek mates (was 0.5)
    reproductionCooldownFrames: 15,
    matingBuildupFrames: 7, // Must stay close to mate for 7 checked frames, accounting for staggered frames
    eatingCooldownFrames: 15,
    attackCooldownFrames: 60, // Predators must wait 3 seconds between attacks
  },

  species: {
    explorer: {
      id: 'explorer',
      name: 'Explorer',
      role: 'prey',

      baseGenome: {
        traits: {
          speed: 0.44, // 44% of maxSpeed (4.4)
          force: 0.2, // 20% of maxForce (0.1)
          vision: 0.5, // 50% of maxVision
          size: 0.9, // Slightly smaller
          aggression: 0.3, // Prey default
          sociability: 0.4, // Medium-high (from cohesion 1.8)
          efficiency: 0.5, // Default
          fearResponse: 0.5, // Balanced fear
          maturityRate: 0.0, // Fast maturity (2 seconds)
          longevity: 0.0, // Short lifespan (100 seconds)
        },
        visual: {
          color: '#00ff88', // Green
          bodyParts: [
            createTail({ size: 0.8 }),
            createAntenna({
              size: 0.7,
              rotation: -135,
              position: { x: -0.5, y: 0 },
            }),
            createAntenna({
              size: 0.7,
              rotation: 135,
              position: { x: 0.5, y: 0 },
            }),
            ...createEyePair(),
          ],
        },
      },

      visualConfig: {
        shape: 'diamond', // Fast and agile
        trail: true,
        trailLength: 4,
        trailColor: '#ffffff',
        tailColor: '#ffffff',
      },

      mutation: {
        traitRate: 0.05,
        traitMagnitude: 0.1,
        visualRate: 0.02,
        colorRate: 0.1,
      },

      reproduction: {
        type: 'sexual',
        offspringCount: 2, // Twins
        offspringEnergyBonus: 0,
      },

      limits: {
        maxPopulation: 400,
      },

      affinities: {
        explorer: 1.0,
        social: 0.65,
        cautious: 0.55,
        independent: 0.2,
        predator: -0.5,
      },
    },

    social: {
      id: 'social',
      name: 'Social',
      role: 'prey',

      baseGenome: {
        traits: {
          speed: 0.4, // 40% of maxSpeed (4.0)
          force: 0.41, // 40% of maxForce (0.2)
          vision: 0.5,
          size: 0.5, // Average
          aggression: 0.3,
          sociability: 0.75, // Very social (from cohesion 2.5)
          efficiency: 0.5,
          fearResponse: 0.3, // Low fear, stays in group
          maturityRate: 0.0,
          longevity: 0.1, // Slightly longer (120 seconds)
        },
        visual: {
          color: '#ff4488', // Pink
          bodyParts: [
            createGlow({ size: 1.0 }), // Group harmony indicator
            createTail({ size: 0.7, position: { x: 0, y: 4 } }),
            ...createFinPair({ size: 1.2, x: 1.6, y: 1 }),
            ...createEyePair(),
          ],
        },
      },

      visualConfig: {
        shape: 'circle', // Smooth and social
        trail: true,
        trailLength: 3,
      },

      mutation: {
        traitRate: 0.05,
        traitMagnitude: 0.1,
        visualRate: 0.02,
        colorRate: 0.1,
      },

      reproduction: {
        type: 'sexual',
        offspringCount: 1,
        offspringEnergyBonus: 0,
        cooldownFrames: 10,
      },

      limits: {
        maxPopulation: 800,
      },

      affinities: {
        social: 1.0,
        cautious: 0.75,
        explorer: 0.65,
        independent: 0.15,
        predator: -0.5,
      },
    },

    independent: {
      id: 'independent',
      name: 'Independent',
      role: 'prey',

      baseGenome: {
        traits: {
          speed: 0.42, // 50% of maxSpeed (5.0) - fast solo
          force: 0.3, // 30% of maxForce (0.15)
          vision: 0.5,
          size: 1.1, // Slightly larger
          aggression: 0.3,
          sociability: 0.0, // Very low (solitary)
          efficiency: 0.5,
          fearResponse: 0.8, // High fear, scatters immediately
          maturityRate: 0.0,
          longevity: 0.0, // Short lifespan (80 seconds)
        },
        visual: {
          color: '#ffaa00', // Orange
          bodyParts: [
            createTail({
              size: 0.8,
              rotation: 360,
              position: { x: 0, y: 5 },
            }),
            createShell({ size: 1.3 }), // Heavy protective armor
            createEye({ size: 0.7, position: { x: 0, y: -0.35 } }),
          ],
        },
      },

      visualConfig: {
        shape: shapeKeywords.pentagon_inverted, // Sturdy and grounded
        trail: false, // Ground animals don't leave trails
        trailLength: 5,
      },

      mutation: {
        traitRate: 0.05,
        traitMagnitude: 0.1,
        visualRate: 0.02,
        colorRate: 0.1,
      },

      reproduction: {
        type: 'asexual', // Solo reproduction
        offspringCount: 1,
        offspringEnergyBonus: 0,
        cooldownFrames: 2000,
      },

      limits: {
        maxPopulation: 300,
      },

      affinities: {
        independent: 0.6,
        explorer: 0.52,
        social: 0.15,
        cautious: 0.25,
        predator: -0.5,
      },
    },

    cautious: {
      id: 'cautious',
      name: 'Cautious',
      role: 'prey',

      baseGenome: {
        traits: {
          speed: 0.4, // 39% of maxSpeed (3.9) - slower, defensive
          force: 0.24, // 24% of maxForce (0.12)
          vision: 0.5,
          size: 0.95, // Slightly smaller, defensive
          aggression: 0.3,
          sociability: 0.5, // Moderate (safety in numbers)
          efficiency: 0.5,
          fearResponse: 0.6, // Medium-high fear, coordinated escape
          maturityRate: 0.0,
          longevity: 0.0, // Short lifespan (100 seconds)
        },
        visual: {
          color: '#00aaff', // Blue
          bodyParts: [
            createShell({ size: 1.5, position: { x: 0, y: 0.5 } }), // Defensive shell base (layer 1)
            ...createEyePair(), // Eyes on top of shell (layer 2 & 3)
          ],
        },
      },

      visualConfig: {
        shape: shapeKeywords.oval,
        trail: false,
        trailLength: 2,
      },

      mutation: {
        traitRate: 0.05,
        traitMagnitude: 0.1,
        visualRate: 0.02,
        colorRate: 0.1,
      },

      reproduction: {
        type: 'sexual',
        offspringCount: 2, // Twins
        offspringEnergyBonus: 0.3, // +30% energy (stronger offspring)
      },

      limits: {
        maxPopulation: 400,
        fearRadius: 175, // +33% detection range
      },

      affinities: {
        cautious: 1.0,
        social: 0.75,
        explorer: 0.55,
        independent: 0.25,
        predator: -0.5,
      },
    },

    predator: {
      id: 'predator',
      name: 'Predator',
      role: 'predator',

      baseGenome: {
        traits: {
          speed: 0.48, // 40% of maxSpeed (4) - CRITICAL for catch rate
          force: 0.4, // 40% of maxForce (0.2) - high turning
          vision: 0.5,
          size: 1.3, // Larger and menacing
          aggression: 0.8, // Predator high aggression
          sociability: 0.1, // Very low (solitary hunter)
          efficiency: 0.5,
          fearResponse: 0.0, // Fearless
          maturityRate: 0.0,
          longevity: 0.0, // Short lifespan (100 seconds)
        },
        visual: {
          color: '#ff0000', // Bright red
          bodyParts: [
            createTail({ size: 0.9 }),
            createGlow({ size: 1.5 }), // Intimidating aura
            ...createFinPair({ size: 0.8 }),
            createSpike({ position: { x: 0, y: -0.6 }, size: 0.7 }), // Front spike
            createSpike({
              position: { x: -0.4, y: -0.3 },
              size: 0.6,
            }), // Left spike
            createSpike({
              position: { x: 0.4, y: -0.3 },
              size: 0.6,
            }), // Right spike
            ...createEyePair({ size: 0.4 }),
          ],
        },
      },

      visualConfig: {
        shape: 'diamond', // Fast and aggressive
        trail: true,
        trailLength: 5,
      },

      mutation: {
        traitRate: 0.05,
        traitMagnitude: 0.1,
        visualRate: 0.02,
        colorRate: 0.1,
      },

      reproduction: {
        type: 'sexual',
        offspringCount: 1,
        offspringEnergyBonus: 0,
      },

      limits: {
        maxPopulation: 300,
      },

      affinities: {
        predator: 0.6, // Moderate affinity (tolerate but compete)
      },
    },
  },
}
