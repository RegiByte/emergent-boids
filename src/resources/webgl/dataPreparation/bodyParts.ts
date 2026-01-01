/**
 * Body Parts Data Preparation
 *
 * Prepares per-instance data for body parts rendering
 * Each body part becomes a separate instance with its own position/rotation/scale
 */

import type { Boid, SpeciesConfig } from "@/boids/vocabulary/schemas/prelude";
import type { BodyPartsAtlasResult } from "../atlases/bodyPartsAtlas";
import { colorToRgb, calculateBoidRotation } from "./utils";
import { transformBodyPartWebGL, type BodyPartType } from "@/lib/coordinates";

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
    const boidRotation = calculateBoidRotation(
      boid.velocity.x,
      boid.velocity.y
    );
    const boidColor = colorToRgb(boid.phenotype.color);
    // Session 96: Use phenotype baseSize (== collisionRadius) for body parts.
    // Body parts should be positioned/scaled relative to physics size.
    const boidScale = boid.phenotype.baseSize;

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
      const partRotation = partData?.rotation || 0; // Degrees

      // Session 97: Use proper coordinate transformation
      // transformBodyPartWebGL handles:
      // - Genome position → WebGL offset (with Y-flip)
      // - Degrees → Radians
      // - Per-part-type scale factors
      const { offset, rotation } = transformBodyPartWebGL(
        { x: partPosX, y: partPosY },
        partRotation,
        partType as BodyPartType,
        boidScale
      );

      parts.push({
        boidPos: [boid.position.x, boid.position.y],
        boidRotation,
        boidColor,
        boidScale,
        partUV: [partUV.u, partUV.v],
        // Use transformed offset from coordinate system
        partOffset: [offset.x, offset.y],
        // Use transformed rotation (degrees → radians)
        partRotation: rotation,
        // Session 98: partSize is percentage of body (0.1-3.0)
        // partScale represents the RADIUS of the body part in world units
        // Shader multiplies by 2.0 to get diameter for quad rendering
        // Formula: partSize (genome, percentage of body) * boidScale (collision radius)
        // Example: partSize=0.7 (70% of body) * boidScale=5 = partScale=3.5 (radius in world units)
        partScale: partSize * boidScale,
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
