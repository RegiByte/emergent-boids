import { BoidUpdateContext } from "@/boids/context";
import { ruleKeywords, stanceKeywords } from "./vocabulary/keywords";
import { Boid } from "./vocabulary/schemas/entities";
import type {
  BoidStance,
  Rule,
  Vector2,
} from "./vocabulary/schemas/primitives";
import * as rules from "./rules";

type ImportanceFn = (boid: Boid, context: BoidUpdateContext) => number;
type Predicate = (boid: Boid, context: BoidUpdateContext) => boolean;

type EffectiveForce = {
  rule: Rule;
  importance: number | ImportanceFn;
  // Conditional rule execution
  predicate?: Predicate;
};
type EffectiveForceMap = {
  // eslint-disable-next-line no-unused-vars
  [key in BoidStance]: EffectiveForce[];
};

const defaultSeparation = {
  rule: ruleKeywords.separation,
  importance: 1.0,
} as const satisfies EffectiveForce;

const boidStanceEffectiveForces = {
  [stanceKeywords.flocking]: [defaultSeparation],
  [stanceKeywords.seeking_mate]: [
    defaultSeparation,
    // Session 128: CRITICAL - Must include seekMate rule to move towards mate!
    { rule: ruleKeywords.seekMate, importance: 3.0 }, // High importance to reach mate
  ],
  [stanceKeywords.mating]: [
    defaultSeparation,
    // Session 128: Keep close to mate during mating buildup
    { rule: ruleKeywords.seekMate, importance: 2.5 }, // Stay close but allow some movement
  ],
  [stanceKeywords.hunting]: [defaultSeparation],
  [stanceKeywords.eating]: [defaultSeparation],
  [stanceKeywords.idle]: [defaultSeparation],
} as EffectiveForceMap;

type MovementForceExecutor = (
  boid: Boid,
  context: BoidUpdateContext
) => Vector2;

type MovementForces =
  | typeof ruleKeywords.separation
  | typeof ruleKeywords.alignment
  | typeof ruleKeywords.cohesion
  | typeof ruleKeywords.avoidObstacles
  | typeof ruleKeywords.chase
  | typeof ruleKeywords.seekMate
  | typeof ruleKeywords.avoidDeathMarkers;

type MovementForceExecutorMap = Record<MovementForces, MovementForceExecutor>;

const ruleExecutors = {
  [ruleKeywords.separation]: (boid: Boid, context: BoidUpdateContext) =>
    rules.separation(boid, context),
  [ruleKeywords.alignment]: (boid: Boid, context: BoidUpdateContext) =>
    rules.alignment(boid, context),
  [ruleKeywords.cohesion]: (boid: Boid, context: BoidUpdateContext) =>
    rules.cohesion(boid, context),
  [ruleKeywords.avoidObstacles]: (boid: Boid, context: BoidUpdateContext) =>
    rules.avoidObstacles(boid, context),
  [ruleKeywords.chase]: (boid: Boid, context: BoidUpdateContext) =>
    rules.chase(boid, context),
  [ruleKeywords.seekMate]: (boid: Boid, context: BoidUpdateContext) =>
    rules.seekMate(boid, context),
  [ruleKeywords.avoidDeathMarkers]: (boid: Boid, context: BoidUpdateContext) =>
    rules.avoidDeathMarkers(boid, context),
} as const satisfies MovementForceExecutorMap;

export function getStanceMovementForces(
  boid: Boid,
  context: BoidUpdateContext
) {
  const stance = boid.stance;
  // Get the effective forces for the stance
  const effectiveForces = boidStanceEffectiveForces[stance];
  const totalImportance = effectiveForces.reduce((acc, effectiveForce) => {
    const importance =
      typeof effectiveForce.importance === "function"
        ? effectiveForce.importance(boid, context)
        : effectiveForce.importance;
    return acc + importance;
  }, 0);

  return effectiveForces.map((eForce) => {
    if (!(eForce.rule in ruleExecutors)) {
      throw new Error(`Unknown rule: ${eForce.rule}`);
    }
    const importance =
      typeof eForce.importance === "function"
        ? eForce.importance(boid, context)
        : eForce.importance;
    const executor = ruleExecutors[eForce.rule as keyof typeof ruleExecutors];
    const forceVector = executor(boid, context as BoidUpdateContext);

    const normalizedImportance = importance / totalImportance;

    return {
      rule: eForce.rule,
      force: forceVector,
      weight: normalizedImportance,
    };
  });
}
