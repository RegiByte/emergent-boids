import type { Boid } from "../vocabulary/schemas/entities";
import type { WorldPhysics } from "../vocabulary/schemas/world";

/**
 * Health System - Damage, healing, and death mechanics
 *
 * Separates health (damage buffer) from energy (activity fuel).
 * Creates temporal dynamics:
 * - Wounded prey can escape (but slower, vulnerable)
 * - Exhausted predators give up chase
 * - Combat has drama (chase sequences, escapes)
 * - Healing from food (energy + health restoration)
 *
 * Philosophy: "Everything is information processing. Simple rules compose."
 *
 * Death is the sculptor - it filters out unsuccessful configurations.
 */

/**
 * Regenerate health (passive, slow)
 *
 * Boids slowly regenerate health over time.
 * This allows wounded boids to recover if they survive long enough.
 *
 * @param boid - Boid to regenerate health for
 * @returns Updated boid with regenerated health
 */
export function regenerateHealth(boid: Boid): Boid {
  if (boid.health >= boid.phenotype.maxHealth) return boid;

  return {
    ...boid,
    health: Math.min(
      boid.phenotype.maxHealth,
      boid.health + boid.phenotype.healthRegenRate
    ),
  };
}

/**
 * Take damage (combat)
 *
 * Applies damage to boid, reduced by defense stat.
 * Defense comes from body parts (shells, armor, etc.)
 *
 * @param boid - Boid taking damage
 * @param damage - Raw damage amount
 * @returns Updated boid with reduced health
 */
export function takeDamage(boid: Boid, damage: number): Boid {
  const actualDamage = damage * (1 - boid.phenotype.defense);

  return {
    ...boid,
    health: Math.max(0, boid.health - actualDamage),
  };
}

/**
 * Heal from food (energy + health)
 *
 * Eating food restores both energy and health.
 * Health healing is a percentage of energy gained.
 *
 * @param boid - Boid being healed
 * @param energyGained - Amount of energy gained from food
 * @param physics - World physics (for healing multiplier)
 * @returns Updated boid with restored health
 */
export function healFromFood(
  boid: Boid,
  energyGained: number,
  physics: WorldPhysics
): Boid {
  const healing = energyGained * physics.health.foodHealingMultiplier;

  return {
    ...boid,
    health: Math.min(boid.phenotype.maxHealth, boid.health + healing),
  };
}

/**
 * Check if boid is dead
 *
 * Death occurs when:
 * - Health reaches zero (combat)
 * - Energy reaches zero (starvation)
 *
 * @param boid - Boid to check
 * @returns True if dead, false otherwise
 */
export function isDead(boid: Boid): boolean {
  return boid.health <= 0 || boid.energy <= 0;
}

/**
 * Get death cause
 *
 * Determines why a boid died based on its final state.
 *
 * @param boid - Dead boid
 * @param maxAge - Maximum age for this species (from lifecycle config)
 * @returns Death cause keyword
 */
export function getDeathCause(
  boid: Boid,
  maxAge: number
): "old_age" | "starvation" | "predation" {
  if (boid.health <= 0) return "predation"; // Combat death
  if (boid.energy <= 0) return "starvation"; // Energy depletion
  if (maxAge > 0 && boid.age >= maxAge) return "old_age"; // Age limit
  return "starvation"; // Default fallback
}

/**
 * Get wounded tint color
 *
 * Visual indicator for wounded boids.
 * Color intensity increases as health decreases.
 *
 * @param boid - Boid to check
 * @returns RGBA color string or null if healthy
 */
export function getWoundedTint(
  boid: Boid
): { color: string; alpha: number } | null {
  const healthPercent = boid.health / boid.phenotype.maxHealth;

  if (healthPercent > 0.7) return null; // Healthy (>70%)
  if (healthPercent > 0.4) return { color: "rgba(255, 200, 0)", alpha: 0.2 }; // Wounded (40-70%, yellow)
  return { color: "rgba(255, 0, 0)", alpha: 0.4 }; // Critical (<40%, red)
}

/**
 * Check if boid should show health bar
 *
 * Only show health bar when damaged (not at full health).
 * Reduces visual clutter.
 *
 * @param boid - Boid to check
 * @returns True if health bar should be shown
 */
export function shouldShowHealthBar(boid: Boid): boolean {
  const healthPercent = boid.health / boid.phenotype.maxHealth;
  return healthPercent < 0.99; // Show if less than 99% health
}
