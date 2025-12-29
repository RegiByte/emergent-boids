import type {
  Genome,
  Phenotype,
  WorldPhysics,
  BodyPart,
} from "../vocabulary/schemas/genetics";

/**
 * Phenotype Computation - Transform genome into effective gameplay values
 *
 * Pure function that computes phenotype from genome + physics + body parts.
 * This is the bridge between genetics (data) and gameplay (mechanics).
 *
 * Philosophy: "Everything is information processing. Simple rules compose."
 *
 * Phenotype is always recomputable - it's a pure transformation of genome.
 * No side effects, no randomness, deterministic output.
 */

/**
 * Compute body part bonuses
 *
 * Body parts provide additive bonuses to various stats.
 * More parts = more effect, but also more energy cost.
 *
 * @param bodyParts - List of body parts from genome
 * @returns Aggregated bonuses
 */
function computeBodyPartBonuses(bodyParts: BodyPart[]) {
  return bodyParts.reduce(
    (acc, part) => ({
      visionBonus: acc.visionBonus + (part.effects.visionBonus || 0),
      turnRateBonus: acc.turnRateBonus + (part.effects.turnRateBonus || 0),
      speedBonus: acc.speedBonus + (part.effects.speedBonus || 0),
      damageBonus: acc.damageBonus + (part.effects.damageBonus || 0),
      defenseBonus: acc.defenseBonus + (part.effects.defenseBonus || 0),
      energyCost: acc.energyCost + (part.effects.energyCost || 0),
    }),
    {
      visionBonus: 0,
      turnRateBonus: 0,
      speedBonus: 0,
      damageBonus: 0,
      defenseBonus: 0,
      energyCost: 0,
    }
  );
}

/**
 * Compute phenotype from genome and world physics
 *
 * Transforms genetic traits into actual gameplay values.
 * All traits are percentages of physics limits, making them meaningful.
 *
 * Trade-offs emerge naturally:
 * - High speed = high energy cost
 * - Large size = more health but more hunger
 * - Better vision = higher energy drain
 * - More body parts = more bonuses but more energy cost
 *
 * @param genome - Individual's genetic traits
 * @param physics - World physics constants
 * @returns Computed phenotype (effective values)
 */
export function computePhenotype(
  genome: Genome,
  physics: WorldPhysics
): Phenotype {
  // 1. Compute body part bonuses (additive)
  const bonuses = computeBodyPartBonuses(genome.visual.bodyParts);

  // 2. Compute vision range and its energy cost
  const visionRange =
    physics.perception.maxVisionRange *
    genome.traits.vision *
    (1 + bonuses.visionBonus);

  const visionEnergyCost = visionRange * physics.energy.visionCostPerUnit;

  // 3. Compute motion capabilities
  const maxSpeed =
    physics.motion.maxSpeed * genome.traits.speed * (1 + bonuses.speedBonus);

  const maxForce =
    physics.motion.maxForce * genome.traits.force * (1 + bonuses.turnRateBonus);

  // 4. Compute resource capacities (size-based)
  const maxEnergy = 100 * genome.traits.size * physics.size.energyMultiplier;
  const maxHealth = 100 * genome.traits.size * physics.size.healthMultiplier;

  // 5. Compute energy loss rate (metabolic + vision + body part costs)
  // Efficiency trait reduces metabolic cost (0.0 efficiency = full cost, 1.0 = 50% cost)
  const metabolicCost =
    physics.energy.baseMetabolicRate *
    (1 + bonuses.energyCost) *
    (1 - genome.traits.efficiency * 0.5);

  const energyLossRate = metabolicCost + visionEnergyCost;

  // 6. Compute combat stats
  const attackDamage =
    physics.combat.baseDamage *
    genome.traits.size *
    physics.combat.sizeMultiplier *
    (1 + bonuses.damageBonus);

  const defense = bonuses.defenseBonus;

  // 7. Compute collision radius (size-based)
  const collisionRadius =
    genome.traits.size * physics.size.collisionMultiplier * 10;

  // 8. Compute survival-critical traits
  const fearFactor = genome.traits.fearResponse;
  const minReproductionAge = 5 + genome.traits.maturityRate * 15; // 5-20 seconds
  const maxAge = 100 + genome.traits.longevity * 200; // 100-300 seconds

  // 9. Compute crowd behavior from sociability
  const crowdTolerance = 10 + genome.traits.sociability * 40; // 10-50 boids
  const crowdAversionStrength = 2.0 - genome.traits.sociability * 1.2; // 0.8-2.0

  // 10. Compute flocking weights from sociability
  // Higher sociability = tighter flocks (low separation, high cohesion/alignment)
  const separationWeight = 1.5 - genome.traits.sociability * 0.5; // 1.0-1.5
  const alignmentWeight = 1.0 + genome.traits.sociability * 1.5; // 1.0-2.5
  const cohesionWeight = 1.0 + genome.traits.sociability * 2.0; // 1.0-3.0

  // 11. Return computed phenotype
  return {
    // Motion
    maxSpeed,
    maxForce,

    // Perception
    visionRange,

    // Resources
    maxEnergy,
    maxHealth,
    energyLossRate,
    healthRegenRate: physics.health.baseRegenRate,

    // Combat
    attackDamage,
    defense,
    collisionRadius,

    // Survival traits (evolvable)
    fearFactor,
    minReproductionAge,
    maxAge,

    // Crowd behavior (from sociability)
    crowdTolerance,
    crowdAversionStrength,

    // Flocking weights (from sociability)
    separationWeight,
    alignmentWeight,
    cohesionWeight,

    // Visual (pass through from genome)
    color: genome.visual.color,
    renderSize: genome.traits.size,
    bodyParts: genome.visual.bodyParts,
  };
}

/**
 * Create a genesis genome from species base configuration
 *
 * Converts old species config format to new genome format.
 * Used during initial population spawning.
 *
 * Genesis boids have:
 * - No parents (parentIds = null)
 * - Generation 0
 * - Traits from species base configuration
 *
 * @param baseTraits - Base traits from species config
 * @param baseVisual - Base visual config from species
 * @returns Genesis genome
 */
export function createGenesisGenome(
  baseTraits: {
    speed: number;
    force: number;
    vision: number;
    size: number;
    aggression: number;
    sociability: number;
    efficiency: number;
    fearResponse?: number;
    maturityRate?: number;
    longevity?: number;
  },
  baseVisual: {
    color: string;
    bodyParts: BodyPart[];
  }
): Genome {
  return {
    traits: {
      ...baseTraits,
      // Provide defaults for new traits if not specified
      fearResponse: baseTraits.fearResponse ?? 0.5,
      maturityRate: baseTraits.maturityRate ?? 0.5,
      longevity: baseTraits.longevity ?? 0.5,
    },
    visual: baseVisual,
    parentIds: null, // Genesis boids have no parents
    generation: 0, // First generation
    mutations: [], // No mutations yet
  };
}
