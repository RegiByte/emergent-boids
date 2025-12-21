import {z} from "zod";
import {eventKeywords} from "../keywords.ts";
import {foodSourceSchemas} from "./prelude.ts";

export const controlEventSchemas = {
	setTypeConfig: z.object({
		type: z.literal(eventKeywords.controls.typeConfigChanged),
		typeId: z.string(),
		field: z.enum([
			"separationWeight",
			"alignmentWeight",
			"cohesionWeight",
			"maxSpeed",
			"maxForce",
		]),
		value: z.number(),
	}),
	setPerceptionRadius: z.object({
		type: z.literal(eventKeywords.controls.perceptionRadiusChanged),
		value: z.number(),
	}),
	setObstacleAvoidance: z.object({
		type: z.literal(eventKeywords.controls.obstacleAvoidanceChanged),
		value: z.number(),
	}),
};
export const obstacleEventSchemas = {
	addObstacle: z.object({
		type: z.literal(eventKeywords.obstacles.added),
		x: z.number(),
		y: z.number(),
		radius: z.number(),
	}),
	removeObstacle: z.object({
		type: z.literal(eventKeywords.obstacles.removed),
		index: z.number(),
	}),
	clearObstacles: z.object({
		type: z.literal(eventKeywords.obstacles.cleared),
	}),
};
export const timeEventSchemas = {
	passage: z.object({
		type: z.literal(eventKeywords.time.passage),
		deltaMs: z.number(),
	}),
};
export const boidEventSchemas = {
	caught: z.object({
		type: z.literal(eventKeywords.boids.caught),
		predatorId: z.string(),
		preyId: z.string(),
		preyTypeId: z.string(), // Type of prey that was caught (for death tracking)
		preyEnergy: z.number(), // Energy of prey at time of catch
		preyPosition: z.object({x: z.number(), y: z.number()}), // Position where prey was caught
	}),
	died: z.object({
		type: z.literal(eventKeywords.boids.died),
		boidId: z.string(),
		typeId: z.string(), // Include typeId so analytics can track deaths by species
		reason: z.enum(["old_age", "starvation", "predation"]), // How the boid died
	}),
	reproduced: z.object({
		type: z.literal(eventKeywords.boids.reproduced),
		parentId: z.string(),
		childId: z.string(),
		typeId: z.string(),
		offspringCount: z.number(), // Total offspring spawned (1-2 for twins)
	}),
	spawnPredator: z.object({
		type: z.literal(eventKeywords.boids.spawnPredator),
		x: z.number(),
		y: z.number(),
	}),
	foodSourceCreated: z.object({
		type: z.literal(eventKeywords.boids.foodSourceCreated),
		foodSource: foodSourceSchemas,
	}),
};
// Union of all control events
export const controlEventSchema = z.discriminatedUnion("type", [
	controlEventSchemas.setTypeConfig,
	controlEventSchemas.setPerceptionRadius,
	controlEventSchemas.setObstacleAvoidance,
]);
// Union of all obstacle events
export const obstacleEventSchema = z.discriminatedUnion("type", [
	obstacleEventSchemas.addObstacle,
	obstacleEventSchemas.removeObstacle,
	obstacleEventSchemas.clearObstacles,
]);
// Union of all time events
export const timeEventSchema = z.discriminatedUnion("type", [
	timeEventSchemas.passage,
]);
// Union of all boid events
export const boidEventSchema = z.discriminatedUnion("type", [
	boidEventSchemas.caught,
	boidEventSchemas.died,
	boidEventSchemas.reproduced,
	boidEventSchemas.spawnPredator,
	boidEventSchemas.foodSourceCreated,
]);
// Union of all events
export const allEventSchema = z.union([
	controlEventSchema,
	obstacleEventSchema,
	timeEventSchema,
	boidEventSchema,
]);
export type ControlEvent = z.infer<typeof controlEventSchema>;
export type ObstacleEvent = z.infer<typeof obstacleEventSchema>;
export type TimeEvent = z.infer<typeof timeEventSchema>;
export type BoidEvent = z.infer<typeof boidEventSchema>;
export type AllEvents = z.infer<typeof allEventSchema>;
