/**
 * WebGL Draw Command - Text Rendering
 *
 * Renders text using a font atlas texture and instanced rendering.
 * Each character is rendered as a textured quad.
 */

import type REGL from "regl";
import textVertShader from "../../../shaders/text.vert?raw";
import textFragShader from "../../../shaders/text.frag?raw";

/**
 * Quad geometry for text characters (unit square)
 */
const TEXT_QUAD_POSITIONS = [
  [0, 0], // Bottom-left
  [1, 0], // Bottom-right
  [0, 1], // Top-left
  [1, 1], // Top-right
];

/**
 * Creates a REGL draw command for rendering text
 *
 * @param regl - REGL instance
 * @param fontTexture - Font atlas texture
 * @param cellSize - Size of each cell in the font atlas
 * @returns REGL draw command for text rendering
 */
export const createTextDrawCommand = (
  regl: REGL.Regl,
  fontTexture: REGL.Texture2D,
  cellSize: number,
): REGL.DrawCommand => {
  return regl({
    vert: textVertShader,
    frag: textFragShader,

    attributes: {
      // Shared quad geometry
      position: TEXT_QUAD_POSITIONS,

      // Per-instance data (per character)
      charPos: {
        buffer: (regl.prop as (name: string) => unknown)("charPositions"),
        divisor: 1,
      },
      uvOffset: {
        buffer: (regl.prop as (name: string) => unknown)("uvOffsets"),
        divisor: 1,
      },
      charSize: {
        buffer: (regl.prop as (name: string) => unknown)("charSizes"),
        divisor: 1,
      },
      color: {
        buffer: (regl.prop as (name: string) => unknown)("colors"),
        divisor: 1,
      },
      alpha: {
        buffer: (regl.prop as (name: string) => unknown)("alphas"),
        divisor: 1,
      },
    },

    uniforms: {
      fontTexture: fontTexture,
      resolution: (regl.prop as unknown as (name: string) => number[])(
        "resolution",
      ),
      cellSize: cellSize,
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

    // 2D overlay - use painter's algorithm, not depth testing
    depth: {
      enable: false,
    },

    primitive: "triangle strip",
    count: 4,
    instances: (regl.prop as unknown as (name: string) => number)("count"),
  });
};
