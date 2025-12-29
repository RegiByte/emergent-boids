import { z } from "zod";
import {
  deathMarkerSchema,
  foodSourceSchemas,
  obstacleSchema,
  simulationParametersSchema,
  speciesRecordSchema,
  worldConfigSchema,
} from "./prelude.ts";
import { evolutionSnapshotSchema } from "@/boids/vocabulary/schemas/evolution.ts";
import { allEventSchema } from "./events.ts";

/**
 * State Schemas - Runtime state management
 *
 * Defines the structure of the centralized RuntimeStore.
 * Organized into logical slices for separation of concerns.
 */
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
  healthBarsEnabled: z.boolean(), // Show health bars for wounded boids

  // Atmosphere settings - environmental mood and visual effects
  atmosphere: z.object({
    // Base settings (user-controlled defaults)
    base: z.object({
      trailAlpha: z.number().min(0).max(1), // Background transparency for trails
      fogColor: z.string(), // Base fog color
      fogIntensity: z.number().min(0).max(1), // How far fog extends inward
      fogOpacity: z.number().min(0).max(1).default(0.6), // Fog opacity
    }),

    // Current active event (null = using base settings)
    activeEvent: z
      .object({
        eventType: z.string(), // Type of atmospheric event
        settings: z.object({
          trailAlpha: z.number(), // Override trail alpha
          fogColor: z.string(), // Override fog color
          fogIntensity: z.number().optional(), // Override fog intensity
          fogOpacity: z.number().optional(), // Override fog opacity
        }),
        startedAt: z.number(), // Timestamp when event started
        minDurationTicks: z.number(), // Minimum duration before override allowed
      })
      .nullable()
      .default(null),
  }),
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
 * Note: Analytics data has been moved to a separate analyticsStore
 * to prevent race conditions with event handling.
 *
 * This structure enables:
 * - React optimization (subscribe to specific slices)
 * - Clear separation of concerns
 * - Easy state persistence
 */
export const runtimeStoreSchema = z.object({
  config: z.object({
    profileId: z.string(), // Currently loaded profile ID
    randomSeed: z.string().optional(), // Master seed for reproducible randomness
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
    sidebarOpen: z.boolean(), // Whether the sidebar is open
    headerCollapsed: z.boolean(), // Whether the header navbar is collapsed
  }),
});

/**
 * Analytics Store Schema
 *
 * Separate store for analytics data to prevent race conditions with runtime state.
 * Each domain follows the pattern: { data, config }
 *
 * Domains:
 * - events: Recent event tracking with filtering
 * - evolution: Population snapshots over time
 * - genetics: (future) Trait evolution and lineage tracking
 * - ml: (future) Machine learning models and predictions
 */
export const analyticsStoreSchema = z.object({
  // Events domain - tracks recent simulation events
  events: z.object({
    data: z.object({
      recentEvents: z.array(
        z.object({
          id: z.string(), // Unique event ID
          timestamp: z.number(), // Real-world timestamp (for display)
          tick: z.number(), // Simulation tick (for aggregation)
          event: allEventSchema, // The event data
        })
      ),
    }),
    config: z.object({
      // Default filter (always active as baseline)
      defaultFilter: z.object({
        maxEvents: z.number().int().min(10).max(500), // Max events to track
        allowedEventTypes: z.array(z.string()).nullable(), // null = all events
      }),
      // Custom filter (user override, null = use default)
      customFilter: z
        .object({
          maxEvents: z.number().int().min(10).max(500).optional(),
          allowedEventTypes: z.array(z.string()).nullable().optional(),
        })
        .nullable(),
    }),
  }),

  // Evolution domain - tracks population dynamics over time
  evolution: z.object({
    data: z.object({
      evolutionHistory: z.array(evolutionSnapshotSchema), // Historical data for graphs
      currentSnapshot: evolutionSnapshotSchema.nullable(), // Latest snapshot (nullable during init)
    }),
    config: z.object({
      snapshotInterval: z.number().int().min(1).default(3), // Ticks between snapshots
      maxSnapshots: z.number().int().min(10).max(10000).default(1000), // Max history length
    }),
  }),
});

export type AnalyticsStore = z.infer<typeof analyticsStoreSchema>;
export type RuntimeStore = z.infer<typeof runtimeStoreSchema>;
export type VisualSettings = z.infer<typeof visualSettingsSchema>;
