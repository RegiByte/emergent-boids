import {z} from "zod";
import {effectKeywords} from "../keywords.ts";
import {allEventSchema} from "./events.ts";
import {runtimeStoreSchema} from "./state.ts";

export const controlEffectSchemas = {
	stateUpdate: z.object({
		type: z.literal(effectKeywords.state.update),
		state: runtimeStoreSchema.partial(),
	}),
	timerSchedule: z.object({
		type: z.literal(effectKeywords.timer.schedule),
		id: z.string(),
		delayMs: z.number(),
		onExpire: allEventSchema,
	}),
	timerCancel: z.object({
		type: z.literal(effectKeywords.timer.cancel),
		id: z.string(),
	}),
	engineAddBoid: z.object({
		type: z.literal(effectKeywords.engine.addBoid),
		boid: z.object({
			id: z.string(),
			position: z.object({x: z.number(), y: z.number()}),
			velocity: z.object({x: z.number(), y: z.number()}),
			acceleration: z.object({x: z.number(), y: z.number()}),
			typeId: z.string(),
			energy: z.number(),
			age: z.number(),
			reproductionCooldown: z.number(),
			seekingMate: z.boolean(),
			mateId: z.string().nullable(),
			matingBuildupCounter: z.number(),
			eatingCooldown: z.number(),
			stance: z.union([
				z.literal("flocking"),
				z.literal("seeking_mate"),
				z.literal("mating"),
				z.literal("fleeing"),
				z.literal("hunting"),
				z.literal("idle"),
				z.literal("eating"),
			]),
			previousStance: z.union([
				z.literal("flocking"),
				z.literal("seeking_mate"),
				z.literal("mating"),
				z.literal("fleeing"),
				z.literal("hunting"),
				z.literal("idle"),
				z.null(),
			]),
			positionHistory: z.array(z.object({x: z.number(), y: z.number()})),
		}),
	}),
	engineRemoveBoid: z.object({
		type: z.literal(effectKeywords.engine.removeBoid),
		boidId: z.string(),
	}),
};
// Union of all control effects
export const controlEffectSchema = z.discriminatedUnion("type", [
	controlEffectSchemas.stateUpdate,
	controlEffectSchemas.timerSchedule,
	controlEffectSchemas.timerCancel,
	controlEffectSchemas.engineAddBoid,
	controlEffectSchemas.engineRemoveBoid,
]);
export const runtimeEffectSchemas = {
	dispatch: z.object({
		type: z.literal(effectKeywords.runtime.dispatch),
		event: allEventSchema,
	}),
};
// Union of all runtime effects
export const runtimeEffectSchema = z.discriminatedUnion("type", [
	runtimeEffectSchemas.dispatch,
]);
export const allEffectSchema = z.union([
	controlEffectSchema,
	runtimeEffectSchema,
]);
export type ControlEffect = z.infer<typeof controlEffectSchema>;
export type AllEffects = z.infer<typeof allEffectSchema>;
