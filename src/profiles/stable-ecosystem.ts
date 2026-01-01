import type { SimulationProfile } from "../boids/vocabulary/schemas/prelude.ts";
import type { BodyPart } from "../boids/vocabulary/schemas/genetics.ts";
import { bodyPartKeywords } from "../boids/vocabulary/keywords.ts";

/**
 * Stable Ecosystem Profile - Fast Evolution Testbed
 *
 * UNIFIED GENOME-BASED ARCHITECTURE (Session 69)
 *
 * Optimized for rapid evolutionary experimentation:
 * - FAST GENERATION TURNOVER: Reduced lifespans and reproduction ages
 * - PERFORMANCE OPTIMIZED: Lower population caps for 60 FPS
 * - BALANCED DYNAMICS: Predator speed tuned for ecosystem stability
 * - RICH DATA: Reach Gen 20-30+ in 5-10 minutes
 *
 * Key Parameters (Session 68 tuning):
 * - Predator speed: 0.45 (45% of physics maxSpeed = 4.5)
 * - Reproduction age: 2 seconds (maturityRate = 0.0)
 * - Max age: 80-120 seconds (longevity = 0.0 to 0.1)
 * - Population caps: 300-400 per species
 * - World size: 2500x2500
 *
 * This profile is our TESTBED for evolution experiments.
 */

// Helper to create body parts with proper typing using keywords
const createBodyParts = (
  parts: Array<{
    type: string;
    position?: { x: number; y: number };
    rotation?: number;
    size?: number;
  }>
): BodyPart[] => {
  return parts.map((part, index) => {
    switch (part.type) {
      case bodyPartKeywords.eye:
        return {
          type: bodyPartKeywords.eye,
          size: part.size ?? 0.3,
          position: part.position || { x: index === 0 ? -0.25 : 0.25, y: -0.1 },
          rotation: part.rotation || 0,
          effects: { visionBonus: 0.1 },
        };
      case bodyPartKeywords.fin:
        return {
          type: bodyPartKeywords.fin,
          size: part.size ?? 0.7,
          // Position fins toward the sides of the body
          // Left fin: x = -0.4 (left side), rotation = -90 (pointing down-left)
          // Right fin: x = 0.4 (right side), rotation = 90 (pointing down-right)
          position: part.position || {
            x: index % 2 === 0 ? -1.2 : 1.2,
            y: 0.6,
          },
          rotation: part.rotation || (index % 2 === 0 ? -130 : 130),
          effects: { turnRateBonus: 0.05 },
        };
      case bodyPartKeywords.tail:
        return {
          type: bodyPartKeywords.tail,
          size: part.size ?? 0.7,
          position: part.position || { x: 0, y: 1.8 },
          rotation: part.rotation || -180,
          effects: { speedBonus: 0.05 },
        };
      case bodyPartKeywords.spike:
        return {
          type: bodyPartKeywords.spike,
          size: part.size ?? 0.7,
          // position: part.position || { x: 0, y: -0.3 },
          // rotation: part.rotation || 0,
          // effects: { damageBonus: 0.15, energyCost: 0.05 },
          position: part.position || {
            x: index % 2 === 0 ? -0.5 : 0.5,
            y: index % 2 === 0 ? 0.6 : -0.6,
          },
          rotation: part.rotation || (index % 2 === 0 ? -130 : 130),
          effects: { turnRateBonus: 0.05 },
        };
      case bodyPartKeywords.glow:
        return {
          type: bodyPartKeywords.glow,
          size: part.size ?? 0.7,
          position: part.position || { x: 0, y: 0 },
          rotation: part.rotation || 0,
          effects: { energyCost: 0.02 },
        };
      case bodyPartKeywords.antenna:
        return {
          type: bodyPartKeywords.antenna,
          size: part.size ?? 0.6,
          position: part.position || { x: 0, y: -0.7 },
          rotation: part.rotation || 0,
          effects: { visionBonus: 0.15 }, // Enhanced sensory awareness
        };
      case bodyPartKeywords.shell:
        return {
          type: bodyPartKeywords.shell,
          size: part.size ?? 1.2,
          position: part.position || { x: 0, y: 0 },
          rotation: part.rotation || 0,
          effects: { defenseBonus: 0.3, energyCost: 0.05 }, // Heavy armor, high cost
        };
      default:
        return {
          type: bodyPartKeywords.eye,
          size: part.size ?? 0.7,
          position: { x: 0, y: -0.4 },
          rotation: 0,
          effects: { visionBonus: 0.05 },
        };
    }
  });
};

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
    minDistance: 15, // Prevents overlap/stacking
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
    // ============================================
    // EXPLORER - Fast scout, high curiosity
    // ============================================
    explorer: {
      id: "explorer",
      name: "Explorer",
      role: "prey",

      // Genetics (evolvable traits)
      // Formulas: speed = 4.4/10 = 0.44, force = 0.1/0.5 = 0.20
      // sociability = (1.8 - 1.0) / 2.0 = 0.4
      // longevity = (100 - 100) / 200 = 0.0 (short lifespan)
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
          color: "#00ff88", // Green
          bodyParts: createBodyParts([
            { type: bodyPartKeywords.eye },
            { type: bodyPartKeywords.eye },
            { type: bodyPartKeywords.tail, size: 0.8 },
            {
              type: bodyPartKeywords.antenna,
              size: 0.7,
              rotation: -135,
              position: { x: -0.5, y: -0 },
            }, // Sensory explorer
            {
              type: bodyPartKeywords.antenna,
              size: 0.7,
              rotation: 135,
              position: { x: 0.5, y: -0 },
            }, // Sensory explorer
            
          ]),
        },
      },

      // Visual configuration (non-evolvable)
      visualConfig: {
        shape: "diamond", // Fast and agile
        trail: true,
        trailLength: 4,
        trailColor: "#ffffff",
        tailColor: "#ffffff",
      },

      // Mutation rates
      mutation: {
        traitRate: 0.05,
        traitMagnitude: 0.1,
        visualRate: 0.02,
        colorRate: 0.1,
      },

      reproduction: {
        type: "sexual",
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

    // ============================================
    // SOCIAL - Group-oriented, safety in numbers
    // ============================================
    social: {
      id: "social",
      name: "Social",
      role: "prey",

      // Formulas: speed = 4.0/10 = 0.40, force = 0.2/0.5 = 0.40
      // sociability = (2.5 - 1.0) / 2.0 = 0.75 (very social)
      // longevity = (120 - 100) / 200 = 0.1
      baseGenome: {
        traits: {
          speed: 0.4, // 40% of maxSpeed (4.0)
          force: 0.4, // 40% of maxForce (0.2)
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
          color: "#ff4488", // Pink
          bodyParts: createBodyParts([
            { type: bodyPartKeywords.eye },
            { type: bodyPartKeywords.eye },
            {
              type: bodyPartKeywords.fin,
              position: { x: -1.7, y: 0.8 },
              size: 1,
            },
            {
              type: bodyPartKeywords.fin,
              position: { x: 1.7, y: 0.8 },
              size: 1,
            },
            { type: bodyPartKeywords.tail, size: 0.7 },
            { type: bodyPartKeywords.glow, size: 1.0 }, // Group harmony indicator
          ]),
        },
      },

      visualConfig: {
        shape: "circle", // Smooth and social
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
        type: "sexual",
        offspringCount: 1,
        offspringEnergyBonus: 0,
      },

      limits: {
        maxPopulation: 400,
      },

      affinities: {
        social: 1.0,
        cautious: 0.75,
        explorer: 0.65,
        independent: 0.15,
        predator: -0.5,
      },
    },

    // ============================================
    // INDEPENDENT - Solitary, self-sufficient
    // ============================================
    independent: {
      id: "independent",
      name: "Independent",
      role: "prey",

      // Formulas: speed = 5.0/10 = 0.50, force = 0.15/0.5 = 0.30
      // sociability = (0.5 - 1.0) / 2.0 = -0.25 → clamp to 0.0 (very low)
      // longevity = (80 - 100) / 200 = -0.1 → clamp to 0.0
      baseGenome: {
        traits: {
          speed: 0.5, // 50% of maxSpeed (5.0) - fast solo
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
          color: "#ffaa00", // Orange
          bodyParts: createBodyParts([
            { type: bodyPartKeywords.eye },
            { type: bodyPartKeywords.eye },
            { type: bodyPartKeywords.shell, size: 1.3 }, // Heavy protective armor
            { type: bodyPartKeywords.tail, size: 0.6 },
          ]),
        },
      },

      visualConfig: {
        shape: "hexagon", // Sturdy and grounded
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
        type: "asexual", // Solo reproduction
        offspringCount: 1,
        offspringEnergyBonus: 0,
        cooldownTicks: 8, // Longer cooldown for asexual
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

    // ============================================
    // CAUTIOUS - Defensive, coordinated escape
    // ============================================
    cautious: {
      id: "cautious",
      name: "Cautious",
      role: "prey",

      // Formulas: speed = 3.9/10 = 0.39, force = 0.12/0.5 = 0.24
      // sociability = (2.0 - 1.0) / 2.0 = 0.5 (moderate)
      // longevity = (100 - 100) / 200 = 0.0
      baseGenome: {
        traits: {
          speed: 0.39, // 39% of maxSpeed (3.9) - slower, defensive
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
          color: "#00aaff", // Blue
          bodyParts: createBodyParts([
            { type: bodyPartKeywords.eye },
            { type: bodyPartKeywords.eye },
            { type: bodyPartKeywords.shell, size: 1.1 }, // Defensive shell base
            // Six spikes matching Canvas 2D pattern (3 top, 3 bottom)
            {
              type: bodyPartKeywords.spike,
              position: { x: -0.4, y: -0.5 },
              size: 0.6,
            }, // Top left
            {
              type: bodyPartKeywords.spike,
              position: { x: -0.2, y: -0.5 },
              size: 0.6,
            }, // Top center
            {
              type: bodyPartKeywords.spike,
              position: { x: 0, y: -0.5 },
              size: 0.6,
            }, // Top right
            {
              type: bodyPartKeywords.spike,
              position: { x: -0.4, y: 0.5 },
              size: 0.6,
            }, // Bottom left
            {
              type: bodyPartKeywords.spike,
              position: { x: -0.2, y: 0.5 },
              size: 0.6,
            }, // Bottom center
            {
              type: bodyPartKeywords.spike,
              position: { x: 0, y: 0.5 },
              size: 0.6,
            }, // Bottom right
          ]),
        },
      },

      visualConfig: {
        shape: "hexagon",
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
        type: "sexual",
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

    // ============================================
    // PREDATOR - Hunter, apex species
    // ============================================
    predator: {
      id: "predator",
      name: "Predator",
      role: "predator",

      // Formulas: speed = 4.5/10 = 0.45 (CRITICAL for balance)
      // force = 0.2/0.5 = 0.40
      // sociability = (0.0 - 1.0) / 2.0 = -0.5 → clamp to 0.0 (solitary hunter)
      // longevity = (100 - 100) / 200 = 0.0
      baseGenome: {
        traits: {
          speed: 0.4, // 40% of maxSpeed (4) - CRITICAL for catch rate
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
          color: "#ff0000", // Bright red
          bodyParts: createBodyParts([
            { type: bodyPartKeywords.eye, size: 0.4 },
            { type: bodyPartKeywords.eye, size: 0.4 },
            { type: bodyPartKeywords.fin, size: 0.8 },
            { type: bodyPartKeywords.fin, size: 0.8 },
            { type: bodyPartKeywords.tail, size: 0.9 },
            { type: bodyPartKeywords.glow, size: 1.5 }, // Intimidating aura
            {
              type: bodyPartKeywords.spike,
              position: { x: 0, y: -0.6 },
              size: 0.7,
            }, // Front spike
            {
              type: bodyPartKeywords.spike,
              position: { x: -0.4, y: -0.3 },
              size: 0.6,
            }, // Left spike
            {
              type: bodyPartKeywords.spike,
              position: { x: 0.4, y: -0.3 },
              size: 0.6,
            }, // Right spike
          ]),
        },
      },

      visualConfig: {
        shape: "diamond", // Fast and aggressive
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
        type: "sexual",
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
};
