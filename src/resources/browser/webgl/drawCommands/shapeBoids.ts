/**
 * Shape Boids Draw Command
 *
 * REGL draw command for rendering shape-based boids using texture atlas
 */

import type REGL from "regl";
import type { ShapeAtlasResult } from "../atlases/shapeAtlas.ts";

// Import shaders
// Session 101: Multi-color shaders with marker detection
import multiColorBoidVertShader from "@/shaders/multiColorBoid.vert?raw";
import multiColorBoidFragShader from "@/shaders/multiColorBoid.frag?raw";

// Quad vertices for texture-based shape rendering (unit square)
const QUAD_POSITIONS = [
  [0, 0], // Bottom-left
  [1, 0], // Bottom-right
  [0, 1], // Top-left
  [1, 1], // Top-right
];

/**
 * Create REGL draw command for shape-based boids
 */
export const createShapeBoidsDrawCommand = (
  regl: REGL.Regl,
  shapeTexture: REGL.Texture2D,
  shapeAtlas: ShapeAtlasResult,
): REGL.DrawCommand => {
  return regl({
    vert: multiColorBoidVertShader,
    frag: multiColorBoidFragShader,

    attributes: {
      // Shared quad geometry
      position: QUAD_POSITIONS,

      // Per-instance data
      offset: {
        buffer: (regl.prop as (name: string) => unknown)("positions"),
        divisor: 1,
      },
      rotation: {
        buffer: (regl.prop as (name: string) => unknown)("rotations"),
        divisor: 1,
      },
      color: {
        buffer: (regl.prop as (name: string) => unknown)("colors"),
        divisor: 1,
      },
      borderColor: {
        buffer: (regl.prop as (name: string) => unknown)("borderColors"),
        divisor: 1,
      },
      shadowColor: {
        buffer: (regl.prop as (name: string) => unknown)("shadowColors"),
        divisor: 1,
      },
      scale: {
        buffer: (regl.prop as (name: string) => unknown)("scales"),
        divisor: 1,
      },
      shapeUV: {
        buffer: (regl.prop as (name: string) => unknown)("shapeUVs"),
        divisor: 1,
      },
    },

    uniforms: {
      transform: (regl.prop as unknown as (name: string) => number[])(
        "transform",
      ),
      shapeTexture: shapeTexture,
      cellSize: shapeAtlas.cellSize,
    },

    // Enable blending for anti-aliased edges
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
