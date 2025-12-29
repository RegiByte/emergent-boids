import type { Boid } from "../vocabulary/schemas/prelude.ts";

/**
 * Decrement cooldowns for a single boid
 * Returns updated cooldown values
 */
export function updateBoidCooldowns(boid: Boid): {
  reproductionCooldown: number;
  eatingCooldown: number;
  attackCooldown: number;
} {
  return {
    reproductionCooldown: Math.max(0, boid.reproductionCooldown - 1),
    eatingCooldown: Math.max(0, boid.eatingCooldown - 1),
    attackCooldown: Math.max(0, boid.attackCooldown - 1),
  };
}
