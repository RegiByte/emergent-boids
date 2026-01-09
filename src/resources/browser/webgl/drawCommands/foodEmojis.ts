/**
 * WebGL Draw Command - Food Emojis
 *
 * Renders emoji symbols on top of food sources using instanced rendering.
 * Uses the same technique as stance symbols - textured quads with emoji atlas.
 * 
 * Session 130: Created to render 🌿 (prey) and 🥩 (predator) food emojis
 */

import type REGL from "regl";
import foodEmojiVertShader from "../../../../shaders/foodEmoji.vert?raw";
import foodEmojiFragShader from "../../../../shaders/foodEmoji.frag?raw";

/**
 * Creates a REGL draw command for rendering food emoji overlays
 *
 * @param regl - REGL instance
 * @param emojiTexture - Emoji atlas texture
 * @param cellSize - UV size of each emoji cell (1.0 / gridSize)
 * @returns REGL draw command for food emojis
 */
export const createFoodEmojiDrawCommand = (
  regl: REGL.Regl,
  emojiTexture: REGL.Texture2D,
  cellSize: number,
): REGL.DrawCommand => {
  // Quad vertices (two triangles forming a square)
  const quadPositions = [
    [-1, -1], // Bottom-left
    [1, -1],  // Bottom-right
    [-1, 1],  // Top-left
    [1, 1],   // Top-right
  ];

  return regl({
    vert: foodEmojiVertShader,
    frag: foodEmojiFragShader,

    attributes: {
      // Shared quad shape
      position: quadPositions,

      // Per-instance data
      foodPosition: {
        buffer: (regl.prop as (name: string) => unknown)("foodPositions"),
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
      emojiTexture,
      cellSize,
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

    depth: {
      enable: false,
    },

    primitive: "triangle strip",
    count: 4, // 4 vertices for a quad
    instances: (regl.prop as unknown as (name: string) => number)("count"),
  });
};

