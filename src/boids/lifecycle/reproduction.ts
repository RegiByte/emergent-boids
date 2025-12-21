
import { processMatingCycle, type MatingResult } from "../mating";
import { isReadyToMate } from "../predicates";
import type { Boid } from "../types";
import {SimulationParameters, SpeciesConfig} from "../../vocabulary/schemas/prelude.ts";

/**
 * Process reproduction for a single boid
 * Returns mating result without side effects
 */
export function processBoidReproduction(
  boid: Boid,
  allBoids: Boid[],
  parameters: SimulationParameters,
  speciesConfig: SpeciesConfig,
  matedBoids: Set<string>
): MatingResult {
  const ready = isReadyToMate(boid, parameters, speciesConfig);

  if (ready && !matedBoids.has(boid.id)) {
    return processMatingCycle(
      boid,
      allBoids,
      parameters,
      speciesConfig,
      matedBoids
    );
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
