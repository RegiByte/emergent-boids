import {z} from "zod";

export const foodSourceSchemas = z.object({
	id: z.string(), // Unique identifier
	position: z.object({x: z.number(), y: z.number()}),
	energy: z.number(), // Current energy remaining
	maxEnergy: z.number(), // Initial energy (for visual scaling)
	sourceType: z.enum(["prey", "predator"]), // What type of boid can eat this
	createdTick: z.number(), // When created (for tracking age)
});
export type FoodSource = z.infer<typeof foodSourceSchemas>;
const speciesRoleSchema = z.enum(["predator", "prey"]);
const reproductionTypeSchema = z.enum(["sexual", "asexual"]);
// Species Configuration - defines behavior and characteristics of a species
// Replaces the old BoidTypeConfig with clearer logical groupings
export const speciesConfigSchema = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string(),
	role: speciesRoleSchema,
	// Movement behavior
	movement: z.object({
		minDistance: z.number().optional(), // overrides global minDistance
		separationWeight: z.number(),
		alignmentWeight: z.number(),
		cohesionWeight: z.number(),
		maxSpeed: z.number(),
		maxForce: z.number(),
		trailLength: z.number(),
	}),
	// Energy and lifecycle
	lifecycle: z.object({
		maxEnergy: z.number(),
		energyGainRate: z.number(), // Energy gained per second (prey) or per catch (predator)
		energyLossRate: z.number(), // Energy lost per second (predators only)
		maxAge: z.number(), // Maximum lifespan in seconds (0 = immortal)
		fearFactor: z.number(), // How strongly this type responds to fear (0-1)
	}),
	// Reproduction behavior
	reproduction: z.object({
		type: reproductionTypeSchema, // Sexual (needs mate) or asexual (solo)
		offspringCount: z.number(), // Number of offspring per reproduction (1-2)
		offspringEnergyBonus: z.number(), // Extra energy % for offspring (0-1)
		cooldownTicks: z.number().optional(), // Optional: Override global reproduction cooldown
	}),
	// Species-specific limits and overrides
	limits: z.object({
		maxPopulation: z.number().optional(), // Optional: Maximum population for this specific type
		fearRadius: z.number().optional(), // Optional: Override global fear radius for this type
	}),
});
export const speciesRecordSchema = z.record(z.string(), speciesConfigSchema);
// Death marker schema - marks locations where boids died from starvation or old age
// Markers consolidate nearby deaths (100px radius) and accumulate strength
export const deathMarkerSchema = z.object({
	position: z.object({x: z.number(), y: z.number()}),
	remainingTicks: z.number(), // Countdown timer (decreases each time:passage)
	strength: z.number(), // Repulsive force strength (increases with nearby deaths)
	maxLifetimeTicks: z.number(), // Maximum lifetime (20 ticks, prevents immortal markers)
	typeId: z.string(), // Type of boid that died (for color)
});
// Simulation parameters schema - global rules that govern all species
export const simulationParametersSchema = z.object({
	// Perception and interaction radii
	perceptionRadius: z.number(),
	obstacleAvoidanceWeight: z.number(),
	fearRadius: z.number(), // How far prey can sense predators
	chaseRadius: z.number(), // How far predators can sense prey
	catchRadius: z.number(), // How close predator must be to catch prey
	mateRadius: z.number(), // How close boids must be to reproduce
	minDistance: z.number(), // Minimum distance between boids (prevents overlap)

	// Population limits
	maxBoids: z.number(), // Global population cap (safety limit)
	maxPreyBoids: z.number(), // Per-role cap for prey
	maxPredatorBoids: z.number(), // Per-role cap for predators

	// Lifecycle parameters
	minReproductionAge: z.number(), // Minimum age to start reproducing (seconds)
	reproductionEnergyThreshold: z.number(), // Energy % needed to seek mates (0-1)
	reproductionCooldownTicks: z.number(), // Time passages before can reproduce again
	matingBuildupTicks: z.number(), // Time passages needed close to mate before reproducing
	eatingCooldownTicks: z.number(), // Time passages predator must wait after eating
});
// World configuration schema - physical dimensions and initial conditions
export const worldConfigSchema = z.object({
	canvasWidth: z.number(),
	canvasHeight: z.number(),
	initialPreyCount: z.number(),
	initialPredatorCount: z.number().optional(),
});
// Obstacle schema - physical barriers in the environment
// all boids avoid obstacles
export const obstacleSchema = z.object({
	position: z.object({x: z.number(), y: z.number()}),
	radius: z.number(),
});
/**
 * Simulation Profile - a complete preset for a simulation scenario
 *
 * Profiles are immutable and can be shared, saved, and loaded.
 * Think of them as "game levels" or "experimental conditions".
 */
export const simulationProfileSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	world: worldConfigSchema,
	species: speciesRecordSchema,
	parameters: simulationParametersSchema,
});
export type SimulationParameters = z.infer<typeof simulationParametersSchema>;
export type SimulationProfile = z.infer<typeof simulationProfileSchema>;
export type WorldConfig = z.infer<typeof worldConfigSchema>;
export type SpeciesRecord = z.infer<typeof speciesRecordSchema>;
export type DeathMarker = z.infer<typeof deathMarkerSchema>;
export type SpeciesRole = z.infer<typeof speciesRoleSchema>;
export type ReproductionType = z.infer<typeof reproductionTypeSchema>;
export type SpeciesConfig = z.infer<typeof speciesConfigSchema>;
