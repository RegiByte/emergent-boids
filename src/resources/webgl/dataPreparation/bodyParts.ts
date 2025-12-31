/**
 * Body Parts Data Preparation
 * 
 * Prepares per-instance data for body parts rendering
 * Each body part becomes a separate instance with its own position/rotation/scale
 */

import type { Boid, SpeciesConfig } from "@/boids/vocabulary/schemas/prelude";
import type { BodyPartsAtlasResult } from "../atlases/bodyPartsAtlas";
import { colorToRgb, calculateBoidRotation, calculateBoidScale } from "./utils";

export type BodyPartsInstanceData = {
  boidPositions: Float32Array;
  boidRotations: Float32Array;
  boidColors: Float32Array;
  boidScales: Float32Array;
  partUVs: Float32Array;
  partOffsets: Float32Array;
  partRotations: Float32Array;
  partScales: Float32Array;
  count: number;
};

type BodyPartData = {
  boidPos: [number, number];
  boidRotation: number;
  boidColor: [number, number, number];
  boidScale: number;
  partUV: [number, number];
  partOffset: [number, number];
  partRotation: number;
  partScale: number;
};

/**
 * Prepare body parts data for GPU
 * Collects all body parts from all boids and creates per-instance data
 */
export const prepareBodyPartsData = (
  boids: Boid[],
  speciesConfigs: Record<string, SpeciesConfig>,
  bodyPartsAtlas: BodyPartsAtlasResult | null
): BodyPartsInstanceData | null => {
  if (!bodyPartsAtlas) return null;

  // Collect all body parts from all boids
  const parts: BodyPartData[] = [];

  for (const boid of boids) {
    const speciesConfig = speciesConfigs[boid.typeId];
    const bodyParts = speciesConfig?.baseGenome?.visual?.bodyParts || [];

    if (bodyParts.length === 0) continue;

    // Boid properties
    const boidRotation = calculateBoidRotation(boid.velocity.x, boid.velocity.y);
    const boidColor = colorToRgb(boid.phenotype.color);
    const sizeMultiplier = speciesConfig?.baseGenome?.traits?.size || 1.0;
    const isPredator = speciesConfig?.role === "predator";
    const boidScale = calculateBoidScale(
      isPredator,
      sizeMultiplier,
      boid.phenotype.renderSize
    );

    // Add each body part
    for (const part of bodyParts) {
      const partType = typeof part === "string" ? part : part.type;

      // Skip glow (handled differently)
      if (partType === "glow") continue;

      // Get UV coordinates for this part type
      const partUV = bodyPartsAtlas.partUVMap.get(partType);
      if (!partUV) continue;

      // Part properties (from genome or defaults)
      const partData = typeof part === "object" ? part : null;
      const partSize = partData?.size || 1.0;
      const partPosX = partData?.position?.x || 0;
      const partPosY = partData?.position?.y || 0;
      const partRot = partData?.rotation
        ? (partData.rotation * Math.PI) / 180
        : 0;

      parts.push({
        boidPos: [boid.position.x, boid.position.y],
        boidRotation,
        boidColor,
        boidScale,
        partUV: [partUV.u, partUV.v],
        // Offset in boid-local space (before rotation by boid heading)
        // Genome uses: x = left/right, y = front/back (negative = front)
        // WebGL boid faces right (positive X), so we need to swap:
        // - genome.y (front/back) → offset.x (forward in boid space)
        // - genome.x (left/right) → offset.y (sideways in boid space)
        // Negate Y because genome uses negative-Y-is-front
        partOffset: [
          -partPosY * boidScale * 0.25, // Front/back (reduced from 0.4)
          partPosX * boidScale * 0.25, // Left/right (reduced from 0.4)
        ],
        partRotation: partRot,
        // Scale parts relative to boid body
        // Increased from 0.15 to 0.2 for better visibility
        partScale: partSize * boidScale * 0.2,
      });
    }
  }

  if (parts.length === 0) return null;

  // Convert to typed arrays
  const count = parts.length;
  const boidPositions = new Float32Array(count * 2);
  const boidRotations = new Float32Array(count);
  const boidColors = new Float32Array(count * 3);
  const boidScales = new Float32Array(count);
  const partUVs = new Float32Array(count * 2);
  const partOffsets = new Float32Array(count * 2);
  const partRotations = new Float32Array(count);
  const partScales = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const part = parts[i];

    boidPositions[i * 2] = part.boidPos[0];
    boidPositions[i * 2 + 1] = part.boidPos[1];
    boidRotations[i] = part.boidRotation;
    boidColors[i * 3] = part.boidColor[0];
    boidColors[i * 3 + 1] = part.boidColor[1];
    boidColors[i * 3 + 2] = part.boidColor[2];
    boidScales[i] = part.boidScale;
    partUVs[i * 2] = part.partUV[0];
    partUVs[i * 2 + 1] = part.partUV[1];
    partOffsets[i * 2] = part.partOffset[0];
    partOffsets[i * 2 + 1] = part.partOffset[1];
    partRotations[i] = part.partRotation;
    partScales[i] = part.partScale;
  }

  return {
    boidPositions,
    boidRotations,
    boidColors,
    boidScales,
    partUVs,
    partOffsets,
    partRotations,
    partScales,
    count,
  };
};

