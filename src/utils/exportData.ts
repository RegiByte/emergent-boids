import type { BoidEngine } from "../resources/engine";

import { RuntimeStore } from "../boids/vocabulary/schemas/state.ts";
import { EvolutionSnapshot } from "@/boids/vocabulary/schemas/evolution.ts";

/**
 * Export Utilities
 *
 * Functions to export simulation data in various formats:
 * - Current snapshot (JSON) - for immediate analysis
 * - Evolution history (CSV) - for time-series analysis
 */

/**
 * Export current ecosystem state as JSON
 * Human-readable and LLM-friendly format
 */
export function exportCurrentStats(
  engine: BoidEngine,
  runtimeStore: RuntimeStore
): string {
  const { config, simulation } = runtimeStore;

  // Calculate populations per type
  const populations: Record<string, number> = {};
  const populationsByRole: Record<string, number> = { prey: 0, predator: 0 };

  engine.boids.forEach((boid) => {
    const typeId = boid.typeId;
    populations[typeId] = (populations[typeId] || 0) + 1;

    const typeConfig = config.species[typeId];
    if (typeConfig) {
      populationsByRole[typeConfig.role] =
        (populationsByRole[typeConfig.role] || 0) + 1;
    }
  });

  // Calculate energy statistics per type
  const energyStats: Record<
    string,
    { avg: number; min: number; max: number; total: number }
  > = {};

  engine.boids.forEach((boid) => {
    const typeId = boid.typeId;
    if (!energyStats[typeId]) {
      energyStats[typeId] = {
        avg: 0,
        min: Infinity,
        max: -Infinity,
        total: 0,
      };
    }

    energyStats[typeId].total += boid.energy;
    energyStats[typeId].min = Math.min(energyStats[typeId].min, boid.energy);
    energyStats[typeId].max = Math.max(energyStats[typeId].max, boid.energy);
  });

  // Calculate averages
  Object.keys(energyStats).forEach((typeId) => {
    const count = populations[typeId] || 1;
    energyStats[typeId].avg = energyStats[typeId].total / count;
    // Clean up total (not needed in output)
    delete (energyStats[typeId] as Record<string, number>).total;
  });

  // Calculate stance distribution
  const stancesByType: Record<string, Record<string, number>> = {};

  engine.boids.forEach((boid) => {
    const typeId = boid.typeId;
    if (!stancesByType[typeId]) {
      stancesByType[typeId] = {};
    }
    const stance = boid.stance;
    stancesByType[typeId][stance] = (stancesByType[typeId][stance] || 0) + 1;
  });

  // Count food sources
  const foodSources = {
    prey: simulation.foodSources.filter((f) => f.sourceType === "prey").length,
    predator: simulation.foodSources.filter((f) => f.sourceType === "predator")
      .length,
    total: simulation.foodSources.length,
  };

  // Build export object
  const exportData = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    populations: {
      total: engine.boids.length,
      byRole: populationsByRole,
      byType: populations,
      preyToPredatorRatio:
        populationsByRole.predator > 0
          ? (populationsByRole.prey / populationsByRole.predator).toFixed(2)
          : "∞",
    },
    energy: energyStats,
    stances: stancesByType,
    foodSources,
    config: {
      maxBoids: config.parameters.maxBoids,
      maxPreyBoids: config.parameters.maxPreyBoids,
      maxPredatorBoids: config.parameters.maxPredatorBoids,
      worldSize: {
        width: config.world.width,
        height: config.world.height,
      },
    },
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export evolution history as JSON Lines (JSONL)
 * Optimized for ML training and data analysis
 *
 * Each line is a complete JSON snapshot - easy to stream and process
 */
export function exportEvolutionJSONL(snapshots: EvolutionSnapshot[]): string {
  if (snapshots.length === 0) {
    return "No evolution data available yet";
  }

  return snapshots.map((snap) => JSON.stringify(snap)).join("\n");
}

/**
 * Export evolution history as CSV (simplified for backward compatibility)
 * For basic analysis - use JSONL for comprehensive ML training data
 */
export function exportEvolutionCSV(snapshots: EvolutionSnapshot[]): string {
  if (snapshots.length === 0) {
    return "No evolution data available yet";
  }

  // Collect all unique type IDs across all snapshots
  const typeIds = new Set<string>();
  snapshots.forEach((snap) => {
    Object.keys(snap.populations).forEach((typeId) => typeIds.add(typeId));
    Object.keys(snap.births).forEach((typeId) => typeIds.add(typeId));
    Object.keys(snap.deaths).forEach((typeId) => typeIds.add(typeId));
    Object.keys(snap.energy).forEach((typeId) => typeIds.add(typeId));
  });

  const sortedTypeIds = Array.from(typeIds).sort();

  // Build CSV header (simplified - basic metrics only)
  const header = [
    "tick",
    "timestamp",
    "date",
    "deltaSeconds",
    // Population columns
    ...sortedTypeIds.map((id) => `${id}_population`),
    // Birth columns
    ...sortedTypeIds.map((id) => `${id}_births`),
    // Death columns
    ...sortedTypeIds.map((id) => `${id}_deaths`),
    // Energy columns (mean only for CSV simplicity)
    ...sortedTypeIds.map((id) => `${id}_energy_mean`),
    // Death causes (totals)
    ...sortedTypeIds.map((id) => `${id}_deaths_old_age`),
    ...sortedTypeIds.map((id) => `${id}_deaths_starvation`),
    ...sortedTypeIds.map((id) => `${id}_deaths_predation`),
    // Food sources
    "prey_food_count",
    "predator_food_count",
    // Atmosphere
    "atmosphere_event",
  ].join(",");

  // Build CSV rows
  const rows = snapshots.map((snap) => {
    const date = new Date(snap.timestamp).toISOString();
    return [
      snap.tick,
      snap.timestamp,
      date,
      snap.deltaSeconds.toFixed(3),
      // Population values
      ...sortedTypeIds.map((id) => snap.populations[id] || 0),
      // Birth values
      ...sortedTypeIds.map((id) => snap.births[id] || 0),
      // Death values
      ...sortedTypeIds.map((id) => snap.deaths[id] || 0),
      // Energy mean values (rounded to 1 decimal)
      ...sortedTypeIds.map((id) =>
        snap.energy[id]?.mean ? snap.energy[id].mean.toFixed(1) : "0.0"
      ),
      // Death causes
      ...sortedTypeIds.map((id) => snap.deathsByCause[id]?.old_age || 0),
      ...sortedTypeIds.map((id) => snap.deathsByCause[id]?.starvation || 0),
      ...sortedTypeIds.map((id) => snap.deathsByCause[id]?.predation || 0),
      // Food sources
      snap.environment.foodSources.prey.count,
      snap.environment.foodSources.predator.count,
      // Atmosphere
      snap.atmosphere.activeEvent || "none",
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

/**
 * Copy text to clipboard and log to console
 */
export function copyToClipboard(text: string, label: string = "Data"): void {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      console.log(`✅ ${label} copied to clipboard!`);
      console.log(
        `📊 Preview (first 500 chars):\n${text.substring(0, 500)}...`
      );
    })
    .catch((err) => {
      console.error("❌ Failed to copy to clipboard:", err);
      console.log("📋 Data output:\n", text);
    });
}
