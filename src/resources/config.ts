import { defineResource } from "braided";
import type { BoidConfig } from "../boids/types";

// Calculate canvas dimensions based on viewport
function calculateCanvasDimensions() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const availableWidth = viewportWidth * 0.75;
  const availableHeight = viewportHeight - 100;

  const canvasWidth = Math.floor(Math.min(availableWidth - 40, 1400));
  const canvasHeight = Math.floor(Math.min(availableHeight - 40, 1000));

  return { canvasWidth, canvasHeight };
}

export const config = defineResource({
  start: (): BoidConfig => {
    // Calculate initial canvas dimensions from viewport
    const { canvasWidth, canvasHeight } = calculateCanvasDimensions();

    return {
      count: 300,
      perceptionRadius: 50,
      obstacleAvoidanceWeight: 2.0,
      canvasWidth, // Use calculated dimensions
      canvasHeight, // Use calculated dimensions
      fearRadius: 150, // Phase 1.5: Increased from 100 - earlier warning system
      chaseRadius: 150,
      catchRadius: 10,
      mateRadius: 20, // Phase 1: Proximity-based reproduction - must be within 30px
      minDistance: 10, // Minimum distance between boids (prevents overlap/stacking)
      maxBoids: 600, // Global safety limit
      maxPreyBoids: 500, // Per-role cap for prey
      maxPredatorBoids: 50, // Per-role cap for predators
      minReproductionAge: 5, // Phase 2: Can start reproducing at 5 seconds old
      reproductionEnergyThreshold: 0.5, // Phase 2: Need 50% energy to seek mates (REDUCED from 0.7 for food system)
      reproductionCooldownTicks: 5, // Phase 2: 5 time passages (~5 seconds) cooldown
      matingBuildupTicks: 2, // Must stay close to mate for 3 ticks before reproducing
      eatingCooldownTicks: 2, // Predators must wait 3 ticks after eating before catching again
      types: {
        explorer: {
          id: "explorer",
          name: "Explorer",
          color: "#00ff88", // Green (original)
          role: "prey" as const,
          separationWeight: 1.5,
          alignmentWeight: 1.0,
          cohesionWeight: 1.8,
          maxSpeed: 4.4, // +10% speed (endurance specialist)
          maxForce: 0.1,
          fearFactor: 0.5, // Balanced fear response
          maxEnergy: 84, // +40% energy (140 * 0.6 scaled to food system)
          energyGainRate: 1.2, // Phase 1: Reduced from 1.0 - reproduce in ~100 seconds
          energyLossRate: 0, // No passive loss (only lose energy when fleeing)
          maxAge: 90, // Longer lifespan for multiple reproduction cycles
          trailLength: 15, // Medium trail length
          reproductionType: "sexual" as const,
          offspringCount: 2, // Twins! (compensate for rarity when finding mates)
          offspringEnergyBonus: 0, // Standard offspring
          maxPopulation: 150, // Cap at 150 explorers (30% of prey cap)
        },
        social: {
          id: "social",
          name: "Social",
          color: "#ff4488", // Pink
          role: "prey" as const,
          separationWeight: 0.5,
          alignmentWeight: 2.4,
          cohesionWeight: 2.5,
          maxSpeed: 4.0, // Baseline speed (was 3, normalized to 4)
          maxForce: 0.08,
          fearFactor: 0.3, // Low fear, stays in group
          maxEnergy: 60, // Baseline energy (100 * 0.6 scaled to food system)
          energyGainRate: 1.3, // Phase 1: Reduced from 0.8 - reproduce in ~120 seconds
          energyLossRate: 0, // No passive loss (only lose energy when fleeing)
          maxAge: 110, // Longer lifespan for multiple reproduction cycles
          trailLength: 12, // Shorter trail (slower movement)
          reproductionType: "sexual" as const,
          offspringCount: 1, // Standard single offspring
          offspringEnergyBonus: 0, // Standard offspring
          maxPopulation: 150, // Cap at 150 socials (30% of prey cap)
        },
        independent: {
          id: "independent",
          name: "Independent",
          color: "#ffaa00", // Orange
          role: "prey" as const,
          separationWeight: 2.5,
          alignmentWeight: 0.5,
          cohesionWeight: 0.5,
          maxSpeed: 5.0, // +25% speed (fast solo hunters)
          maxForce: 0.15,
          fearFactor: 0.8, // High fear, scatters immediately
          maxEnergy: 72, // +20% energy (120 * 0.6 scaled to food system)
          energyGainRate: 1.5, // Phase 1: Reduced from 1.2 - reproduce in ~75 seconds (still fastest)
          energyLossRate: 0, // No passive loss (only lose energy when fleeing)
          maxAge: 90, // Longer lifespan for multiple reproduction cycles
          trailLength: 20, // Longer trail (fastest movement)
          reproductionType: "asexual" as const, // KEY: Solo reproduction!
          offspringCount: 1, // Single offspring
          offspringEnergyBonus: 0, // Standard offspring
          reproductionCooldownTicks: 15, // 3x longer cooldown (5 → 15) to balance asexual advantage
          maxPopulation: 150, // Cap at 150 independents (30% of prey cap) - CRITICAL for diversity!
        },
        cautious: {
          id: "cautious",
          name: "Cautious",
          color: "#00aaff", // Blue
          role: "prey" as const,
          separationWeight: 2.0,
          alignmentWeight: 1.5,
          cohesionWeight: 1.5,
          maxSpeed: 3.6, // -10% speed (slower, defensive)
          maxForce: 0.12,
          fearFactor: 0.6, // Medium-high fear, coordinated escape
          maxEnergy: 60, // -10% energy (90 * 0.6 scaled to food system)
          energyGainRate: 1.6, // Phase 1: Reduced from 0.9 - reproduce in ~109 seconds
          energyLossRate: 0, // No passive loss (only lose energy when fleeing)
          maxAge: 100, // Longest lifespan - cautious types live longer
          trailLength: 10, // Short trail (slowest movement)
          reproductionType: "sexual" as const,
          offspringCount: 2, // Single offspring
          offspringEnergyBonus: 0.3, // +30% energy (stronger offspring)
          fearRadius: 175, // +33% detection range (150 → 200)
          maxPopulation: 150, // Cap at 150 cautious (30% of prey cap)
        },
        predator: {
          id: "predator",
          name: "Predator",
          color: "#ff0000", // Bright red
          role: "predator" as const,
          separationWeight: 2.5, // Increased from 1.0 - spread out more
          alignmentWeight: 0.0, // Don't align with prey
          cohesionWeight: 0.0, // Don't flock with prey
          maxSpeed: 3.2, // Faster than socials, slower than independents
          maxForce: 0.2, // High turning ability
          fearFactor: 0, // Predators don't fear
          maxEnergy: 150, // Phase 1: Increased from 100 - need 6 catches to reproduce
          energyGainRate: 25, // Phase 1: Reduced from 35 - less energy per catch
          energyLossRate: 3.0, // Keep same - die in 75 seconds without food
          maxAge: 90, // Increased from 60 - more time to reproduce
          trailLength: 25, // Longest trail (hunting paths are interesting)
          reproductionType: "sexual" as const,
          offspringCount: 1, // Single offspring
          offspringEnergyBonus: 0, // Standard offspring
        },
      },
    } as BoidConfig;
  },
  halt: () => {
    // No cleanup needed for config
  },
});
