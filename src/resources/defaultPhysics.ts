import type { WorldPhysics } from "../boids/vocabulary/schemas/genetics";

/**
 * Default World Physics
 *
 * Universal constants that define the physical limits of the simulation.
 * These values are tuned for the stable-ecosystem profile but can be
 * overridden per profile.
 *
 * Philosophy: Trait values become percentages of these limits.
 * Example: genome.speed = 0.5 means 50% of physics.motion.maxSpeed
 */
export const defaultWorldPhysics: WorldPhysics = {
  motion: {
    maxSpeed: 10.0, // Absolute speed limit (current fastest is 5.0, so 50% of max)
    maxForce: 0.5, // Absolute turning force (current is 0.08-0.2, so 16-40% of max)
    friction: 0.98, // Velocity damping per frame
  },

  energy: {
    baseMetabolicRate: 0.01, // Minimum cost per tick (breathing)
    movementCostPerSpeed: 0.001, // Cost per unit of speed
    visionCostPerUnit: 0.0001, // Cost per unit of vision range
    combatCost: 0.05, // Cost per attack
  },

  perception: {
    maxVisionRange: 300, // Absolute vision limit (current perceptionRadius is 50, so 16% of max)
  },

  size: {
    min: 0.5, // Minimum boid size
    max: 3.0, // Maximum boid size
    energyMultiplier: 1.5, // Larger = more energy capacity
    healthMultiplier: 2.0, // Larger = more health
    collisionMultiplier: 1.0, // Size affects collision radius
  },

  combat: {
    baseDamage: 10, // Base attack damage
    sizeMultiplier: 1.5, // Larger = more damage
  },

  health: {
    baseRegenRate: 0.05, // Health regen per tick (5% of max health)
    foodHealingMultiplier: 0.5, // % of energy gained also heals
  },
};
