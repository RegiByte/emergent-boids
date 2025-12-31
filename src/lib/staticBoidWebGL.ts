/**
 * Static Boid WebGL Renderer
 *
 * Standalone WebGL utilities for rendering individual boids without the full
 * resource system. Used for developer tools like the boids atlas.
 *
 * Architecture:
 * - Minimal REGL context with atlases and shaders
 * - Single boid rendering (no batching needed)
 * - Reuses existing infrastructure (atlases, shaders, data preparation)
 * - No dependency on braided resource system
 */

import REGL from "regl";
import type { Boid, SpeciesConfig } from "@/boids/vocabulary/schemas/prelude";
import {
  createShapeAtlas,
  createShapeTexture,
  type ShapeAtlasResult,
} from "@/resources/webgl/atlases/shapeAtlas";
import {
  createBodyPartsAtlas,
  createBodyPartsTexture,
  type BodyPartsAtlasResult,
} from "@/resources/webgl/atlases/bodyPartsAtlas";
import { createShapeBoidsDrawCommand } from "@/resources/webgl/drawCommands/shapeBoids";
import { createBodyPartsDrawCommand } from "@/resources/webgl/drawCommands/bodyParts";
import { colorToRgb } from "@/resources/webgl/dataPreparation/utils";
import {
  transformBodyPartWebGL,
  type BodyPartType,
} from "@/lib/coordinates";

/**
 * Minimal WebGL context for static boid rendering
 * Contains all resources needed to render a single boid
 */
export interface StaticWebGLContext {
  regl: REGL.Regl;
  shapeAtlas: ShapeAtlasResult;
  shapeTexture: REGL.Texture2D;
  bodyPartsAtlas: BodyPartsAtlasResult;
  bodyPartsTexture: REGL.Texture2D;
  drawShapeBoids: REGL.DrawCommand;
  drawBodyParts: REGL.DrawCommand;
}

/**
 * Initialize a minimal WebGL context for static boid rendering
 *
 * Creates REGL context, generates texture atlases, compiles shaders,
 * and prepares draw commands. This is a standalone setup that doesn't
 * depend on the full resource system.
 *
 * @param canvas - Canvas element to render to
 * @returns WebGL context or null if initialization fails
 */
export function createMinimalWebGLContext(
  canvas: HTMLCanvasElement
): StaticWebGLContext | null {
  try {
    // Create a raw WebGL context first
    // This approach works better than letting REGL create it, especially when
    // dealing with multiple canvases in a React environment
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: true,
    });

    if (!gl) {
      console.error(
        "Failed to create WebGL context - WebGL may not be available"
      );
      return null;
    }

    // Initialize REGL with the existing WebGL context
    // This is more reliable than letting REGL create the context
    const regl = REGL({
      gl,
      extensions: ["ANGLE_instanced_arrays"],
    });

    // Generate shape atlas
    const shapeAtlas = createShapeAtlas();
    if (!shapeAtlas) {
      console.error("Failed to create shape atlas");
      return null;
    }

    // Create shape texture
    const shapeTexture = createShapeTexture(regl, shapeAtlas);
    if (!shapeTexture) {
      console.error("Failed to create shape texture");
      return null;
    }

    // Generate body parts atlas
    const bodyPartsAtlas = createBodyPartsAtlas();
    if (!bodyPartsAtlas) {
      console.error("Failed to create body parts atlas");
      return null;
    }

    // Create body parts texture
    const bodyPartsTexture = createBodyPartsTexture(regl, bodyPartsAtlas);
    if (!bodyPartsTexture) {
      console.error("Failed to create body parts texture");
      return null;
    }

    // Create draw commands (reuse existing infrastructure)
    const drawShapeBoids = createShapeBoidsDrawCommand(
      regl,
      shapeTexture,
      shapeAtlas
    );
    const drawBodyParts = createBodyPartsDrawCommand(
      regl,
      bodyPartsTexture,
      bodyPartsAtlas
    );

    return {
      regl,
      shapeAtlas,
      shapeTexture,
      bodyPartsAtlas,
      bodyPartsTexture,
      drawShapeBoids,
      drawBodyParts,
    };
  } catch (error) {
    console.error("Failed to initialize WebGL context:", error);
    return null;
  }
}

/**
 * Create transform matrix for static boid rendering
 * Centers the boid in the canvas and applies scale
 *
 * @param scale - Scale multiplier
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Column-major mat3 for WebGL
 */
function createStaticTransformMatrix(
  scale: number,
  width: number,
  height: number
): number[] {
  // Simple orthographic projection that centers content
  // Scale determines how large the boid appears
  const scaleX = (2 * scale) / width;
  const scaleY = (2 * scale) / height; // Positive Y (WebGL coords, not flipped)

  // Column-major mat3 for WebGL (matches shader expectations)
  // Column 0 (x-axis), Column 1 (y-axis), Column 2 (translation)
  return [
    scaleX,
    0,
    0, // Column 0: affects x
    0,
    scaleY,
    0, // Column 1: affects y
    0,
    0,
    1, // Column 2: translation + homogeneous
  ];
}

/**
 * Render a single boid using WebGL
 *
 * Prepares instance data for the boid and its body parts,
 * then issues draw calls. Matches Canvas 2D rendering exactly.
 *
 * @param context - WebGL context with atlases and shaders
 * @param boid - The boid to render
 * @param speciesConfig - Species configuration (for shape, tail color, etc.)
 * @param options - Rendering options
 */
export function renderBoidWebGL(
  context: StaticWebGLContext,
  boid: Boid,
  speciesConfig: SpeciesConfig | undefined,
  options: {
    scale?: number;
    width: number;
    height: number;
  }
): void {
  const { regl, shapeAtlas, bodyPartsAtlas, drawShapeBoids, drawBodyParts } =
    context;
  const { scale = 1, width, height } = options;

  // Clear canvas with transparent background
  regl.clear({
    color: [0, 0, 0, 0],
    depth: 1,
  });

  // Create transform matrix for centered static view
  const transform = createStaticTransformMatrix(scale, width, height);

  // Prepare shape boid instance data (single boid)
  const shapeBoidData = prepareShapeBoidInstanceData(
    boid,
    speciesConfig,
    shapeAtlas,
    scale
  );

  // Draw boid shape
  drawShapeBoids({
    ...shapeBoidData,
    transform,
  });

  // Prepare and draw body parts if present
  const bodyPartsData = prepareBodyPartsInstanceData(
    boid,
    speciesConfig,
    bodyPartsAtlas,
    scale
  );

  if (bodyPartsData && bodyPartsData.count > 0) {
    drawBodyParts({
      ...bodyPartsData,
      transform,
    });
  }
}

/**
 * Prepare instance data for a single boid's shape
 * Matches the format expected by the shape boids draw command
 */
function prepareShapeBoidInstanceData(
  boid: Boid,
  speciesConfig: SpeciesConfig | undefined,
  shapeAtlas: ShapeAtlasResult,
  scale: number
) {
  const { position, velocity, phenotype, genome } = boid;

  // Calculate rotation from velocity
  const rotation = Math.atan2(velocity.y, velocity.x);

  // Get color (normalized to 0-1)
  const [r, g, b] = colorToRgb(phenotype.color);

  // Calculate scale (match Canvas 2D sizing)
  const sizeMultiplier = genome.traits?.size || 1.0;
  const isPredator = speciesConfig?.role === "predator";
  const baseSize = isPredator ? 12 : 8;
  // Shape atlas fills ~50% of cell, Canvas 2D renders at ~70% radius
  // Compensation: (0.7 / 0.5) = 1.4x to match visual size
  const shapeAtlasCompensation = 1.4;
  const boidScale = baseSize * sizeMultiplier * scale * shapeAtlasCompensation;

  // Get shape UV coordinates from atlas
  const shapeName = speciesConfig?.visualConfig?.shape || "triangle";
  const shapeUV = shapeAtlas.shapeUVMap.get(shapeName);
  const uvCoords = shapeUV ||
    shapeAtlas.shapeUVMap.get("triangle") || { u: 0, v: 0 };

  // Create typed arrays (single instance)
  return {
    positions: new Float32Array([position.x, position.y]),
    rotations: new Float32Array([rotation]),
    colors: new Float32Array([r, g, b]),
    scales: new Float32Array([boidScale]),
    shapeUVs: new Float32Array([uvCoords.u, uvCoords.v]),
    count: 1,
  };
}

/**
 * Prepare instance data for a single boid's body parts
 * Handles deduplication and tail color overrides
 */
function prepareBodyPartsInstanceData(
  boid: Boid,
  speciesConfig: SpeciesConfig | undefined,
  bodyPartsAtlas: BodyPartsAtlasResult,
  scale: number
) {
  const { position, velocity, phenotype, genome } = boid;
  // Use species config body parts (matches main simulation pattern)
  const bodyParts = speciesConfig?.baseGenome?.visual?.bodyParts || [];

  if (bodyParts.length === 0) return null;

  // Filter out glow (handled differently) but keep all other parts
  const renderableParts = bodyParts.filter((part) => {
    const partType = typeof part === "string" ? part : part.type;
    return partType !== "glow";
  });

  if (renderableParts.length === 0) return null;

  // Boid properties
  const boidRotation = Math.atan2(velocity.y, velocity.x);
  const boidColor = colorToRgb(phenotype.color);
  const sizeMultiplier = genome.traits?.size || 1.0;
  const isPredator = speciesConfig?.role === "predator";
  const baseSize = isPredator ? 12 : 8;
  // Match the shape boid scale calculation
  const shapeAtlasCompensation = 1.4;
  const boidScale = baseSize * sizeMultiplier * scale * shapeAtlasCompensation;

  // Get tail color override if present
  const tailColor = speciesConfig?.visualConfig?.tailColor
    ? colorToRgb(speciesConfig.visualConfig.tailColor)
    : boidColor;

  // Prepare data for each unique part type
  const partDataArrays: {
    boidPos: number[];
    boidRotation: number[];
    boidColor: number[];
    boidScale: number[];
    partUV: number[];
    partOffset: number[];
    partRotation: number[];
    partScale: number[];
  } = {
    boidPos: [],
    boidRotation: [],
    boidColor: [],
    boidScale: [],
    partUV: [],
    partOffset: [],
    partRotation: [],
    partScale: [],
  };

  for (const part of renderableParts) {
    // Extract part data
    const partType = typeof part === "string" ? part : part.type;
    const partData = typeof part === "object" ? part : null;
    const partSize = partData?.size || 1.0;
    const partPosX = partData?.position?.x || 0;
    const partPosY = partData?.position?.y || 0;
    const partRotation = partData?.rotation || 0; // Rotation in degrees (from genome)

    // Get UV coordinates for this part type
    const partUV = bodyPartsAtlas.partUVMap.get(partType);
    if (!partUV) continue;

    // Use tail color for tails, body color for everything else
    const partColor = partType === "tail" ? tailColor : boidColor;

    // Add instance data for this part
    partDataArrays.boidPos.push(position.x, position.y);
    partDataArrays.boidRotation.push(boidRotation);
    partDataArrays.boidColor.push(partColor[0], partColor[1], partColor[2]);
    partDataArrays.boidScale.push(boidScale);
    partDataArrays.partUV.push(partUV.u, partUV.v);

    // Use unified coordinate transformation
    // transformBodyPartWebGL handles:
    // - Genome position (-1 to 1) → WebGL offset (pixels)
    // - Genome rotation (degrees) → Radians
    // - Proper scale factor for part type
    // - Y-axis flip for WebGL coordinate system
    const { offset, rotation } = transformBodyPartWebGL(
      { x: partPosX, y: partPosY },
      partRotation,
      partType as BodyPartType,
      boidScale
    );

    partDataArrays.partOffset.push(offset.x, offset.y);
    partDataArrays.partRotation.push(rotation);

    // Scale parts relative to boid body
    // Canvas 2D renders eyes at size * 0.15, we need to match that visual size
    // After testing: 1.5 was too large, reducing to better match Canvas 2D
    const bodyPartScaleMultiplier = 0.7; // Reduced from 1.5 (was too large)

    partDataArrays.partScale.push(
      partSize * boidScale * bodyPartScaleMultiplier
    );
  }

  const count = renderableParts.length;

  return {
    boidPositions: new Float32Array(partDataArrays.boidPos),
    boidRotations: new Float32Array(partDataArrays.boidRotation),
    boidColors: new Float32Array(partDataArrays.boidColor),
    boidScales: new Float32Array(partDataArrays.boidScale),
    partUVs: new Float32Array(partDataArrays.partUV),
    partOffsets: new Float32Array(partDataArrays.partOffset),
    partRotations: new Float32Array(partDataArrays.partRotation),
    partScales: new Float32Array(partDataArrays.partScale),
    count,
  };
}

/**
 * Cleanup WebGL resources
 * Call this when done with the context to free GPU memory
 *
 * @param context - WebGL context to cleanup
 */
export function destroyWebGLContext(context: StaticWebGLContext): void {
  try {
    // Destroy textures
    context.shapeTexture.destroy();
    context.bodyPartsTexture.destroy();

    // Destroy REGL context (cleans up all resources)
    context.regl.destroy();
  } catch (error) {
    console.error("Error destroying WebGL context:", error);
  }
}
