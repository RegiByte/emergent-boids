# Genetics System

This document explains how genetic inheritance and evolution work in Emergent Boids.

## Overview

The genetics system enables populations to adapt over generations through natural selection. Offspring inherit traits from parents with random mutations, and survival filters out unsuccessful combinations.

Evolution is not programmed explicitly. It emerges from:

1. **Variation** - Mutations introduce differences
2. **Selection** - Death removes unsuccessful traits
3. **Inheritance** - Offspring copy parents with variation
4. **Time** - Generations reveal patterns

## Five-Layer Architecture

The genetics system uses five layers that transform genetic information into gameplay mechanics.

### Layer 1: World Physics

Universal constants that define physical limits. All traits operate within these bounds.

```typescript
interface WorldPhysics {
  motion: {
    maxSpeed: number;      // 10.0 - absolute speed limit
    maxForce: number;      // 0.5 - absolute turning force
    friction: number;      // 0.98 - velocity damping
  };
  
  energy: {
    baseMetabolicRate: number;        // 0.01 - minimum cost per tick
    movementCostPerSpeed: number;     // 0.001 - cost per unit of speed
    visionCostPerUnit: number;        // 0.0001 - cost per unit of vision
    combatCost: number;               // 0.05 - cost per attack
  };
  
  perception: {
    maxVisionRange: number;  // 300 - absolute vision limit
  };
  
  size: {
    min: number;                // 0.5 - minimum boid size
    max: number;                // 3.0 - maximum boid size
    energyMultiplier: number;   // 1.5 - larger = more energy capacity
    healthMultiplier: number;   // 2.0 - larger = more health
  };
  
  combat: {
    baseDamage: number;         // 10 - base attack damage
    sizeMultiplier: number;     // 1.5 - larger = more damage
  };
  
  health: {
    baseRegenRate: number;            // 0.05 - health regen per tick
    foodHealingMultiplier: number;    // 0.5 - energy gained also heals
  };
}
```

**Key Insight:** Trait values are percentages of physics limits, making them meaningful and comparable across species.

**Benefits:**

- Trait values have consistent meaning (0.8 speed always means 80% of max)
- Easy to balance (adjust physics, not every species)
- Trade-offs emerge naturally (high speed = high energy cost)
- Comparable across species

### Layer 2: Species Archetype

Base configuration for each species, providing starting genome and mutation rates.

```typescript
interface SpeciesArchetype {
  id: string;
  name: string;
  role: 'prey' | 'predator';
  
  baseGenome: {
    traits: {
      speed: number;        // 0.0 - 1.0 (% of maxSpeed)
      force: number;        // 0.0 - 1.0 (% of maxForce)
      vision: number;       // 0.0 - 1.0 (% of maxVision)
      size: number;         // 0.5 - 3.0 (absolute, within physics limits)
      aggression: number;   // 0.0 - 1.0 (behavioral)
      sociability: number;  // 0.0 - 1.0 (behavioral)
      efficiency: number;   // 0.0 - 1.0 (energy efficiency)
    };
    
    visual: {
      color: string;          // LAB color
      bodyParts: BodyPart[];  // Visual traits with mechanical effects
    };
  };
  
  mutation: {
    traitRate: number;      // 0.05 - 5% mutation per trait
    traitMagnitude: number; // 0.1 - ±10% change
    visualRate: number;     // 0.02 - 2% chance of body part mutation
    colorRate: number;      // 0.1 - 10% color shift
  };
}
```

### Layer 3: Body Parts

Visual traits that carry mechanical effects. Body parts provide additive bonuses.

```typescript
interface BodyPart {
  type: 'eye' | 'fin' | 'tail' | 'spike' | 'antenna' | 'glow' | 'shell';
  size: number;                    // 0.5 - 2.0 (relative to boid size)
  position: { x: number; y: number };  // -1 to 1 (relative to body center)
  rotation: number;                // 0 - 360 degrees
  
  effects: {
    visionBonus?: number;      // +20% vision range (eyes)
    turnRateBonus?: number;    // +15% turn rate (fins)
    speedBonus?: number;       // +10% speed (tail)
    damageBonus?: number;      // +25% attack damage (spikes)
    defenseBonus?: number;     // +10% damage reduction (shell)
    energyCost?: number;       // +5% energy consumption (cost of having part)
  };
}
```

**Design Decision:** Body parts use a list instead of fixed slots, allowing richer variety.

**Benefits:**

- Multiple instances allowed (1 eye, 2 eyes, 8 eyes)
- Each part has position, size, rotation
- Effects are additive (more parts = more bonus)
- Energy cost scales with part count (trade-off)
- Inheritance mixes parts from both parents
- Mutations can add/remove/modify parts

**Example: Standard Two Eyes**

```typescript
bodyParts: [
  {
    type: 'eye',
    size: 1.0,
    position: { x: -0.2, y: -0.4 },
    rotation: 0,
    effects: { visionBonus: 0.1 },
  },
  {
    type: 'eye',
    size: 1.0,
    position: { x: 0.2, y: -0.4 },
    rotation: 0,
    effects: { visionBonus: 0.1 },
  },
];
// Total: +20% vision
```

**Example: Multiple Fins**

```typescript
bodyParts: [
  {
    type: 'fin',
    size: 1.0,
    position: { x: -0.5, y: 0 },
    rotation: 90,
    effects: { turnRateBonus: 0.1 },
  },
  {
    type: 'fin',
    size: 1.0,
    position: { x: 0.5, y: 0 },
    rotation: -90,
    effects: { turnRateBonus: 0.1 },
  },
  {
    type: 'fin',
    size: 0.8,
    position: { x: 0, y: 0.6 },
    rotation: 180,
    effects: { turnRateBonus: 0.08 },
  },
];
// Total: +28% turn rate
```

### Layer 4: Individual Genome

Heritable traits for each individual boid.

```typescript
interface Genome {
  traits: {
    speed: number;        // Inherited from parents, mutated
    force: number;
    vision: number;
    size: number;
    aggression: number;
    sociability: number;
    efficiency: number;
  };
  
  visual: {
    color: string;          // LAB-mixed from parents
    bodyParts: BodyPart[];  // Inherited with mutation
  };
  
  parentIds: [string, string] | null;  // [motherId, fatherId] or null for genesis
  generation: number;                  // 0 for genesis, parent.generation + 1
  mutations: MutationRecord[];         // History of mutations (for analytics)
}
```

### Layer 5: Phenotype

Computed effective values that translate genome into gameplay mechanics.

```typescript
interface Phenotype {
  // Motion (from physics + genome + body parts)
  maxSpeed: number;
  maxForce: number;
  
  // Perception (from physics + genome + body parts)
  visionRange: number;
  
  // Resources (from physics + genome + body parts)
  maxEnergy: number;
  maxHealth: number;
  energyLossRate: number;
  healthRegenRate: number;
  
  // Combat (from physics + genome + body parts)
  attackDamage: number;
  defense: number;
  collisionRadius: number;
  
  // Visual (from genome)
  color: string;
  bodyParts: BodyPart[];
}
```

**Key Insight:** Phenotype is a pure function of genome, physics, and body parts. Always recomputable.

## Phenotype Computation

The phenotype computation transforms genetic data into gameplay values.

```typescript
export function computePhenotype(
  genome: Genome,
  physics: WorldPhysics
): Phenotype {
  // 1. Compute body part bonuses (additive)
  const bonuses = genome.visual.bodyParts.reduce(
    (acc, part) => ({
      visionBonus: acc.visionBonus + (part.effects.visionBonus || 0),
      turnRateBonus: acc.turnRateBonus + (part.effects.turnRateBonus || 0),
      speedBonus: acc.speedBonus + (part.effects.speedBonus || 0),
      damageBonus: acc.damageBonus + (part.effects.damageBonus || 0),
      defenseBonus: acc.defenseBonus + (part.effects.defenseBonus || 0),
      energyCost: acc.energyCost + (part.effects.energyCost || 0),
    }),
    { visionBonus: 0, turnRateBonus: 0, speedBonus: 0, 
      damageBonus: 0, defenseBonus: 0, energyCost: 0 }
  );
  
  // 2. Compute effective values from physics + genome + bonuses
  const visionRange = 
    physics.perception.maxVisionRange * 
    genome.traits.vision * 
    (1 + bonuses.visionBonus);
  
  const maxSpeed = 
    physics.motion.maxSpeed * 
    genome.traits.speed * 
    (1 + bonuses.speedBonus);
  
  const maxForce = 
    physics.motion.maxForce * 
    genome.traits.force * 
    (1 + bonuses.turnRateBonus);
  
  const maxEnergy = 100 * genome.traits.size * physics.size.energyMultiplier;
  const maxHealth = 100 * genome.traits.size * physics.size.healthMultiplier;
  
  const metabolicCost = 
    physics.energy.baseMetabolicRate * 
    (1 + bonuses.energyCost) * 
    (1 - genome.traits.efficiency * 0.5);
  
  const visionEnergyCost = visionRange * physics.energy.visionCostPerUnit;
  const energyLossRate = metabolicCost + visionEnergyCost;
  
  const attackDamage = 
    physics.combat.baseDamage * 
    genome.traits.size * 
    physics.combat.sizeMultiplier * 
    (1 + bonuses.damageBonus);
  
  return {
    maxSpeed,
    maxForce,
    visionRange,
    maxEnergy,
    maxHealth,
    energyLossRate,
    healthRegenRate: physics.health.baseRegenRate,
    attackDamage,
    defense: bonuses.defenseBonus,
    collisionRadius: genome.traits.size * physics.size.collisionMultiplier * 10,
    color: genome.visual.color,
    bodyParts: genome.visual.bodyParts,
  };
}
```

**Trade-offs emerge naturally:**

- High speed = high energy cost
- Large size = more health but more hunger
- Better vision = higher energy drain
- More body parts = more bonuses but more energy cost

## Genome Inheritance

Offspring inherit traits from parents with mutations.

### Inheritance Strategy

- **Sexual reproduction:** 50% parent1 + 50% parent2 + mutations
- **Asexual reproduction:** 100% parent + mutations
- **Body parts:** Random selection from both parents (never all from both)
- **Color:** Parent color(s) + LAB space mutations
- **Generation:** max(parent generations) + 1

### Trait Mutation

```typescript
export function mutateValue(
  value: number,
  rate: number,
  magnitude: number,
  min: number,
  max: number,
  rng: DomainRNG
): { value: number; mutated: boolean } {
  if (rng.next() > rate) {
    return { value, mutated: false };
  }
  
  const range = max - min;
  const delta = (rng.next() * 2 - 1) * magnitude * range;
  const newValue = Math.max(min, Math.min(max, value + delta));
  
  return { value: newValue, mutated: true };
}
```

**Parameters:**

- `rate`: Mutation chance (typically 0.05 = 5%)
- `magnitude`: Mutation size (typically 0.1 = ±10%)
- `min`, `max`: Valid range for trait

### Color Inheritance

Colors blend in LAB space (perceptually uniform) and mutate through brightness, saturation, or hue shifts.

```typescript
export function inheritColor(
  color1: string,
  color2: string | undefined,
  mutationRate: number,
  rng: DomainRNG
): string {
  const baseColor = color2 ? mixColors(color1, color2, 0.5, 'lab') : color1;
  
  if (rng.next() > mutationRate) {
    return baseColor;
  }
  
  const mutationType = rng.next();
  const mutationStrength = rng.range(0.1, 0.3);
  
  if (mutationType < 0.5) {
    return rng.next() < 0.5
      ? lighten(baseColor, mutationStrength)
      : darken(baseColor, mutationStrength);
  } else {
    return rng.next() < 0.5
      ? saturate(baseColor, mutationStrength)
      : desaturate(baseColor, mutationStrength);
  }
}
```

### Body Part Inheritance

Body parts are randomly selected from both parents and can mutate.

```typescript
export function inheritBodyParts(
  parts1: BodyPart[],
  parts2: BodyPart[] | undefined,
  mutationRate: number,
  rng: DomainRNG
): BodyPart[] {
  let inheritedParts: BodyPart[];
  
  if (!parts2) {
    // Asexual: use all parent parts
    inheritedParts = [...parts1];
  } else {
    // Sexual: randomly select ~50% from each parent
    const allParts = [...parts1, ...parts2];
    const targetCount = Math.max(1, Math.ceil(allParts.length / 2));
    const shuffled = [...allParts].sort(() => rng.next() - 0.5);
    inheritedParts = shuffled.slice(0, targetCount);
  }
  
  if (rng.next() < mutationRate) {
    inheritedParts = mutateBodyParts(inheritedParts, rng);
  }
  
  return inheritedParts;
}
```

### Body Part Mutation

Mutations can add, remove, or modify body parts.

```typescript
export function mutateBodyParts(parts: BodyPart[], rng: DomainRNG): BodyPart[] {
  const roll = rng.next();
  
  // 30% chance: Add random part (if < 5 parts)
  if (roll < 0.3 && parts.length < 5) {
    const newPart: BodyPart = {
      type: rng.pick(['eye', 'fin', 'tail', 'spike', 'antenna', 'glow', 'shell']),
      size: rng.range(0.5, 2.0),
      position: { x: rng.range(-1, 1), y: rng.range(-1, 1) },
      rotation: rng.range(0, 360),
      effects: {
        visionBonus: rng.next() < 0.3 ? rng.range(0.05, 0.15) : undefined,
        speedBonus: rng.next() < 0.3 ? rng.range(0.05, 0.15) : undefined,
        energyCost: rng.range(0.02, 0.08),
      },
    };
    return [...parts, newPart];
  }
  
  // 30% chance: Remove random part (if > 0 parts)
  if (roll < 0.6 && parts.length > 0) {
    const indexToRemove = rng.intRange(0, parts.length);
    return parts.filter((_, i) => i !== indexToRemove);
  }
  
  // 40% chance: Modify existing part (size/position/rotation)
  const indexToModify = rng.intRange(0, parts.length);
  const modifiedParts = [...parts];
  const part = { ...modifiedParts[indexToModify] };
  
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
```

### Complete Genome Inheritance

```typescript
export function inheritGenome(
  parent1: Genome,
  parent2: Genome | undefined,
  mutationConfig: MutationConfig,
  rng: DomainRNG
): {
  genome: Genome;
  hadTraitMutation: boolean;
  hadColorMutation: boolean;
  hadBodyPartMutation: boolean;
} {
  const isAsexual = !parent2;
  const traits: Genome['traits'] = {};
  const mutations: MutationRecord[] = [];
  const generation = Math.max(parent1.generation, parent2?.generation ?? 0) + 1;
  
  // Inherit each trait
  for (const key of Object.keys(traits)) {
    const baseValue = isAsexual
      ? parent1.traits[key]
      : (parent1.traits[key] + parent2!.traits[key]) / 2;
    
    const min = key === 'size' ? 0.5 : 0.0;
    const max = key === 'size' ? 3.0 : 1.0;
    
    const { value, mutated } = mutateValue(
      baseValue,
      mutationConfig.traitRate,
      mutationConfig.traitMagnitude,
      min,
      max,
      rng
    );
    
    traits[key] = value;
    
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
  
  const offspring: Genome = {
    traits,
    visual: { color, bodyParts },
    parentIds: isAsexual ? null : [parent1.id, parent2!.id],
    generation,
    mutations: [...(parent1.mutations || []), ...mutations],
  };
  
  return {
    genome: offspring,
    hadTraitMutation: mutations.length > 0,
    hadColorMutation: color !== parent1.visual.color,
    hadBodyPartMutation: bodyParts.length !== parent1.visual.bodyParts.length,
  };
}
```

## How Evolution Emerges

Evolution is not programmed. It emerges from the interaction of four mechanisms:

### 1. Variation (Mutations)

Random mutations introduce differences between parent and offspring:

- Trait values shift slightly (±10%)
- Colors drift in LAB space
- Body parts can be added, removed, or modified

### 2. Selection (Death)

Death filters out unsuccessful trait combinations:

- Low energy efficiency → starvation
- Low speed → caught by predators
- Low vision → can't find food
- Poor combat traits → killed in fights

### 3. Inheritance (Reproduction)

Successful individuals pass traits to offspring:

- Sexual reproduction blends two parents
- Mutations add variation to inherited traits
- Generation counter tracks lineage depth

### 4. Time (Generations)

Patterns emerge over many generations:

- Successful traits become more common
- Unsuccessful traits disappear
- Populations adapt to environment
- Visual diversity increases

## Trade-offs

The genetics system creates natural trade-offs:

**Size:**
- Large: More health, more damage, more energy capacity
- Small: Lower energy consumption, harder to hit
- Trade-off: Power vs efficiency

**Speed:**
- Fast: Escape predators, catch prey
- Slow: Lower energy consumption
- Trade-off: Mobility vs efficiency

**Vision:**
- Long range: Detect threats and food earlier
- Short range: Lower energy consumption
- Trade-off: Awareness vs efficiency

**Body Parts:**
- More parts: More bonuses (vision, speed, damage)
- Fewer parts: Lower energy consumption
- Trade-off: Capability vs efficiency

## Success Criteria

Evolution is working when:

1. Offspring resemble parents
2. Variation increases over time
3. Unsuccessful traits disappear
4. Populations adapt to environment
5. Trade-offs exist (no single "best" strategy)
6. Visual diversity emerges
7. Performance maintains 60 FPS
8. Observable patterns in graphs
9. Engaging to watch
10. Deterministic (same seed = same evolution)

## Implementation Files

- `src/boids/genetics/phenotype.ts` - Phenotype computation
- `src/boids/genetics/inheritance.ts` - Genome inheritance and mutation
- `src/boids/vocabulary/schemas/genetics.ts` - Type definitions
- `src/boids/defaultPhysics.ts` - World physics constants
- `src/profiles/` - Species archetypes and configurations

## Further Reading

- [Architecture](ARCHITECTURE.md) - System design and patterns
- [Concurrency Models](CONCURRENCY.md) - Browser vs Worker engines

