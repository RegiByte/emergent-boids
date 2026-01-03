/**
 * Emoji Atlas Generation
 *
 * Creates a texture atlas for stance symbol emojis.
 * Each emoji is rendered to a grid cell and UV coordinates are stored.
 */

import type REGL from "regl";
import type { StanceSymbols } from "../types.ts";
import type { AtlasResult } from "./types.ts";
import { createPreviewURL } from "./utils.ts";

// Type alias for backwards compatibility
export type EmojiAtlasResult = AtlasResult;

/**
 * Stance symbol configuration
 */
export const stanceSymbols: StanceSymbols = {
  // Predator stances
  hunting: { emoji: "😈", color: "#ff0000" },
  seeking_mate: { emoji: "💕", color: "#ff69b4" },
  eating: { emoji: "🍖", color: "#ffa500" },
  idle: { emoji: "😴", color: "#888888" },
  mating: { emoji: "💑", color: "#ff1493" },

  // Prey stances
  flocking: { emoji: "🐟", color: "#00ff88" },
  fleeing: { emoji: "😱", color: "#ffff00" },
  // eating, seeking_mate, and mating are shared with predators
};

/**
 * Create emoji texture atlas
 */
export const createEmojiAtlas = (): AtlasResult | null => {
  const emojiSize = 64; // Size of each emoji in pixels
  const uniqueEmojis = Array.from(
    new Set(Object.values(stanceSymbols).map((s) => s.emoji)),
  );

  // Calculate atlas dimensions (square grid)
  const gridSize = Math.ceil(Math.sqrt(uniqueEmojis.length));
  const atlasSize = gridSize * emojiSize;

  // Create offscreen canvas
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasSize;
  atlasCanvas.height = atlasSize;
  const ctx = atlasCanvas.getContext("2d");

  if (!ctx) {
    console.error("Failed to create emoji atlas canvas context");
    return null;
  }

  // Clear to transparent
  ctx.clearRect(0, 0, atlasSize, atlasSize);

  // Render each emoji to the atlas
  ctx.font = `${emojiSize * 0.75}px Arial`; // Slightly smaller than cell for padding
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const emojiUVMap = new Map<string, { u: number; v: number }>();

  uniqueEmojis.forEach((emoji, index) => {
    const col = index % gridSize;
    const row = Math.floor(index / gridSize);
    const x = col * emojiSize + emojiSize / 2;
    const y = row * emojiSize + emojiSize / 2;

    ctx.fillText(emoji, x, y);

    // Store UV coordinates (normalized 0-1)
    emojiUVMap.set(emoji, {
      u: col / gridSize,
      v: row / gridSize,
    });
  });

  return {
    canvas: atlasCanvas,
    uvMap: emojiUVMap,
    gridSize,
    cellSize: 1.0 / gridSize, // UV size of each cell,
    previewURL: createPreviewURL(atlasCanvas),
  };
};

/**
 * Create REGL texture from emoji atlas
 */
export const createEmojiTexture = (
  regl: REGL.Regl,
  atlas: AtlasResult,
): REGL.Texture2D => {
  return regl.texture({
    data: atlas.canvas,
    mag: "linear", // Smooth scaling when zoomed in
    min: "linear", // Smooth scaling when zoomed out
    wrap: "clamp", // Don't repeat the texture
    flipY: false, // Canvas is already right-side up
  });
};
