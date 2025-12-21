import {z} from "zod";
import {
	deathMarkerSchema,
	foodSourceSchemas,
	obstacleSchema,
	simulationParametersSchema,
	speciesRecordSchema,
	worldConfigSchema
} from "./prelude.ts";

export const visualSettingsSchema = z.object({
	trailsEnabled: z.boolean(),
	energyBarsEnabled: z.boolean(),
	matingHeartsEnabled: z.boolean(),
	stanceSymbolsEnabled: z.boolean(),
	deathMarkersEnabled: z.boolean(),
	foodSourcesEnabled: z.boolean(),
});
const evolutionSnapshotSchema = z.object({
	tick: z.number(),
	timestamp: z.number(),
	populations: z.record(z.string(), z.number()),
	births: z.record(z.string(), z.number()),
	deaths: z.record(z.string(), z.number()),
	catches: z.record(z.string(), z.number()),
	avgEnergy: z.record(z.string(), z.number()),
	foodSources: z.object({
		prey: z.number(),
		predator: z.number(),
	}),
});
/**
 * Runtime Store - centralized state management
 * Organized in logical slices for separation of concerns
 *
 * Structure:
 * - config: Loaded profile (rarely changes after init)
 * - simulation: Dynamic world state (changes every frame)
 * - ui: User preferences (persists across profiles)
 * - analytics: Time-series data (resets per profile)
 */
export const runtimeStoreSchema = z.object({
	config: z.object({
		profileId: z.string(),
		world: worldConfigSchema,
		species: speciesRecordSchema,
		parameters: simulationParametersSchema,
	}),
	simulation: z.object({
		obstacles: z.array(obstacleSchema),
		foodSources: z.array(foodSourceSchemas),
		deathMarkers: z.array(deathMarkerSchema),
	}),
	ui: z.object({
		visualSettings: visualSettingsSchema,
	}),
	analytics: z.object({
		evolutionHistory: z.array(evolutionSnapshotSchema), // EvolutionSnapshot schema
		currentSnapshot: z.any().nullable(), // EvolutionSnapshot schema
	}),
});
export type RuntimeStore = z.infer<typeof runtimeStoreSchema>;
