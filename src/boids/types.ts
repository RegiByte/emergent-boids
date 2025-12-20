export type Vector2 = {
  x: number;
  y: number;
};

export type Boid = {
  position: Vector2;
  velocity: Vector2;
  acceleration: Vector2;
  typeId: string;
};

export type Obstacle = {
  position: Vector2;
  radius: number;
};

export type BoidTypeConfig = {
  id: string;
  name: string;
  color: string;
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  maxSpeed: number;
  maxForce: number;
};

export type BoidConfig = {
  count: number;
  perceptionRadius: number;
  obstacleAvoidanceWeight: number;
  canvasWidth: number;
  canvasHeight: number;
  types: Record<string, BoidTypeConfig>;
};
