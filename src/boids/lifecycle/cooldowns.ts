import type { Boid } from '../vocabulary/schemas/entities'

/**
 * Decrement cooldowns for a single boid
 * Returns updated cooldown values
 */
export function updateBoidCooldowns(boid: Boid): {
  reproductionCooldown: number
  eatingCooldown: number
  attackCooldown: number
} {
  return {
    reproductionCooldown: Math.max(0, boid.reproductionCooldown - 1),
    eatingCooldown: Math.max(0, boid.eatingCooldownFrames - 1),
    attackCooldown: Math.max(0, boid.attackCooldownFrames - 1),
  }
}
