/**
 * WebGL Data Preparation - Trails
 *
 * Prepares instance data for trail rendering with batching optimization.
 * Trails are batched by color and alpha to minimize draw calls.
 */

import type { Boid } from "../../../../boids/vocabulary/schemas/entities.ts";
import type { SpeciesConfig } from "../../../../boids/vocabulary/schemas/species.ts";
import { toRgb } from "../../../../lib/colors.ts";

/**
 * Trail segment definition
 */
export type TrailSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * Trail batch (segments with same color/alpha)
 */
export type TrailBatch = {
  segments: TrailSegment[];
  color: { r: number; g: number; b: number };
  alpha: number;
};

/**
 * Instance data for trail rendering
 */
export type TrailInstanceData = {
  startPositions: Float32Array;
  endPositions: Float32Array;
  colors: Float32Array;
  alphas: Float32Array;
  count: number;
};

/**
 * Trail rendering configuration
 */
const TRAIL_CONFIG = {
  minAlpha: 0.3,
  maxAlpha: 0.8,
  alphaBoost: 1.5,
  alphaQuantizationLevels: 10,
} as const;

/**
 * Prepares trail instance data from a batch for GPU rendering
 *
 * @param batch - Trail batch with segments and visual properties
 * @returns Instance data ready for GPU upload
 */
export const prepareTrailData = (batch: TrailBatch): TrailInstanceData => {
  const count = batch.segments.length;
  const startPositions = new Float32Array(count * 2);
  const endPositions = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const alphas = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const segment = batch.segments[i];

    // Start position
    startPositions[i * 2] = segment.x1;
    startPositions[i * 2 + 1] = segment.y1;

    // End position
    endPositions[i * 2] = segment.x2;
    endPositions[i * 2 + 1] = segment.y2;

    // Color (same for all segments in batch)
    colors[i * 3] = batch.color.r;
    colors[i * 3 + 1] = batch.color.g;
    colors[i * 3 + 2] = batch.color.b;

    // Alpha (same for all segments in batch)
    alphas[i] = batch.alpha;
  }

  return { startPositions, endPositions, colors, alphas, count };
};

/**
 * Collects trail segments from boids and batches them by color/alpha
 * This mirrors the Canvas 2D batching logic for performance
 *
 * @param boids - Array of boids to collect trails from
 * @param speciesConfigs - Species configuration for trail settings
 * @param worldWidth - World width for toroidal wrap detection
 * @param worldHeight - World height for toroidal wrap detection
 * @returns Array of trail batches ready for rendering
 */
export const collectTrailBatches = (
  boids: Boid[],
  speciesConfigs: Record<string, SpeciesConfig>,
  worldWidth: number,
  worldHeight: number,
): TrailBatch[] => {
  const batches = new Map<string, TrailBatch>();

  for (const boid of boids) {
    const speciesConfig = speciesConfigs[boid.typeId];
    if (!speciesConfig || boid.positionHistory.length <= 1) continue;

    // Check if this species should render trails
    const shouldRenderTrail = speciesConfig.visualConfig?.trail ?? true;
    if (!shouldRenderTrail) continue;

    // Calculate energy ratio for trail visibility
    const energyRatio = boid.energy / boid.phenotype.maxEnergy;
    // Increase base alpha for better visibility
    // Match Canvas 2D: 0.3-0.8 range
    const baseAlpha =
      TRAIL_CONFIG.minAlpha + energyRatio * TRAIL_CONFIG.maxAlpha;

    // Use custom trail color if specified, otherwise use individual genome color
    const color = speciesConfig.visualConfig.trailColor || boid.phenotype.color;
    const [r, g, b] = toRgb(color);

    // Collect segments for this boid
    for (let i = 0; i < boid.positionHistory.length - 1; i++) {
      const pos1 = boid.positionHistory[i];
      const pos2 = boid.positionHistory[i + 1];

      // Skip if toroidal wrap detected (large position jump)
      const dx = Math.abs(pos2.x - pos1.x);
      const dy = Math.abs(pos2.y - pos1.y);
      const maxJump = Math.min(worldWidth, worldHeight) / 2;

      if (dx > maxJump || dy > maxJump) {
        continue;
      }

      // Calculate alpha for this segment (older = more transparent)
      // Index 0 = oldest (most transparent), index length-1 = newest (most opaque)
      const segmentRatio = i / boid.positionHistory.length;
      // Boost alpha for visibility (multiply by 1.5, cap at 1.0)
      const alpha = Math.min(
        1.0,
        baseAlpha * segmentRatio * TRAIL_CONFIG.alphaBoost,
      );

      // Quantize alpha to reduce number of batches (10 levels)
      const quantizedAlpha =
        Math.round(alpha * TRAIL_CONFIG.alphaQuantizationLevels) /
        TRAIL_CONFIG.alphaQuantizationLevels;

      // Create batch key (color + alpha)
      const batchKey = `${r},${g},${b}|${quantizedAlpha}`;

      // Get or create batch
      let batch = batches.get(batchKey);
      if (!batch) {
        batch = {
          segments: [],
          color: { r: r / 255, g: g / 255, b: b / 255 },
          alpha: quantizedAlpha,
        };
        batches.set(batchKey, batch);
      }

      // Add segment to batch
      batch.segments.push({
        x1: pos1.x,
        y1: pos1.y,
        x2: pos2.x,
        y2: pos2.y,
      });
    }
  }

  return Array.from(batches.values());
};
