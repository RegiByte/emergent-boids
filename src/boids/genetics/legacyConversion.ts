import type {
  Genome,
  BodyPart,
  WorldPhysics,
} from "../vocabulary/schemas/genetics";
import type { SpeciesConfig } from "../vocabulary/schemas/prelude";

/**
 * Legacy Conversion Utilities
 *
 * Converts old species config format to new genome format.
 * This provides backward compatibility during migration.
 *
 * Once all species are converted to baseGenome format, these functions
 * can be removed.
 */

/**
 * Convert legacy species config to genome
 *
 * Estimates trait values from old movement/lifecycle/visual config.
 * This is a best-effort conversion for backward compatibility.
 *
 * @param speciesConfig - Legacy species configuration
 * @param physics - World physics (for calculating percentages)
 * @returns Genesis genome
 */
export function convertLegacyConfigToGenome(
  speciesConfig: SpeciesConfig,
  physics: WorldPhysics
): Genome {
  // Extract values from legacy config
  const maxSpeed = speciesConfig.movement?.maxSpeed || 4.0;
  const maxForce = speciesConfig.movement?.maxForce || 0.1;
  const size = speciesConfig.visual?.size || 1.0;
  const color = speciesConfig.visual?.color || "#ffffff";

  // Convert to trait percentages (0.0 - 1.0)
  const speed = maxSpeed / physics.motion.maxSpeed;
  const force = maxForce / physics.motion.maxForce;

  // Estimate vision based on role (no direct mapping in legacy config)
  const vision = 0.5; // Default 50% vision

  // Estimate behavioral traits based on role and movement weights
  const aggression = speciesConfig.role === "predator" ? 0.8 : 0.3;

  // Estimate sociability from cohesion weight
  const cohesionWeight = speciesConfig.movement?.cohesionWeight || 1.0;
  const sociability = Math.min(cohesionWeight / 3.0, 1.0); // Normalize to 0-1

  // Estimate efficiency (default to medium)
  const efficiency = 0.5;

  // Convert body parts from legacy format (string array) to new format
  const bodyPartsLegacy = speciesConfig.visual?.bodyParts || [];
  const bodyParts: BodyPart[] = bodyPartsLegacy.map((partType, index) => {
    // Create body parts with default positions and effects
    switch (partType) {
      case "eyes":
        return {
          type: "eye" as const,
          size: 1.0,
          position: { x: index === 0 ? -0.2 : 0.2, y: -0.4 },
          rotation: 0,
          effects: { visionBonus: 0.1 },
        };
      case "fins":
        return {
          type: "fin" as const,
          size: 1.0,
          position: { x: index % 2 === 0 ? -0.3 : 0.3, y: 0 },
          rotation: index % 2 === 0 ? -90 : 90,
          effects: { turnRateBonus: 0.05 },
        };
      case "tail":
        return {
          type: "tail" as const,
          size: 1.0,
          position: { x: 0, y: 0.5 },
          rotation: 180,
          effects: { speedBonus: 0.05 },
        };
      case "spikes":
        return {
          type: "spike" as const,
          size: 1.0,
          position: { x: 0, y: -0.3 },
          rotation: 0,
          effects: { damageBonus: 0.15, energyCost: 0.05 },
        };
      case "glow":
        return {
          type: "glow" as const,
          size: 1.0,
          position: { x: 0, y: 0 },
          rotation: 0,
          effects: { energyCost: 0.02 },
        };
      default:
        // Default to eye if unknown
        return {
          type: "eye" as const,
          size: 1.0,
          position: { x: 0, y: -0.4 },
          rotation: 0,
          effects: { visionBonus: 0.05 },
        };
    }
  });

  return {
    traits: {
      speed,
      force,
      vision,
      size,
      aggression,
      sociability,
      efficiency,
    },
    visual: {
      color,
      bodyParts,
    },
    parentIds: null, // Genesis boids have no parents
    generation: 0,
    mutations: [],
  };
}
