import { RuntimeStore } from "../boids/vocabulary/schemas/state.ts";
import { EvolutionSnapshot } from "@/boids/vocabulary/schemas/evolution.ts";
import { computeGeneticsStatsBySpecies } from "@/boids/analytics/genetics";
import JSZip from "jszip";
import { iterateBoids } from "@/boids/iterators.ts";
import { BoidsById } from "@/boids/vocabulary/schemas/entities.ts";

/**
 * Export Utilities
 *
 * Functions to export simulation data in various formats:
 * - Current snapshot (JSON) - for immediate analysis
 * - Evolution history (JSONL) - for time-series analysis and ML training
 * - Multi-rate ZIP export - multiple JSONL files at different sampling rates
 *
 * JSONL Format (JSON Lines):
 * - One complete JSON object per line
 * - Preserves full multi-dimensional data structure
 * - Token-efficient (no repeated headers)
 * - Streamable and easy to process
 * - LLM-friendly for analysis
 *
 * Multi-Rate Export:
 * - Exports multiple JSONL files with different sampling rates
 * - Enables training models at different temporal resolutions
 * - Packaged as a single ZIP file for easy distribution
 */

/**
 * Export current ecosystem state as JSON
 * Human-readable and LLM-friendly format
 */
export function exportCurrentStats(
  boids: BoidsById,
  runtimeStore: RuntimeStore,
  mutationCounters?: Record<
    string,
    {
      traitMutations: number;
      colorMutations: number;
      bodyPartMutations: number;
      totalOffspring: number;
    }
  >,
): string {
  const { config, simulation } = runtimeStore;

  // Calculate populations per type
  const populations: Record<string, number> = {};
  const populationsByRole: Record<string, number> = { prey: 0, predator: 0 };

  for (const boid of iterateBoids(boids)) {
    const typeId = boid.typeId;
    populations[typeId] = (populations[typeId] || 0) + 1;

    const typeConfig = config.species[typeId];
    if (typeConfig) {
      populationsByRole[typeConfig.role] =
        (populationsByRole[typeConfig.role] || 0) + 1;
    }
  }

  // Calculate energy statistics per type
  const energyStats: Record<
    string,
    { avg: number; min: number; max: number; total: number }
  > = {};

  for (const boid of iterateBoids(boids)) {
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
  }

  // Calculate averages
  Object.keys(energyStats).forEach((typeId) => {
    const count = populations[typeId] || 1;
    energyStats[typeId].avg = energyStats[typeId].total / count;
    // Clean up total (not needed in output)
    delete (energyStats[typeId] as Record<string, number>).total;
  });

  // Calculate stance distribution
  const stancesByType: Record<string, Record<string, number>> = {};

  for (const boid of iterateBoids(boids)) {
    const typeId = boid.typeId;
    if (!stancesByType[typeId]) {
      stancesByType[typeId] = {};
    }
    const stance = boid.stance;
    stancesByType[typeId][stance] = (stancesByType[typeId][stance] || 0) + 1;
  }

  // Count food sources
  const foodSources = {
    prey: simulation.foodSources.filter((f) => f.sourceType === "prey").length,
    predator: simulation.foodSources.filter((f) => f.sourceType === "predator")
      .length,
    total: simulation.foodSources.length,
  };

  // Compute genetics statistics
  const genetics = computeGeneticsStatsBySpecies(
    boids,
    config.species,
    mutationCounters || {},
  );

  // Build export object
  const exportData = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    populations: {
      total: Object.keys(boids).length,
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
    genetics, // NEW: Evolution & genetics data
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
 *
 * Format:
 * - Header: Comments + config JSON (first snapshot's activeParameters)
 * - Line 1: {"tick":3,"timestamp":1767024880065,"populations":{...},"genetics":{...}}
 * - Line 2: {"tick":6,"timestamp":1767024881581,"populations":{...},"genetics":{...}}
 * - ...
 *
 * Benefits:
 * - Preserves full multi-dimensional data (100+ dimensions per snapshot)
 * - Token-efficient (no repeated column headers like CSV)
 * - Config stored once in header (saves ~9% file size)
 * - Streamable (process line-by-line without loading entire file)
 * - Easy to parse for both humans and LLMs
 * - Includes all genetics data: traits, generations, mutations, spatial patterns
 *
 * @param snapshots - Array of evolution snapshots to export
 * @returns JSONL string (one JSON object per line)
 */
export function exportEvolutionJSONL(snapshots: EvolutionSnapshot[]): string {
  if (snapshots.length === 0) {
    return "# No evolution data available yet\n# Start the simulation and let it run for a few ticks to collect data";
  }

  // Extract config from first snapshot (if present)
  const config = snapshots[0].activeParameters;
  const configJson = config ? JSON.stringify(config, null, 2) : "{}";

  // Calculate size savings
  const avgSnapshotSize = JSON.stringify(snapshots[0]).length;
  const configSize = configJson.length;
  const savingsPercent = (
    ((configSize * (snapshots.length - 1)) /
      (avgSnapshotSize * snapshots.length)) *
    100
  ).toFixed(1);

  // Add header comment with metadata and config
  const header = [
    "# Emergent Boids - Evolution Data (JSONL Format)",
    `# Generated: ${new Date().toISOString()}`,
    `# Snapshots: ${snapshots.length}`,
    `# Time Range: ${new Date(snapshots[0].timestamp).toISOString()} to ${new Date(snapshots[snapshots.length - 1].timestamp).toISOString()}`,
    `# Format: One JSON object per line (after config block)`,
    `# Optimization: activeParameters stored once (saves ~${savingsPercent}% file size)`,
    `#`,
    `# Configuration (applies to all snapshots):`,
    `# CONFIG_START`,
    ...configJson.split("\n").map((line) => `# ${line}`),
    `# CONFIG_END`,
    "#",
  ].join("\n");

  const data = snapshots.map((snap) => JSON.stringify(snap)).join("\n");

  return `${header}\n${data}`;
}

/**
 * Multi-Rate Evolution Export Configuration
 */
export interface MultiRateExportConfig {
  /** Base filename (without extension) */
  baseFilename?: string;
  /** Sampling rates to export (e.g., [1, 3, 10, 50, 100]) */
  samplingRates?: number[];
  /** Include metadata.json file */
  includeMetadata?: boolean;
  /** Include current stats snapshot */
  includeCurrentStats?: boolean;
}

/**
 * Export evolution data as multi-rate ZIP archive
 *
 * Creates a ZIP file containing multiple JSONL files at different sampling rates.
 * This enables training models at different temporal resolutions:
 * - 1x: Every snapshot (highest resolution, fine-grained patterns)
 * - 3x: Every 3rd snapshot (medium resolution, balanced)
 * - 10x: Every 10th snapshot (coarse resolution, long-term trends)
 * - 50x: Every 50th snapshot (very coarse, major events only)
 * - 100x: Every 100th snapshot (ultra coarse, epoch-level patterns)
 *
 * File structure:
 * ```
 * evolution_export_[timestamp].zip
 * ├── metadata.json          # Export info, config, species list
 * ├── stats_current.json     # Current snapshot (optional)
 * ├── snapshots_1x.jsonl     # Every snapshot
 * ├── snapshots_3x.jsonl     # Every 3rd snapshot
 * ├── snapshots_10x.jsonl    # Every 10th snapshot
 * ├── snapshots_50x.jsonl    # Every 50th snapshot
 * └── snapshots_100x.jsonl   # Every 100th snapshot
 * ```
 *
 * @param snapshots - Array of evolution snapshots to export
 * @param engine - Boid engine (for current stats)
 * @param runtimeStore - Runtime store (for config)
 * @param config - Export configuration
 * @returns Promise<Blob> - ZIP file as blob
 */
export async function exportEvolutionMultiRate(
  snapshots: EvolutionSnapshot[],
  boids: BoidsById,
  runtimeStore: RuntimeStore,
  config: MultiRateExportConfig = {},
): Promise<Blob> {
  const {
    samplingRates = [1, 3, 10, 50, 100],
    includeMetadata = true,
    includeCurrentStats = true,
  } = config;

  if (snapshots.length === 0) {
    throw new Error("No snapshots to export");
  }

  const zip = new JSZip();

  // Add metadata.json
  if (includeMetadata) {
    const metadata = {
      exportDate: new Date().toISOString(),
      exportTimestamp: Date.now(),
      totalSnapshots: snapshots.length,
      timeRange: {
        start: {
          tick: snapshots[0].tick,
          timestamp: snapshots[0].timestamp,
          date: new Date(snapshots[0].timestamp).toISOString(),
        },
        end: {
          tick: snapshots[snapshots.length - 1].tick,
          timestamp: snapshots[snapshots.length - 1].timestamp,
          date: new Date(
            snapshots[snapshots.length - 1].timestamp,
          ).toISOString(),
        },
      },
      duration: {
        ticks: snapshots[snapshots.length - 1].tick - snapshots[0].tick,
        milliseconds:
          snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp,
        seconds:
          (snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp) /
          1000,
        minutes:
          (snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp) /
          60000,
      },
      samplingRates: samplingRates.map((rate) => ({
        rate,
        filename: `snapshots_${rate}x.jsonl`,
        snapshotCount: Math.ceil(snapshots.length / rate),
      })),
      species: Object.keys(snapshots[0].populations || {}),
      config: snapshots[0].activeParameters || null,
    };

    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
  }

  // Add current stats (if available)
  if (includeCurrentStats && runtimeStore) {
    const currentStats = exportCurrentStats(boids, runtimeStore);
    zip.file("stats_current.json", currentStats);
  }

  // Generate JSONL files for each sampling rate
  for (const rate of samplingRates) {
    const sampledSnapshots = snapshots.filter((_, index) => index % rate === 0);

    if (sampledSnapshots.length > 0) {
      const jsonl = exportEvolutionJSONL(sampledSnapshots);
      zip.file(`snapshots_${rate}x.jsonl`, jsonl);
    }
  }

  // Generate ZIP blob
  return await zip.generateAsync({ type: "blob" });
}

/**
 * Download a blob as a file
 *
 * @param blob - Blob to download
 * @param filename - Filename for download
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export and download multi-rate evolution data as ZIP
 *
 * Convenience function that combines exportEvolutionMultiRate and downloadBlob.
 *
 * @param snapshots - Array of evolution snapshots to export
 * @param engine - Boid engine (for current stats)
 * @param runtimeStore - Runtime store (for config)
 * @param config - Export configuration
 */
export async function exportAndDownloadMultiRate(
  snapshots: EvolutionSnapshot[],
  boids: BoidsById,
  runtimeStore: RuntimeStore,
  config: MultiRateExportConfig = {},
): Promise<void> {
  try {
    const blob = await exportEvolutionMultiRate(
      snapshots,
      boids,
      runtimeStore,
      config,
    );
    const filename = `${config.baseFilename || `evolution_export_${Date.now()}`}.zip`;
    downloadBlob(blob, filename);
    console.log(`✅ Evolution data exported: ${filename}`);
  } catch (error) {
    console.error("❌ Failed to export evolution data:", error);
    throw error;
  }
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
        `📊 Preview (first 500 chars):\n${text.substring(0, 500)}...`,
      );
    })
    .catch((err) => {
      console.error("❌ Failed to copy to clipboard:", err);
      console.log("📋 Data output:\n", text);
    });
}
