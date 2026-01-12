# Boids Algorithm

This document explains the flocking algorithm and its extensions in Emergent Boids.

## Craig Reynolds' Original Work

In 1987, Craig Reynolds published "Flocks, Herds, and Schools: A Distributed Behavioral Model" at SIGGRAPH. His work demonstrated that realistic flocking behavior emerges from three simple rules applied locally by each agent.

**Key Insight:** Complex group behavior does not require centralized coordination. Each boid follows simple rules based on its local neighborhood, and sophisticated patterns emerge naturally.

**Original Paper:** Reynolds, C. W. (1987). Flocks, herds and schools: A distributed behavioral model. SIGGRAPH '87: Proceedings of the 14th annual conference on Computer graphics and interactive techniques, 25-34.

## The Three Original Rules

### 1. Separation

Steer to avoid crowding local flockmates.

**Purpose:** Prevent collisions and maintain personal space.

**Implementation:**

```typescript
export function separation(
  boid: Boid,
  neighbors: Boid[],
  config: BoidTypeConfig
): Vector2 {
  let steer = { x: 0, y: 0 };
  let count = 0;
  
  for (const other of neighbors) {
    const distance = vec.distance(boid.position, other.position);
    
    if (distance > 0 && distance < config.separationRadius) {
      // Calculate vector pointing away from neighbor
      const diff = vec.subtract(boid.position, other.position);
      const normalized = vec.normalize(diff);
      
      // Weight by distance (closer = stronger repulsion)
      const weighted = vec.divide(normalized, distance);
      steer = vec.add(steer, weighted);
      count++;
    }
  }
  
  if (count > 0) {
    steer = vec.divide(steer, count);
    
    // Implement Reynolds' steering formula
    if (vec.magnitude(steer) > 0) {
      steer = vec.normalize(steer);
      steer = vec.multiply(steer, boid.phenotype.maxSpeed);
      steer = vec.subtract(steer, boid.velocity);
      steer = vec.limit(steer, boid.phenotype.maxForce);
    }
  }
  
  return steer;
}
```

### 2. Alignment

Steer toward the average heading of local flockmates.

**Purpose:** Match velocity with neighbors to move as a cohesive group.

**Implementation:**

```typescript
export function alignment(
  boid: Boid,
  neighbors: Boid[],
  config: BoidTypeConfig
): Vector2 {
  let sum = { x: 0, y: 0 };
  let count = 0;
  
  for (const other of neighbors) {
    const distance = vec.distance(boid.position, other.position);
    
    if (distance > 0 && distance < config.alignmentRadius) {
      sum = vec.add(sum, other.velocity);
      count++;
    }
  }
  
  if (count > 0) {
    sum = vec.divide(sum, count);
    
    // Implement Reynolds' steering formula
    sum = vec.normalize(sum);
    sum = vec.multiply(sum, boid.phenotype.maxSpeed);
    const steer = vec.subtract(sum, boid.velocity);
    return vec.limit(steer, boid.phenotype.maxForce);
  }
  
  return { x: 0, y: 0 };
}
```

### 3. Cohesion

Steer toward the average position (center of mass) of local flockmates.

**Purpose:** Keep the flock together by moving toward the group center.

**Implementation:**

```typescript
export function cohesion(
  boid: Boid,
  neighbors: Boid[],
  config: BoidTypeConfig
): Vector2 {
  let sum = { x: 0, y: 0 };
  let count = 0;
  
  for (const other of neighbors) {
    const distance = vec.distance(boid.position, other.position);
    
    if (distance > 0 && distance < config.cohesionRadius) {
      sum = vec.add(sum, other.position);
      count++;
    }
  }
  
  if (count > 0) {
    sum = vec.divide(sum, count);
    return seek(boid, sum);  // Steer toward center of mass
  }
  
  return { x: 0, y: 0 };
}

function seek(boid: Boid, target: Vector2): Vector2 {
  const desired = vec.subtract(target, boid.position);
  const normalized = vec.normalize(desired);
  const scaled = vec.multiply(normalized, boid.phenotype.maxSpeed);
  const steer = vec.subtract(scaled, boid.velocity);
  return vec.limit(steer, boid.phenotype.maxForce);
}
```

## How Flocking Emerges

The three rules combine to produce realistic flocking:

1. **Separation** prevents collisions
2. **Alignment** synchronizes movement
3. **Cohesion** keeps the group together

Each boid applies these rules independently based on its local neighborhood. No central coordinator exists. The flock's behavior emerges from local interactions.

## Our Extensions

Emergent Boids extends Reynolds' work with additional rules and systems.

### 4. Fear (Prey Only)

Flee from approaching predators.

**Purpose:** Survival behavior for prey species.

**Implementation:**

```typescript
export function fear(
  boid: Boid,
  predators: Boid[],
  config: BoidTypeConfig
): Vector2 {
  let steer = { x: 0, y: 0 };
  let count = 0;
  
  for (const predator of predators) {
    const distance = vec.distance(boid.position, predator.position);
    
    if (distance > 0 && distance < config.fearRadius) {
      // Calculate vector pointing away from predator
      const diff = vec.subtract(boid.position, predator.position);
      const normalized = vec.normalize(diff);
      
      // Weight by distance (closer = stronger fear)
      const weighted = vec.divide(normalized, distance);
      steer = vec.add(steer, weighted);
      count++;
    }
  }
  
  if (count > 0) {
    steer = vec.divide(steer, count);
    steer = vec.normalize(steer);
    
    // Fear provides speed boost
    const fearBoost = 1.0 + boid.genome.traits.fearResponse;
    steer = vec.multiply(steer, boid.phenotype.maxSpeed * fearBoost);
    steer = vec.subtract(steer, boid.velocity);
    steer = vec.limit(steer, boid.phenotype.maxForce);
  }
  
  return steer;
}
```

### 5. Chase (Predators Only)

Pursue nearby prey.

**Purpose:** Hunting behavior for predator species.

**Implementation:**

```typescript
export function chase(
  boid: Boid,
  prey: Boid[],
  config: BoidTypeConfig
): Vector2 {
  let nearest: Boid | null = null;
  let nearestDistance = Infinity;
  
  // Find nearest prey
  for (const target of prey) {
    const distance = vec.distance(boid.position, target.position);
    
    if (distance < config.chaseRadius && distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }
  
  if (nearest) {
    // Predict prey position
    const prediction = vec.add(
      nearest.position,
      vec.multiply(nearest.velocity, 3)  // Look ahead 3 frames
    );
    
    return seek(boid, prediction);
  }
  
  return { x: 0, y: 0 };
}
```

### 6. Seek Food

Steer toward nearby food sources.

**Purpose:** Energy acquisition for survival.

**Implementation:**

```typescript
export function seekFood(
  boid: Boid,
  foodSources: FoodSource[],
  config: BoidTypeConfig
): Vector2 {
  let nearest: FoodSource | null = null;
  let nearestDistance = Infinity;
  
  for (const food of foodSources) {
    // Only seek food matching boid's role
    if (food.typeId !== boid.typeId) continue;
    
    const distance = vec.distance(boid.position, food.position);
    
    if (distance < config.foodDetectionRadius && distance < nearestDistance) {
      nearest = food;
      nearestDistance = distance;
    }
  }
  
  if (nearest) {
    return seek(boid, nearest.position);
  }
  
  return { x: 0, y: 0 };
}
```

### 7. Avoid Obstacles

Steer away from static obstacles.

**Purpose:** Environmental navigation.

**Implementation:**

```typescript
export function avoidObstacles(
  boid: Boid,
  obstacles: Obstacle[],
  config: BoidTypeConfig
): Vector2 {
  let steer = { x: 0, y: 0 };
  let count = 0;
  
  for (const obstacle of obstacles) {
    const distance = vec.distance(boid.position, obstacle.position);
    const avoidDistance = obstacle.radius + config.obstacleAvoidanceRadius;
    
    if (distance < avoidDistance) {
      const diff = vec.subtract(boid.position, obstacle.position);
      const normalized = vec.normalize(diff);
      
      // Weight by distance (closer = stronger avoidance)
      const weighted = vec.divide(normalized, distance);
      steer = vec.add(steer, weighted);
      count++;
    }
  }
  
  if (count > 0) {
    steer = vec.divide(steer, count);
    steer = vec.normalize(steer);
    steer = vec.multiply(steer, boid.phenotype.maxSpeed);
    steer = vec.subtract(steer, boid.velocity);
    steer = vec.limit(steer, boid.phenotype.maxForce);
  }
  
  return steer;
}
```

## Behavior Decision System

Boids don't apply all rules simultaneously. Instead, they make decisions based on their current stance and context.

### Stance System

Each boid has a stance that determines which rules apply:

```typescript
type Stance = 
  | 'idle'           // Wandering, low priority
  | 'flocking'       // Normal flocking behavior
  | 'fleeing'        // Prey fleeing from predators
  | 'hunting'        // Predators chasing prey
  | 'seeking_food'   // Looking for food sources
  | 'mating';        // Seeking reproduction partner
```

### Decision Logic

```typescript
export function evaluateBoidBehavior(
  boid: Boid,
  context: BoidUpdateContext,
  config: ConfigContext
): void {
  const { nearbyPredators, nearbyPrey, nearbyFlock, nearbyFood } = context;
  
  // Prey: Fear overrides everything
  if (boid.role === 'prey' && nearbyPredators.length > 0) {
    boid.stance = 'fleeing';
    applyForce(boid, fear(boid, nearbyPredators, config));
    return;
  }
  
  // Predators: Hunt if prey nearby
  if (boid.role === 'predator' && nearbyPrey.length > 0) {
    boid.stance = 'hunting';
    applyForce(boid, chase(boid, nearbyPrey, config));
    return;
  }
  
  // Low energy: Seek food
  if (boid.energy < boid.phenotype.maxEnergy * 0.3 && nearbyFood.length > 0) {
    boid.stance = 'seeking_food';
    applyForce(boid, seekFood(boid, nearbyFood, config));
    return;
  }
  
  // Ready to mate: Seek partner
  if (isReadyToMate(boid, config) && nearbyFlock.length > 0) {
    boid.stance = 'mating';
    const partner = findMatingPartner(boid, nearbyFlock);
    if (partner) {
      applyForce(boid, seek(boid, partner.position));
      return;
    }
  }
  
  // Default: Normal flocking
  boid.stance = 'flocking';
  const separation = separation(boid, nearbyFlock, config);
  const alignment = alignment(boid, nearbyFlock, config);
  const cohesion = cohesion(boid, nearbyFlock, config);
  
  applyForce(boid, vec.multiply(separation, config.separationWeight));
  applyForce(boid, vec.multiply(alignment, config.alignmentWeight));
  applyForce(boid, vec.multiply(cohesion, config.cohesionWeight));
}
```

## Combat System

Predators can attack prey when close enough.

### Attack Mechanics

```typescript
export function processPredatorAttack(
  predator: Boid,
  nearbyPrey: Boid[],
  config: ConfigContext
): void {
  // Check attack cooldown
  if (predator.attackCooldownFrames > 0) return;
  
  for (const prey of nearbyPrey) {
    const distance = vec.distance(predator.position, prey.position);
    
    if (distance < config.attackRange) {
      // Calculate damage
      const damage = predator.phenotype.attackDamage;
      const actualDamage = damage * (1 - prey.phenotype.defense);
      
      // Apply damage
      prey.health -= actualDamage;
      
      // Apply knockback
      const knockback = vec.subtract(prey.position, predator.position);
      const normalized = vec.normalize(knockback);
      const force = vec.multiply(normalized, config.knockbackForce);
      prey.velocity = vec.add(prey.velocity, force);
      
      // Set cooldown
      predator.attackCooldownFrames = config.attackCooldownFrames;
      
      // Check for death
      if (prey.health <= 0) {
        collectDeathEvent(prey, 'predation');
      }
      
      break;  // One attack per frame
    }
  }
}
```

### Health System

Health is separate from energy:

- **Energy** - Depletes from movement, vision, body parts
- **Health** - Depletes from combat damage
- **Death** - Occurs when either reaches zero

```typescript
// Health regeneration (slow, passive)
export function regenerateHealth(boid: Boid): void {
  if (boid.health < boid.phenotype.maxHealth) {
    boid.health += boid.phenotype.healthRegenRate;
    boid.health = Math.min(boid.health, boid.phenotype.maxHealth);
  }
}

// Healing from food (energy + health)
export function healFromFood(boid: Boid, energyGained: number): void {
  const healing = energyGained * 0.5;  // 50% of energy also heals
  boid.health += healing;
  boid.health = Math.min(boid.health, boid.phenotype.maxHealth);
}
```

## Genetic Influence on Behavior

Genetic traits affect how rules are applied:

### Speed and Force

```typescript
// From genome
const speed = genome.traits.speed;      // 0.0 - 1.0
const force = genome.traits.force;      // 0.0 - 1.0

// To phenotype
const maxSpeed = physics.maxSpeed * speed * (1 + bodyPartBonuses.speed);
const maxForce = physics.maxForce * force * (1 + bodyPartBonuses.turnRate);
```

### Vision Range

```typescript
const vision = genome.traits.vision;    // 0.0 - 1.0
const visionRange = physics.maxVisionRange * vision * (1 + bodyPartBonuses.vision);

// Affects neighbor detection
const neighbors = getNearbyBoids(spatialHash, boid.position, visionRange);
```

### Sociability

```typescript
const sociability = genome.traits.sociability;  // 0.0 - 1.0

// Affects flocking weights
const separationWeight = 1.5 - sociability * 0.5;  // 1.0 - 1.5
const alignmentWeight = 1.0 + sociability * 1.5;   // 1.0 - 2.5
const cohesionWeight = 1.0 + sociability * 2.0;    // 1.0 - 3.0

// Affects crowd tolerance
const crowdTolerance = 10 + sociability * 40;  // 10 - 50 boids
```

### Aggression

```typescript
const aggression = genome.traits.aggression;  // 0.0 - 1.0

// Affects attack damage (predators)
const attackDamage = baseDamage * (1 + aggression * 0.5);

// Affects chase priority (predators)
const chasePriority = aggression;
```

## Spatial Optimization

Neighbor queries use spatial hashing for O(n) complexity instead of O(n²).

### Spatial Hash

```typescript
export function createSpatialHash<T extends { position: Vector2 }>(
  width: number,
  height: number,
  cellSize: number
): SpatialHash<T> {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const cells: Map<string, T[]> = new Map();
  
  return {
    insert: (item: T) => {
      const cellX = Math.floor(item.position.x / cellSize);
      const cellY = Math.floor(item.position.y / cellSize);
      const key = `${cellX},${cellY}`;
      
      if (!cells.has(key)) {
        cells.set(key, []);
      }
      cells.get(key)!.push(item);
    },
    
    getNearby: (position: Vector2, radius: number): T[] => {
      const minX = Math.floor((position.x - radius) / cellSize);
      const maxX = Math.floor((position.x + radius) / cellSize);
      const minY = Math.floor((position.y - radius) / cellSize);
      const maxY = Math.floor((position.y + radius) / cellSize);
      
      const nearby: T[] = [];
      
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const key = `${x},${y}`;
          if (cells.has(key)) {
            nearby.push(...cells.get(key)!);
          }
        }
      }
      
      return nearby;
    },
    
    clear: () => cells.clear(),
  };
}
```

**Key Insight:** Cell size should equal perception radius for optimal performance.

## Toroidal World

The world wraps at edges (like Pac-Man).

### Toroidal Distance

```typescript
export function toroidalDistance(
  a: Vector2,
  b: Vector2,
  width: number,
  height: number
): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  
  const wrappedDx = Math.min(dx, width - dx);
  const wrappedDy = Math.min(dy, height - dy);
  
  return Math.sqrt(wrappedDx * wrappedDx + wrappedDy * wrappedDy);
}
```

### Toroidal Subtraction

```typescript
export function toroidalSubtract(
  a: Vector2,
  b: Vector2,
  width: number,
  height: number
): Vector2 {
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  
  if (Math.abs(dx) > width / 2) {
    dx = dx > 0 ? dx - width : dx + width;
  }
  
  if (Math.abs(dy) > height / 2) {
    dy = dy > 0 ? dy - height : dy + height;
  }
  
  return { x: dx, y: dy };
}
```

## Evolution of Behavior

Over generations, behavior patterns evolve through natural selection:

- **Fast boids** escape predators but consume more energy
- **Social boids** benefit from group protection but compete for food
- **Aggressive predators** catch more prey but risk injury
- **Efficient boids** survive food scarcity but may be slower

No behavior is universally optimal. Trade-offs create strategic diversity.

## Further Reading

- [Architecture](ARCHITECTURE.md) - System design and patterns
- [Genetics System](GENETICS.md) - How traits are inherited
- [Concurrency Models](CONCURRENCY.md) - Browser vs Worker engines
- Reynolds, C. W. (1987). Flocks, herds and schools: A distributed behavioral model. SIGGRAPH '87.
- Reynolds' website: https://www.red3d.com/cwr/boids/

