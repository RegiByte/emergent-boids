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
      count: 50,
      perceptionRadius: 50,
      obstacleAvoidanceWeight: 2.0,
      canvasWidth, // Use calculated dimensions
      canvasHeight, // Use calculated dimensions
      fearRadius: 150, // Phase 1.5: Increased from 100 - earlier warning system
      chaseRadius: 150,
      catchRadius: 10,
      mateRadius: 30, // Phase 1: Proximity-based reproduction - must be within 30px
      maxBoids: 600,
      minReproductionAge: 5, // Phase 2: Can start reproducing at 5 seconds old
      reproductionEnergyThreshold: 0.7, // Phase 2: Need 70% energy to seek mates
      reproductionCooldownTicks: 5, // Phase 2: 5 time passages (~5 seconds) cooldown
      types: {
        explorer: {
          id: "explorer",
          name: "Explorer",
          color: "#00ff88", // Green (original)
          role: "prey",
          separationWeight: 1.5,
          alignmentWeight: 1.0,
          cohesionWeight: 1.0,
          maxSpeed: 4,
          maxForce: 0.1,
          fearFactor: 0.5, // Balanced fear response
          maxEnergy: 60, // Phase 1.5: Reduced from 75 - faster reproduction
          energyGainRate: 1.2, // Phase 1: Reduced from 1.0 - reproduce in ~100 seconds
          energyLossRate: 0, // Prey don't lose energy
          maxAge: 50, // Die of old age after 30 seconds (~1 reproduction cycle)
        },
        social: {
          id: "social",
          name: "Social",
          color: "#ff4488", // Pink
          role: "prey",
          separationWeight: 0.5,
          alignmentWeight: 1.2,
          cohesionWeight: 2.5,
          maxSpeed: 3,
          maxForce: 0.08,
          fearFactor: 0.3, // Low fear, stays in group
          maxEnergy: 60, // Phase 1.5: Reduced from 75 - faster reproduction
          energyGainRate: 1.3, // Phase 1: Reduced from 0.8 - reproduce in ~120 seconds
          energyLossRate: 0,
          maxAge: 50, // Die of old age after 30 seconds (~1 reproduction cycle)
        },
        independent: {
          id: "independent",
          name: "Independent",
          color: "#ffaa00", // Orange
          role: "prey",
          separationWeight: 2.5,
          alignmentWeight: 0.5,
          cohesionWeight: 0.5,
          maxSpeed: 5,
          maxForce: 0.15,
          fearFactor: 0.8, // High fear, scatters immediately
          maxEnergy: 60, // Phase 1.5: Reduced from 75 - faster reproduction
          energyGainRate: 1.5, // Phase 1: Reduced from 1.2 - reproduce in ~75 seconds (still fastest)
          energyLossRate: 0,
          maxAge: 50, // Die of old age after 90 seconds (~1 reproduction cycle)
        },
        cautious: {
          id: "cautious",
          name: "Cautious",
          color: "#00aaff", // Blue
          role: "prey",
          separationWeight: 2.0,
          alignmentWeight: 1.5,
          cohesionWeight: 1.5,
          maxSpeed: 2.5,
          maxForce: 0.12,
          fearFactor: 0.6, // Medium-high fear, coordinated escape
          maxEnergy: 60, // Phase 1.5: Reduced from 75 - faster reproduction
          energyGainRate: 1.6, // Phase 1: Reduced from 0.9 - reproduce in ~109 seconds
          energyLossRate: 0,
          maxAge: 60, // Die of old age after 30 seconds (~1 reproduction cycle)
        },
        predator: {
          id: "predator",
          name: "Predator",
          color: "#ff0000", // Bright red
          role: "predator",
          separationWeight: 2.5, // Increased from 1.0 - spread out more
          alignmentWeight: 0.0, // Don't align with prey
          cohesionWeight: 0.0, // Don't flock with prey
          maxSpeed: 3.2, // Faster than socials, slower than independents
          maxForce: 0.2, // High turning ability
          fearFactor: 0, // Predators don't fear
          maxEnergy: 150, // Phase 1: Increased from 100 - need 6 catches to reproduce
          energyGainRate: 25, // Phase 1: Reduced from 35 - less energy per catch
          energyLossRate: 3.0, // Keep same - die in 75 seconds without food
          maxAge: 20, // Die of old age after 20 seconds (must hunt efficiently!)
        },
      },
    };
  },
  halt: () => {
    // No cleanup needed for config
  },
});
