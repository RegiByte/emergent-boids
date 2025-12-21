import type { Boid, BoidTypeConfig } from "../types";
import { hasDiedFromOldAge, hasDiedFromStarvation } from "../predicates";

/**
 * Update age for a single boid
 * Returns new age value
 */
export function updateBoidAge(boid: Boid, deltaSeconds: number): number {
  return boid.age + deltaSeconds;
}

/**
 * Check if boid should die and return death reason
 */
export function checkBoidDeath(
  boid: Boid,
  typeConfig: BoidTypeConfig
): "old_age" | "starvation" | null {
  if (hasDiedFromOldAge(boid, typeConfig)) {
    return "old_age";
  }
  if (typeConfig.role === "predator" && hasDiedFromStarvation(boid)) {
    return "starvation";
  }
  return null;
}

