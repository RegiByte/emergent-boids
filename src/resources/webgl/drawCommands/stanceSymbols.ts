/**
 * WebGL Draw Command - Stance Symbols
 *
 * Renders emoji-based stance symbols above boids using instanced rendering.
 * Each symbol is rendered as a textured quad using the emoji atlas.
 */

import type REGL from "regl";
import stanceSymbolVertShader from "../../../shaders/stanceSymbol.vert?raw";
import stanceSymbolFragShader from "../../../shaders/stanceSymbol.frag?raw";

/**
 * Quad geometry for stance symbols (unit square)
 */
const SYMBOL_QUAD_POSITIONS = [
  [0, 0], // Bottom-left
  [1, 0], // Bottom-right
  [0, 1], // Top-left
  [1, 1], // Top-right
];

/**
 * Stance symbol rendering configuration
 */
export const STANCE_SYMBOL_CONFIG = {
  size: 20, // 20px symbols in world space
} as const;

/**
 * Creates a REGL draw command for rendering stance symbols
 *
 * @param regl - REGL instance
 * @param emojiTexture - Emoji atlas texture
 * @param cellSize - Size of each cell in the emoji atlas
 * @returns REGL draw command for stance symbols, or null if texture is not available
 */
export const createStanceSymbolsDrawCommand = (
  regl: REGL.Regl,
  emojiTexture: REGL.Texture2D,
  cellSize: number,
): REGL.DrawCommand => {
  return regl({
    vert: stanceSymbolVertShader,
    frag: stanceSymbolFragShader,

    attributes: {
      // Shared quad geometry
      position: SYMBOL_QUAD_POSITIONS,

      // Per-instance data
      boidPos: {
        buffer: (regl.prop as (name: string) => unknown)("boidPositions"),
        divisor: 1,
      },
      uvOffset: {
        buffer: (regl.prop as (name: string) => unknown)("uvOffsets"),
        divisor: 1,
      },
      alpha: {
        buffer: (regl.prop as (name: string) => unknown)("alphas"),
        divisor: 1,
      },
    },

    uniforms: {
      transform: (regl.prop as unknown as (name: string) => number[])(
        "transform",
      ),
      emojiTexture: emojiTexture,
      cellSize: cellSize,
      symbolSize: STANCE_SYMBOL_CONFIG.size,
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
