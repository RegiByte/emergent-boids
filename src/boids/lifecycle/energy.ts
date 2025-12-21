import type { Boid, BoidTypeConfig } from "../types";
import { calculateIdleEnergyGain } from "../calculations";

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
    if (boid.stance === "idle") {
      // Gain energy while idle (resting)
      const gained =
        boid.energy +
        calculateIdleEnergyGain(typeConfig.energyGainRate, deltaSeconds);
      return Math.min(gained, typeConfig.maxEnergy);
    } else {
      // Lose energy while active (hunting, seeking mate, mating, eating)
      return boid.energy - typeConfig.energyLossRate * deltaSeconds;
    }
  } else {
    if (boid.stance === "fleeing") {
      // loses double energy when fleeing from predator
      return boid.energy - typeConfig.energyLossRate * deltaSeconds * 2;
    }
    // gain energy over time
    const gained = boid.energy + typeConfig.energyGainRate * deltaSeconds;
    return Math.min(gained, typeConfig.maxEnergy);
  }
}
