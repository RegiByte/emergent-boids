/**
 * Shape Boids Data Preparation
 * 
 * Prepares per-instance data for shape-based boid rendering
 */

import type { Boid, SpeciesConfig } from "@/boids/vocabulary/schemas/prelude";
import type { ShapeAtlasResult } from "../atlases/shapeAtlas";
import { colorToRgb, calculateBoidRotation, calculateBoidScale } from "./utils";

export type ShapeBoidInstanceData = {
  positions: Float32Array;
  rotations: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  shapeUVs: Float32Array;
  count: number;
};

/**
 * Prepare shape-based boid data for GPU (with UV coordinates)
 */
export const prepareShapeBoidData = (
  boids: Boid[],
  speciesConfigs: Record<string, SpeciesConfig>,
  shapeAtlas: ShapeAtlasResult | null
): ShapeBoidInstanceData => {
  const count = boids.length;
  const positions = new Float32Array(count * 2);
  const rotations = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const shapeUVs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const boid = boids[i];

    // Position
    positions[i * 2] = boid.position.x;
    positions[i * 2 + 1] = boid.position.y;

    // Rotation (from velocity)
    rotations[i] = calculateBoidRotation(boid.velocity.x, boid.velocity.y);

    // Color (normalized to 0-1)
    const [r, g, b] = colorToRgb(boid.phenotype.color);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    // Scale (match Canvas 2D sizing)
    const speciesConfig = speciesConfigs[boid.typeId];
    const sizeMultiplier = speciesConfig?.baseGenome?.traits?.size || 1.0;
    const isPredator = speciesConfig?.role === "predator";
    scales[i] = calculateBoidScale(
      isPredator,
      sizeMultiplier,
      boid.phenotype.renderSize
    );

    // Shape UV coordinates (lookup from atlas)
    if (shapeAtlas) {
      const shapeName = speciesConfig?.visualConfig?.shape || "triangle";
      const shapeUV = shapeAtlas.shapeUVMap.get(shapeName);

      if (shapeUV) {
        shapeUVs[i * 2] = shapeUV.u;
        shapeUVs[i * 2 + 1] = shapeUV.v;
      } else {
        // Fallback to triangle if shape not found
        const triangleUV = shapeAtlas.shapeUVMap.get("triangle");
        shapeUVs[i * 2] = triangleUV?.u || 0;
        shapeUVs[i * 2 + 1] = triangleUV?.v || 0;
      }
    }
  }

  return { positions, rotations, colors, scales, shapeUVs, count };
};

