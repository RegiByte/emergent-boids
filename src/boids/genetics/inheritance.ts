import type {
  Genome,
  BodyPart,
  MutationConfig,
} from "../vocabulary/schemas/genetics";
import type { DomainRNG } from "@/lib/seededRandom";
import { mixColors, lighten, darken, saturate, desaturate } from "@/lib/colors";

/**
 * Genome Inheritance - Mix parent genomes and apply mutations
 *
 * Philosophy: "Simple rules compose. Emergence is reliable."
 *
 * Inheritance Strategy:
 * - Sexual: 50% parent1 + 50% parent2 + mutations
 * - Asexual: 100% parent1 + mutations
 * - Body parts: Random selection from both parents (never all from both)
 * - Color: Parent color(s) + LAB space mutations
 * - Generation: max(parent generations) + 1
 *
 * Evolution emerges from:
 * 1. Variation (mutations)
 * 2. Selection (death filters)
 * 3. Inheritance (offspring copy with variation)
 * 4. Time (generations reveal patterns)
 */

/**
 * Default mutation configuration
 * Tuned for gradual evolution with visible changes over ~10-20 generations
 */
export const DEFAULT_MUTATION_CONFIG: MutationConfig = {
  traitRate: 0.05, // 5% chance per trait
  traitMagnitude: 0.1, // ±10% change
  visualRate: 0.02, // 2% chance of body part mutation
  colorRate: 0.1, // 10% chance of color shift
};

/**
 * Mutate a single trait value
 *
 * Applies small random changes to trait values.
 * Keeps values within valid bounds.
 *
 * @param value - Current trait value
 * @param rate - Mutation chance (0.0-1.0)
 * @param magnitude - Mutation size (0.0-1.0, typically 0.1 = ±10%)
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param rng - Seeded RNG for reproducibility
 * @returns Mutated value and whether mutation occurred
 */
export function mutateValue(
  value: number,
  rate: number,
  magnitude: number,
  min: number,
  max: number,
  rng: DomainRNG
): { value: number; mutated: boolean } {
  // Check if mutation occurs
  if (rng.next() > rate) {
    return { value, mutated: false };
  }

  // Apply mutation: value ± (magnitude * range)
  const range = max - min;
  const delta = (rng.next() * 2 - 1) * magnitude * range;
  const newValue = Math.max(min, Math.min(max, value + delta));

  return { value: newValue, mutated: true };
}

/**
 * Inherit color from parent(s) with mutation
 *
 * Strategy:
 * - Single parent: Use parent color
 * - Two parents: Blend in LAB space (for future cross-species breeding)
 * - Apply LAB space mutations for gradual color drift
 *
 * Uses chroma-js for perceptually uniform LAB color space operations.
 * Mutations are small shifts in brightness, saturation, or hue.
 *
 * @param color1 - Parent 1 color (hex string)
 * @param color2 - Optional parent 2 color (hex string)
 * @param mutationRate - Chance of color mutation
 * @param rng - Seeded RNG
 * @returns Inherited color (possibly mutated)
 */
export function inheritColor(
  color1: string,
  color2: string | undefined,
  mutationRate: number,
  rng: DomainRNG
): string {
  // Blend parent colors if both exist (for future cross-species breeding)
  // For now, same species = same color, so this just uses parent1
  const baseColor = color2 ? mixColors(color1, color2, 0.5, "lab") : color1;

  // Check if color mutation occurs
  if (rng.next() > mutationRate) {
    return baseColor; // No mutation
  }

  // Apply LAB space mutation using chroma-js
  // Randomly choose mutation type for variety
  const mutationType = rng.next();
  const mutationStrength = rng.range(0.1, 0.3); // Small mutations

  if (mutationType < 0.5) {
    // Brightness shift (lighten or darken)
    return rng.next() < 0.5
      ? lighten(baseColor, mutationStrength)
      : darken(baseColor, mutationStrength);
  } else {
    // Saturation shift (saturate or desaturate)
    return rng.next() < 0.5
      ? saturate(baseColor, mutationStrength)
      : desaturate(baseColor, mutationStrength);
  }
}

/**
 * Mutate body parts list
 *
 * Can add, remove, or modify parts.
 * Strategy:
 * - 30% chance: Add random part (if < 5 parts)
 * - 30% chance: Remove random part (if > 0 parts)
 * - 40% chance: Modify existing part (size/position)
 *
 * @param parts - Current body parts
 * @param rng - Seeded RNG
 * @returns Mutated body parts
 */
export function mutateBodyParts(parts: BodyPart[], rng: DomainRNG): BodyPart[] {
  if (parts.length === 0) {
    return parts; // Can't mutate empty list
  }

  const roll = rng.next();

  // 30% chance: Add part (if space available)
  if (roll < 0.3 && parts.length < 5) {
    const partTypes: BodyPart["type"][] = [
      "eye",
      "fin",
      "tail",
      "spike",
      "antenna",
      "glow",
      "shell",
    ];
    const newPart: BodyPart = {
      type: rng.pick(partTypes),
      size: rng.range(0.5, 2.0),
      position: {
        x: rng.range(-1, 1),
        y: rng.range(-1, 1),
      },
      rotation: rng.range(0, 360),
      effects: {
        visionBonus: rng.next() < 0.3 ? rng.range(0.05, 0.15) : undefined,
        speedBonus: rng.next() < 0.3 ? rng.range(0.05, 0.15) : undefined,
        energyCost: rng.range(0.02, 0.08),
      },
    };
    return [...parts, newPart];
  }

  // 30% chance: Remove part (if > 0 parts)
  if (roll < 0.6 && parts.length > 0) {
    const indexToRemove = rng.intRange(0, parts.length);
    return parts.filter((_, i) => i !== indexToRemove);
  }

  // 40% chance: Modify existing part
  const indexToModify = rng.intRange(0, parts.length);
  const modifiedParts = [...parts];
  const part = { ...modifiedParts[indexToModify] };

  // Randomly modify size, position, or rotation
  const modType = rng.next();
  if (modType < 0.33) {
    part.size = Math.max(0.5, Math.min(2.0, part.size + rng.range(-0.2, 0.2)));
  } else if (modType < 0.66) {
    part.position = {
      x: Math.max(-1, Math.min(1, part.position.x + rng.range(-0.2, 0.2))),
      y: Math.max(-1, Math.min(1, part.position.y + rng.range(-0.2, 0.2))),
    };
  } else {
    part.rotation = (part.rotation + rng.range(-45, 45)) % 360;
  }

  modifiedParts[indexToModify] = part;
  return modifiedParts;
}

/**
 * Inherit body parts from parent(s)
 *
 * Strategy:
 * - Single parent: Use all parent parts
 * - Two parents: Randomly select ~50% from each parent
 * - Never inherit ALL parts from both (would double count)
 * - Apply mutation after inheritance
 *
 * @param parts1 - Parent 1 body parts
 * @param parts2 - Optional parent 2 body parts
 * @param mutationRate - Chance of body part mutation
 * @param rng - Seeded RNG
 * @returns Inherited body parts (possibly mutated)
 */
export function inheritBodyParts(
  parts1: BodyPart[],
  parts2: BodyPart[] | undefined,
  mutationRate: number,
  rng: DomainRNG
): BodyPart[] {
  let inheritedParts: BodyPart[];

  if (!parts2) {
    // Asexual: Use all parent parts
    inheritedParts = [...parts1];
  } else {
    // Sexual: Randomly select ~50% from each parent
    // This prevents doubling of parts while mixing traits
    const allParts = [...parts1, ...parts2];
    const targetCount = Math.max(1, Math.ceil(allParts.length / 2)); // At least 1 part

    // Randomly shuffle and take first N parts
    const shuffled = [...allParts].sort(() => rng.next() - 0.5);
    inheritedParts = shuffled.slice(0, targetCount);
  }

  // Apply mutation
  if (rng.next() < mutationRate) {
    inheritedParts = mutateBodyParts(inheritedParts, rng);
  }

  return inheritedParts;
}

/**
 * Inherit genome from parent(s)
 *
 * Main inheritance function - creates offspring genome from parent genome(s).
 *
 * Strategy:
 * - Sexual reproduction: Blend 50/50 + mutations
 * - Asexual reproduction: Clone + mutations
 * - Track parentIds and generation
 * - Record significant mutations (>5% change) for analytics
 *
 * @param parent1 - First parent genome (required)
 * @param parent2 - Second parent genome (optional, for sexual reproduction)
 * @param mutationConfig - Mutation parameters (uses defaults if not provided)
 * @param rng - Seeded RNG for reproducibility
 * @param enableLogging - Enable detailed mutation logging (default: false)
 * @returns Offspring genome and mutation metadata
 */
export function inheritGenome(
  parent1: Genome,
  parent2: Genome | undefined,
  mutationConfig: MutationConfig = DEFAULT_MUTATION_CONFIG,
  rng: DomainRNG,
  enableLogging: boolean = false
): {
  genome: Genome;
  hadTraitMutation: boolean;
  hadColorMutation: boolean;
  hadBodyPartMutation: boolean;
} {
  const isAsexual = !parent2;
  
  if (enableLogging) {
    console.log("🧬 GENOME INHERITANCE", {
      type: isAsexual ? "ASEXUAL" : "SEXUAL",
      parent1Generation: parent1.generation,
      parent2Generation: parent2?.generation,
      mutationConfig,
    });
  }

  // 1. Inherit traits (with mutations)
  const traits: Genome["traits"] = {
    speed: 0,
    force: 0,
    vision: 0,
    size: 0,
    aggression: 0,
    sociability: 0,
    efficiency: 0,
    fearResponse: 0,
    maturityRate: 0,
    longevity: 0,
  };

  // Track mutations for genealogy
  const mutations: Array<{
    generation: number;
    trait: string;
    oldValue: number;
    newValue: number;
    magnitude: number;
  }> = [];

  const generation = Math.max(parent1.generation, parent2?.generation ?? 0) + 1;

  // Inherit each trait
  for (const key of Object.keys(traits) as Array<keyof typeof traits>) {
    // Blend parent values (asexual = 100% parent1, sexual = 50/50)
    const baseValue = isAsexual
      ? parent1.traits[key]
      : (parent1.traits[key] + parent2!.traits[key]) / 2;

    // Determine bounds for this trait
    const min = key === "size" ? 0.5 : 0.0;
    const max = key === "size" ? 3.0 : 1.0;

    // Apply mutation
    const { value, mutated } = mutateValue(
      baseValue,
      mutationConfig.traitRate,
      mutationConfig.traitMagnitude,
      min,
      max,
      rng
    );

    traits[key] = value;

    // Record significant mutations (>5% change from base)
    if (mutated && Math.abs(value - baseValue) > 0.05) {
      mutations.push({
        generation,
        trait: key,
        oldValue: baseValue,
        newValue: value,
        magnitude: Math.abs(value - baseValue),
      });
    }
  }

  // 2. Inherit visual traits
  const color = inheritColor(
    parent1.visual.color,
    parent2?.visual.color,
    mutationConfig.colorRate,
    rng
  );

  const bodyParts = inheritBodyParts(
    parent1.visual.bodyParts,
    parent2?.visual.bodyParts,
    mutationConfig.visualRate,
    rng
  );

  // Track if mutations occurred
  const hadTraitMutation = mutations.length > 0;
  const hadColorMutation = color !== parent1.visual.color;
  const hadBodyPartMutation = bodyParts.length !== parent1.visual.bodyParts.length;

  // 3. Set genealogy
  const parentIds: [string, string] | null = isAsexual
    ? null // Asexual doesn't track parents (for now)
    : ([
        parent1.parentIds?.[0] ?? "unknown",
        parent2!.parentIds?.[0] ?? "unknown",
      ] as [string, string]);

  // 4. Build offspring genome
  const offspring: Genome = {
    traits,
    visual: {
      color,
      bodyParts,
    },
    parentIds,
    generation,
    mutations: [...(parent1.mutations || []), ...mutations],
  };

  // 5. Log inheritance results
  if (enableLogging && (hadTraitMutation || hadColorMutation || hadBodyPartMutation)) {
    console.log("✨ MUTATION DETECTED!", {
      generation: offspring.generation,
      traitMutations: mutations.length,
      colorChanged: hadColorMutation,
      bodyPartsChanged: hadBodyPartMutation,
      details: {
        parent1Traits: parent1.traits,
        parent2Traits: parent2?.traits,
        offspringTraits: traits,
        mutations: mutations,
        parent1Color: parent1.visual.color,
        offspringColor: color,
        parent1BodyParts: parent1.visual.bodyParts.length,
        offspringBodyParts: bodyParts.length,
      }
    });
  }

  return {
    genome: offspring,
    hadTraitMutation,
    hadColorMutation,
    hadBodyPartMutation,
  };
}
