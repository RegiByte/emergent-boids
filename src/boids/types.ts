export type Vector2 = {
  x: number;
  y: number;
};

export type BoidRole = "predator" | "prey";

export type Boid = {
  id: string;
  position: Vector2;
  velocity: Vector2;
  acceleration: Vector2;
  typeId: string;
  energy: number;
  age: number; // Age in seconds
};

export type Obstacle = {
  position: Vector2;
  radius: number;
};

export type BoidTypeConfig = {
  id: string;
  name: string;
  color: string;
  role: BoidRole;
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  maxSpeed: number;
  maxForce: number;
  fearFactor: number; // How strongly this type responds to fear (0-1)
  maxEnergy: number; // Maximum energy before reproduction
  energyGainRate: number; // Energy gained per second (prey) or per catch (predator)
  energyLossRate: number; // Energy lost per second (predators only)
  maxAge: number; // Maximum lifespan in seconds (0 = immortal)
};

export type BoidConfig = {
  count: number;
  perceptionRadius: number;
  obstacleAvoidanceWeight: number;
  canvasWidth: number;
  canvasHeight: number;
  fearRadius: number; // How far prey can sense predators
  chaseRadius: number; // How far predators can sense prey
  catchRadius: number; // How close predator must be to catch prey
  mateRadius: number; // How close prey must be to reproduce
  maxBoids: number; // Population cap
  types: Record<string, BoidTypeConfig>;
};
