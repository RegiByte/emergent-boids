import { z } from "zod";
import {
  deathMarkerSchema,
  foodSourceSchemas,
  obstacleSchema,
  simulationParametersSchema,
  speciesRecordSchema,
  worldConfigSchema,
} from "./prelude.ts";

/**
 * State Schemas - Runtime state management
 *
 * Defines the structure of the centralized RuntimeStore.
 * Organized into logical slices for separation of concerns.
 */

// ============================================
// Evolution Snapshot Schema
// ============================================

/**
 * Evolution Snapshot - Time-series data point
 *
 * Captures population statistics at a specific moment.
 * Used for graphs and analytics tracking.
 */
const evolutionSnapshotSchema = z.object({
  tick: z.number(), // Simulation tick number
  timestamp: z.number(), // Real-world timestamp (ms since epoch)
  populations: z.record(z.string(), z.number()), // Current population per species
  births: z.record(z.string(), z.number()), // Births since last snapshot per species
  deaths: z.record(z.string(), z.number()), // Deaths since last snapshot per species
  catches: z.record(z.string(), z.number()), // Catches by predator species
  avgEnergy: z.record(z.string(), z.number()), // Average energy per species
  foodSources: z.object({
    prey: z.number(), // Count of prey food sources
    predator: z.number(), // Count of predator food sources
  }),
});

// ============================================
// Visual Settings Schema
// ============================================

/**
 * Visual Settings - User preferences for rendering
 *
 * Controls what visual elements are displayed.
 * Persists across profile changes.
 */
export const visualSettingsSchema = z.object({
  trailsEnabled: z.boolean(), // Show motion trails behind boids
  energyBarsEnabled: z.boolean(), // Show energy bars for prey
  matingHeartsEnabled: z.boolean(), // Show hearts between mating pairs
  stanceSymbolsEnabled: z.boolean(), // Show emoji indicators for boid stances
  deathMarkersEnabled: z.boolean(), // Show skull markers where boids died
  foodSourcesEnabled: z.boolean(), // Show food source indicators
});

// ============================================
// Runtime Store Schema
// ============================================

/**
 * Runtime Store - Centralized state management
 *
 * Organized into logical slices based on change frequency and purpose:
 *
 * **config** - Loaded from profile (rarely changes after initialization)
 *   - profileId: Which profile is currently loaded
 *   - world: Physical dimensions and initial conditions
 *   - species: All species configurations
 *   - parameters: Global simulation rules
 *
 * **simulation** - Dynamic world state (changes every frame)
 *   - obstacles: Physical barriers in the environment
 *   - foodSources: Available energy sources
 *   - deathMarkers: Danger zones from deaths
 *
 * **ui** - User preferences (persists across profile changes)
 *   - visualSettings: What to render
 *
 * **analytics** - Time-series data (resets when profile changes)
 *   - evolutionHistory: Historical snapshots for graphs
 *   - currentSnapshot: Latest statistics
 *
 * This structure enables:
 * - React optimization (subscribe to specific slices)
 * - Clear separation of concerns
 * - Easy state persistence
 */
export const runtimeStoreSchema = z.object({
  config: z.object({
    profileId: z.string(), // Currently loaded profile ID
    world: worldConfigSchema, // World dimensions and initial populations
    species: speciesRecordSchema, // All species in this simulation
    parameters: simulationParametersSchema, // Global rules
  }),
  simulation: z.object({
    obstacles: z.array(obstacleSchema), // Physical barriers
    foodSources: z.array(foodSourceSchemas), // Available energy
    deathMarkers: z.array(deathMarkerSchema), // Danger zones
  }),
  ui: z.object({
    visualSettings: visualSettingsSchema, // Rendering preferences
  }),
  analytics: z.object({
    evolutionHistory: z.array(evolutionSnapshotSchema), // Historical data for graphs
    currentSnapshot: z.any().nullable(), // Latest snapshot (nullable during init)
  }),
});

export type RuntimeStore = z.infer<typeof runtimeStoreSchema>;
