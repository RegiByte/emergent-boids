export type Vector2 = {
  x: number;
  y: number;
};

export type BoidRole = "predator" | "prey";

export type PreyStance = "flocking" | "seeking_mate" | "mating" | "fleeing";
export type PredatorStance = "hunting" | "seeking_mate" | "mating" | "idle" | "eating";
export type BoidStance = PreyStance | PredatorStance;

export type Boid = {
  id: string;
  position: Vector2;
  velocity: Vector2;
  acceleration: Vector2;
  typeId: string;
  energy: number;
  age: number; // Age in seconds
  reproductionCooldown: number; // Time passages until can reproduce again (0 = ready)
  seekingMate: boolean; // Is actively seeking a mate
  mateId: string | null; // ID of current mate (if paired)
  matingBuildupCounter: number; // Time passages spent close to mate (0-3, reproduce at 3)
  eatingCooldown: number; // Time passages until can catch prey again (predators only)
  stance: BoidStance; // Current behavioral stance
  previousStance: BoidStance | null; // Previous stance (for returning from fleeing)
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
  minDistance: number; // Minimum distance between boids (hard constraint)
  maxBoids: number; // Global population cap (safety limit)
  maxPreyBoids: number; // Per-role cap for prey
  maxPredatorBoids: number; // Per-role cap for predators
  minReproductionAge: number; // Minimum age to start reproducing (seconds)
  reproductionEnergyThreshold: number; // Energy % needed to seek mates (0-1)
  reproductionCooldownTicks: number; // Time passages before can reproduce again
  matingBuildupTicks: number; // Time passages needed close to mate before reproducing
  eatingCooldownTicks: number; // Time passages predator must wait after eating
  types: Record<string, BoidTypeConfig>;
};
