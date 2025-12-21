import type { Boid, BoidTypeConfig } from "../types";

/**
 * Update energy for a single boid based on its role and stance
 * Returns new energy value
 */
export function updateBoidEnergy(
  boid: Boid,
  typeConfig: BoidTypeConfig,
  deltaSeconds: number
): number {
  if (typeConfig.role === "predator") {
    if (boid.stance === "idle" || boid.stance === "eating") {
      // No energy change when idle or eating (eating gains from food sources)
      return boid.energy;
    } else {
      // Lose energy while active (hunting, seeking mate, mating)
      return boid.energy - typeConfig.energyLossRate * deltaSeconds;
    }
  } else {
    // Prey no longer gain passive energy - must eat from food sources
    if (boid.stance === "fleeing") {
      // Lose double energy when fleeing from predator
      return boid.energy - typeConfig.energyLossRate * deltaSeconds * 2;
    } else if (boid.stance === "eating") {
      // No passive change, only from food sources
      return boid.energy;
    } else {
      // No energy loss while flocking/seeking mate (only when fleeing)
      return boid.energy;
    }
  }
}
