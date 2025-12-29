import { defineResource } from "braided";
import { eventKeywords } from "../boids/vocabulary/keywords";
import type { BoidEngine } from "./engine";
import type { RuntimeController } from "./runtimeController";
import type { RuntimeStoreResource } from "./runtimeStore";
import type { AnalyticsStoreResource } from "./analyticsStore";
import {
  getStanceDistributionBySpecies,
  computeEnergyStatsBySpecies,
  computeAgeDistributionBySpecies,
  computeSpatialPatternsBySpecies,
  computeReproductionMetricsBySpecies,
  computeFoodSourceStatsByType,
  computeDeathMarkerStats,
} from "@/boids/analytics/statistics";
import { computeGeneticsStatsBySpecies } from "@/boids/analytics/genetics";
import { EvolutionSnapshot } from "@/boids/vocabulary/schemas/evolution.ts";
import { LifecycleManagerResource } from "./lifecycleManager";

/**
 * Analytics Resource
 *
 * Observes the event loop and tracks comprehensive ecosystem metrics over time.
 * Runs independently of UI rendering - always collecting data.
 *
 * Now captures rich data for AI training:
 * - Population dynamics with death cause breakdown
 * - Energy statistics (mean, stdDev, min, max)
 * - Age distribution (young, mature, elder)
 * - Spatial patterns (clustering, dispersion)
 * - Reproduction metrics (ready, seeking, mating)
 * - Environmental state (food, markers, obstacles)
 * - Configuration snapshot (active parameters)
 *
 * Responsibilities:
 * - Track births/deaths/catches per species
 * - Capture evolution snapshots every N ticks
 * - Calculate comprehensive statistics
 * - Update analytics slice in runtime store
 * - Manage snapshot history (max 1000 records)
 */
export const analytics = defineResource({
  dependencies: [
    "engine",
    "runtimeController",
    "runtimeStore",
    "analyticsStore",
    "lifecycleManager",
  ],
  start: ({
    engine,
    runtimeController,
    runtimeStore,
    analyticsStore,
    lifecycleManager,
  }: {
    engine: BoidEngine;
    runtimeController: RuntimeController;
    runtimeStore: RuntimeStoreResource;
    analyticsStore: AnalyticsStoreResource;
    lifecycleManager: LifecycleManagerResource;
  }) => {
    let tickCounter = 0;
    let lastSnapshotTime = Date.now();
    let isFirstSnapshot = true; // Track if this is the first snapshot
    let snapshotCount = 0; // Track total snapshots for genetics sampling

    // Event counters (reset after each snapshot)
    const eventCounters = {
      births: {} as Record<string, number>,
      deaths: {} as Record<string, number>,
      deathsByCause: {} as Record<
        string,
        { old_age: number; starvation: number; predation: number }
      >,
      catches: {} as Record<string, number>,
      escapes: {} as Record<string, number>,
      totalChaseDistance: 0,
      totalFleeDistance: 0,
      chaseCount: 0,
      fleeCount: 0,
    };

    // Subscribe to all events
    const unsubscribe = runtimeController.subscribe((event) => {
      // Track event using analyticsStore helper (handles filtering)
      analyticsStore.trackEvent(event, tickCounter);

      // Track lifecycle events
      if (event.type === eventKeywords.boids.reproduced) {
        const typeId = event.typeId;
        // Count actual offspring spawned (handles twins: offspringCount = 2)
        const offspringCount = event.offspringCount || 1;
        eventCounters.births[typeId] =
          (eventCounters.births[typeId] || 0) + offspringCount;
      } else if (event.type === eventKeywords.boids.died) {
        const typeId = event.typeId;
        const reason = event.reason; // Event schema uses 'reason', not 'cause'

        // Track total deaths
        eventCounters.deaths[typeId] = (eventCounters.deaths[typeId] || 0) + 1;

        // Track deaths by cause
        if (!eventCounters.deathsByCause[typeId]) {
          eventCounters.deathsByCause[typeId] = {
            old_age: 0,
            starvation: 0,
            predation: 0,
          };
        }
        eventCounters.deathsByCause[typeId][reason]++;
      } else if (event.type === eventKeywords.boids.caught) {
        // Find prey type from boid list
        const prey = engine.boids.find((b) => b.id === event.preyId);
        if (prey) {
          const typeId = prey.typeId;
          eventCounters.catches[typeId] =
            (eventCounters.catches[typeId] || 0) + 1;
        }
      } else if (event.type === eventKeywords.time.passed) {
        // Capture snapshot every N ticks
        tickCounter++;
        const snapshotInterval =
          analyticsStore.store.getState().evolution.config.snapshotInterval;
        if (tickCounter % snapshotInterval === 0) {
          captureSnapshot();
        }
      }
    });

    const captureSnapshot = () => {
      const { config, simulation, ui } = runtimeStore.store.getState();
      const timestamp = Date.now();
      const deltaSeconds = (timestamp - lastSnapshotTime) / 1000;
      lastSnapshotTime = timestamp;

      // Calculate populations per species
      const populations: Record<string, number> = {};
      engine.boids.forEach((boid) => {
        populations[boid.typeId] = (populations[boid.typeId] || 0) + 1;
      });

      // Compute comprehensive statistics
      const energyStats = computeEnergyStatsBySpecies(engine.boids);
      const ageStats = computeAgeDistributionBySpecies(
        engine.boids,
        config.species
      );
      const spatialPatterns = computeSpatialPatternsBySpecies(
        engine.boids,
        config.world.width,
        config.world.height
      );
      const reproductionMetrics = computeReproductionMetricsBySpecies(
        engine.boids,
        config.species,
        config.parameters.reproductionEnergyThreshold
      );

      // Stance distribution by species
      const stancesBySpecies = getStanceDistributionBySpecies(engine.boids);

      // Food source statistics
      const foodSourceStats = computeFoodSourceStatsByType(
        simulation.foodSources
      );

      // Death marker statistics
      const deathMarkerStats = computeDeathMarkerStats(simulation.deathMarkers);

      // Get atmosphere state
      const atmosphereState = ui.visualSettings.atmosphere.activeEvent;

      // Build configuration snapshot (only for first snapshot to reduce file size)
      // OPTIMIZATION: activeParameters is ~1KB and never changes, so we only include it once
      const activeParameters = isFirstSnapshot ? {
        perceptionRadius: config.parameters.perceptionRadius,
        fearRadius: config.parameters.fearRadius,
        chaseRadius: config.parameters.chaseRadius,
        reproductionEnergyThreshold:
          config.parameters.reproductionEnergyThreshold,
        speciesConfigs: Object.entries(config.species).reduce(
          (acc, [id, species]) => {
            acc[id] = {
              role: species.role,
              maxSpeed: species.movement.maxSpeed,
              maxForce: species.movement.maxForce,
              maxEnergy: species.lifecycle.maxEnergy,
              energyLossRate: species.lifecycle.energyLossRate,
              fearFactor: species.lifecycle.fearFactor,
              reproductionType: species.reproduction.type,
              offspringCount: species.reproduction.offspringCount,
            };
            return acc;
          },
          {} as Record<
            string,
            {
              role: "prey" | "predator";
              maxSpeed: number;
              maxForce: number;
              maxEnergy: number;
              energyLossRate: number;
              fearFactor: number;
              reproductionType: "sexual" | "asexual";
              offspringCount: number;
            }
          >
        ),
      } : undefined;

      // Ensure all species have death cause entries (even if zero)
      const deathsByCause: Record<
        string,
        { old_age: number; starvation: number; predation: number }
      > = {};
      Object.keys(config.species).forEach((typeId) => {
        deathsByCause[typeId] = eventCounters.deathsByCause[typeId] || {
          old_age: 0,
          starvation: 0,
          predation: 0,
        };
      });

      // Create comprehensive snapshot
      const snapshot: EvolutionSnapshot = {
        // Temporal context
        tick: tickCounter,
        timestamp,
        deltaSeconds,

        // Population dynamics
        populations,
        births: { ...eventCounters.births },
        deaths: { ...eventCounters.deaths },
        deathsByCause,

        // Energy dynamics
        energy: energyStats,

        // Behavioral distribution
        stances: stancesBySpecies,

        // Age distribution
        age: ageStats,

        // Environmental state
        environment: {
          foodSources: foodSourceStats,
          deathMarkers: deathMarkerStats,
          obstacles: {
            count: simulation.obstacles.length,
          },
        },

        // Spatial patterns
        spatial: spatialPatterns,

        // Predator-prey dynamics
        interactions: {
          catches: { ...eventCounters.catches },
          escapes: { ...eventCounters.escapes },
          averageChaseDistance:
            eventCounters.chaseCount > 0
              ? eventCounters.totalChaseDistance / eventCounters.chaseCount
              : 0,
          averageFleeDistance:
            eventCounters.fleeCount > 0
              ? eventCounters.totalFleeDistance / eventCounters.fleeCount
              : 0,
        },

        // Reproduction dynamics
        reproduction: reproductionMetrics,

        // Configuration snapshot
        activeParameters,

        // Genetics & Evolution (sampled based on geneticsSamplingInterval)
        // OPTIMIZATION: Genetics is ~6KB per snapshot, sampling reduces file size significantly
        genetics: (snapshotCount % analyticsStore.store.getState().evolution.config.geneticsSamplingInterval === 0)
          ? computeGeneticsStatsBySpecies(
              engine.boids,
              config.species,
              lifecycleManager.getMutationCounters()
            )
          : {}, // Empty object when not sampling (saves ~55% of snapshot size)

        // Atmosphere state
        atmosphere: {
          activeEvent: atmosphereState?.eventType || null,
          eventStartedAtTick: atmosphereState ? tickCounter : null,
          eventDurationTicks: atmosphereState
            ? tickCounter -
              Math.floor((timestamp - atmosphereState.startedAt) / 1000)
            : null,
        },
      };

      // Update analyticsStore with new snapshot
      analyticsStore.captureSnapshot(snapshot);

      // Increment snapshot counter
      snapshotCount++;

      // Periodic genetics stats logging (every 300 frames = ~5 seconds at 60fps)
      if (tickCounter % 300 === 0 && tickCounter > 0 && Object.keys(snapshot.genetics).length > 0) {
        console.log("🧬 GENETICS STATS", {
          frame: tickCounter,
          genetics: snapshot.genetics,
        });
      }

      // Reset event counters
      eventCounters.births = {};
      eventCounters.deaths = {};
      eventCounters.deathsByCause = {};
      eventCounters.catches = {};
      eventCounters.escapes = {};

      // Reset mutation counters
      lifecycleManager.resetMutationCounters();
      eventCounters.totalChaseDistance = 0;
      eventCounters.totalFleeDistance = 0;
      eventCounters.chaseCount = 0;
      eventCounters.fleeCount = 0;
      
      // Mark that we've captured the first snapshot (for activeParameters optimization)
      isFirstSnapshot = false;
    };

    return { unsubscribe };
  },
  halt: ({ unsubscribe }: { unsubscribe: () => void }) => {
    unsubscribe();
  },
});
