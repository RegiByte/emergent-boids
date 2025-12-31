/**
 * WebGL Data Preparation - Triangle Boids (Fallback)
 *
 * Prepares instance data for triangle-based boid rendering.
 * This is a fallback when shape-based rendering is not available.
 */

import type { Boid } from "../../../boids/vocabulary/schemas/prelude";
import { toRgb } from "../../../lib/colors";

/**
 * Instance data for triangle-based boid rendering
 */
export type TriangleBoidInstanceData = {
  positions: Float32Array;
  rotations: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  count: number;
};

/**
 * Prepares triangle boid instance data for GPU rendering
 *
 * @param boids - Array of boids to render
 * @returns Instance data ready for GPU upload
 */
export const prepareTriangleBoidData = (
  boids: Boid[]
): TriangleBoidInstanceData => {
  const count = boids.length;
  const positions = new Float32Array(count * 2);
  const rotations = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const boid = boids[i];

    // Position
    positions[i * 2] = boid.position.x;
    positions[i * 2 + 1] = boid.position.y;

    // Rotation (from velocity) - atan2 gives angle in radians
    // Note: Negate Y because our projection flips Y axis (Canvas Y-down vs WebGL Y-up)
    // This ensures boids point in the direction they're moving
    rotations[i] = Math.atan2(-boid.velocity.y, boid.velocity.x);

    // Color (normalized to 0-1) - convert hex to RGB
    const [r, g, b] = toRgb(boid.phenotype.color);
    colors[i * 3] = r / 255;
    colors[i * 3 + 1] = g / 255;
    colors[i * 3 + 2] = b / 255;

    // Scale (from phenotype renderSize)
    // renderSize is typically 0.8-1.2 (size multiplier from genome)
    scales[i] = boid.phenotype.renderSize;
  }

  return { positions, rotations, colors, scales, count };
};

