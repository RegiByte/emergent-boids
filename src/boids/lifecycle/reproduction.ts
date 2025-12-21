import type { Boid, BoidConfig, BoidTypeConfig } from "../types";
import { isReadyToMate } from "../predicates";
import { processMatingCycle, type MatingResult } from "../mating";

/**
 * Process reproduction for a single boid
 * Returns mating result without side effects
 */
export function processBoidReproduction(
  boid: Boid,
  allBoids: Boid[],
  config: BoidConfig,
  typeConfig: BoidTypeConfig,
  matedBoids: Set<string>
): MatingResult {
  const ready = isReadyToMate(boid, config, typeConfig);

  if (ready && !matedBoids.has(boid.id)) {
    return processMatingCycle(boid, allBoids, config, typeConfig, matedBoids);
  } else if (boid.mateId && !ready) {
    // No longer ready to mate
    return {
      type: "mate_lost",
      updates: {
        energy: boid.energy,
        reproductionCooldown: boid.reproductionCooldown,
        matingBuildupCounter: 0,
        mateId: null,
        seekingMate: false,
      },
    };
  }

  return { type: "no_action" };
}

