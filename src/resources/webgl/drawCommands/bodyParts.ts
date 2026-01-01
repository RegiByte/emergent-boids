/**
 * Body Parts Draw Command
 *
 * REGL draw command for rendering body parts using texture atlas
 * One instance per body part per boid
 */

import type REGL from "regl";
import type { BodyPartsAtlasResult } from "../atlases/bodyPartsAtlas";

// Import shaders
// Session 102: Multi-color body parts shaders
import bodyPartVertShader from "@/shaders/multiColorBodyPart.vert?raw";
import bodyPartFragShader from "@/shaders/multiColorBodyPart.frag?raw";

// Quad vertices for body parts (unit square)
const QUAD_POSITIONS = [
  [0, 0], // Bottom-left
  [1, 0], // Bottom-right
  [0, 1], // Top-left
  [1, 1], // Top-right
];

/**
 * Create REGL draw command for body parts
 */
export const createBodyPartsDrawCommand = (
  regl: REGL.Regl,
  bodyPartsTexture: REGL.Texture2D,
  bodyPartsAtlas: BodyPartsAtlasResult,
): REGL.DrawCommand => {
  return regl({
    vert: bodyPartVertShader,
    frag: bodyPartFragShader,

    attributes: {
      // Shared quad geometry
      position: QUAD_POSITIONS,

      // Per-instance data (one instance per body part per boid)
      boidPos: {
        buffer: (regl.prop as (name: string) => unknown)("boidPositions"),
        divisor: 1,
      },
      boidRotation: {
        buffer: (regl.prop as (name: string) => unknown)("boidRotations"),
        divisor: 1,
      },
      boidColor: {
        buffer: (regl.prop as (name: string) => unknown)("boidColors"),
        divisor: 1,
      },
      boidScale: {
        buffer: (regl.prop as (name: string) => unknown)("boidScales"),
        divisor: 1,
      },
      partUV: {
        buffer: (regl.prop as (name: string) => unknown)("partUVs"),
        divisor: 1,
      },
      partOffset: {
        buffer: (regl.prop as (name: string) => unknown)("partOffsets"),
        divisor: 1,
      },
      partRotation: {
        buffer: (regl.prop as (name: string) => unknown)("partRotations"),
        divisor: 1,
      },
      partScale: {
        buffer: (regl.prop as (name: string) => unknown)("partScales"),
        divisor: 1,
      },
      // Session 102: Multi-color attributes (generic!)
      primaryColor: {
        buffer: (regl.prop as (name: string) => unknown)("primaryColors"),
        divisor: 1,
      },
      secondaryColor: {
        buffer: (regl.prop as (name: string) => unknown)("secondaryColors"),
        divisor: 1,
      },
      tertiaryColor: {
        buffer: (regl.prop as (name: string) => unknown)("tertiaryColors"),
        divisor: 1,
      },
    },

    uniforms: {
      transform: (regl.prop as unknown as (name: string) => number[])(
        "transform",
      ),
      bodyPartsTexture: bodyPartsTexture,
      cellSize: bodyPartsAtlas.cellSize,
    },

    // CRITICAL: Disable depth testing for proper layering
    // Body parts should render on top of boids (painter's algorithm)
    depth: {
      enable: false,
    },

    // Enable blending for transparency
    blend: {
      enable: true,
      func: {
        srcRGB: "src alpha",
        srcAlpha: 1,
        dstRGB: "one minus src alpha",
        dstAlpha: 1,
      },
    },

    primitive: "triangle strip",
    count: 4, // 4 vertices for quad
    instances: (regl.prop as unknown as (name: string) => number)("count"),
  });
};
