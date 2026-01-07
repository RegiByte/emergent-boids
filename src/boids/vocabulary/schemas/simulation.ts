import { simulationKeywords } from "../keywords";
import z from "zod";
import { boidSchema, foodSourceSchema, obstacleSchema } from "./entities";
import {
  deathCauseSchema,
  renderModeSchema,
  roleSchema,
  stanceSchema,
  vectorSchema,
} from "./primitives";

export const simulationCommandSchema = z.discriminatedUnion("type", [
  // Simulation commands
  z.object({
    type: z.literal(simulationKeywords.commands.start),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.pause),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.resume),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.step),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.setTimeScale),
    timeScale: z.number(),
  }),
  // Boid commands
  z.object({
    type: z.literal(simulationKeywords.commands.addBoid),
    boid: boidSchema,
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.removeBoid),
    boidId: z.string(),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.followBoid),
    boidId: z.string(),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.stopFollowingBoid),
    boidId: z.string(),
  }),
  // Environment commands
  z.object({
    type: z.literal(simulationKeywords.commands.addObstacle),
    obstacle: obstacleSchema,
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.clearObstacle),
    obstacleId: z.string(),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.clearAllObstacles),
  }),
  // UI/UX commands
  z.object({
    type: z.literal(simulationKeywords.commands.toggleTrails),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.toggleEnergyBar),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.toggleMatingHearts),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.toggleStanceSymbols),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.setRendererMode),
    rendererMode: renderModeSchema,
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.spawnFood),
    position: vectorSchema,
    energy: z.number(),
    sourceType: roleSchema,
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.clearFood),
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.spawnObstacle),
    position: vectorSchema,
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.spawnPredator),
    position: vectorSchema,
  }),
  z.object({
    type: z.literal(simulationKeywords.commands.clearDeathMarkers),
  }),
]);

export type SimulationCommand = z.infer<typeof simulationCommandSchema>;

export const simulationEventSchema = z.discriminatedUnion("type", [
  // Simulation events
  z.object({
    type: z.literal(simulationKeywords.events.initialized),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.updated),
    frame: z.number(),
    simulationTime: z.number(),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.error),
    error: z.string(),
    meta: z.any(),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.timeScaleChanged),
    timeScale: z.number(),
  }),
  // Boid events
  z.object({
    type: z.literal(simulationKeywords.events.boidsDied),
    boids: z.array(
      z.object({
        id: z.string(),
        typeId: z.string(), // Species ID for analytics
        reason: deathCauseSchema, // old_age | starvation | predation
        position: vectorSchema, // For death marker placement
      })
    ),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.boidsCaught),
    catches: z.array(
      z.object({
        predatorId: z.string(), // Who caught
        preyId: z.string(), // Who was caught
        preyTypeId: z.string(), // Species of prey for analytics
        position: vectorSchema, // Where catch happened (for food spawning)
      })
    ),
  }),

  z.object({
    type: z.literal(simulationKeywords.events.boidsReproduced),
    boids: z.array(
      z.object({
        parentId1: z.string(),
        parentId2: z.string().optional(), // may be asexual reproduction
        offspring: z.array(boidSchema),
      })
    ),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.boidsStanceChanged),
    boids: z.array(
      z.object({
        id: z.string(),
        oldStance: stanceSchema,
        newStance: stanceSchema,
      })
    ),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.workerStateUpdated),
    updates: z.array(boidSchema.partial()),
  }),
  // Environment events
  z.object({
    type: z.literal(simulationKeywords.events.foodSourcesCreated),
    foodSources: z.array(foodSourceSchema),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.foodSourcesUpdated),
    foodSources: z.array(foodSourceSchema),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.foodSourceConsumed),
    foodSourceId: z.string(),
    boidId: z.string(),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.obstaclesAdded),
    obstacles: z.array(obstacleSchema),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.obstaclesUpdated),
    obstacles: z.array(obstacleSchema),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.obstaclesRemoved),
    obstacleIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal(simulationKeywords.events.obstaclesCleared),
  }),
]);

export type SimulationEvent = z.infer<typeof simulationEventSchema>;
