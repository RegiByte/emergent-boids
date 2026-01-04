/**
 * WebGL Data Preparation - Stance Symbols
 *
 * Prepares instance data for stance symbol rendering.
 * Shows emoji symbols above boids when their stance changes.
 */

import { iterateBoids } from "@/boids/iterators.ts";
import type { BoidsById } from "../../../../boids/vocabulary/schemas/entities.ts";
import type { EmojiAtlasResult } from "../atlases/emojiAtlas.ts";
import { stanceSymbols } from "../atlases/emojiAtlas.ts";

/**
 * Instance data for stance symbol rendering
 */
export type StanceSymbolInstanceData = {
  boidPositions: Float32Array;
  uvOffsets: Float32Array;
  alphas: Float32Array;
  count: number;
};

/**
 * Stance symbol display configuration
 */
const STANCE_SYMBOL_CONFIG = {
  displayDuration: 90, // Show for 90 frames (~3 seconds at 30 FPS)
  fadeStart: 60, // Start fading at 60 frames (~2 seconds)
} as const;

/**
 * Prepares stance symbol instance data for GPU rendering
 *
 * @param boids - Array of boids to check for stance symbols
 * @param emojiAtlas - Emoji atlas containing UV coordinates
 * @param currentFrame - Current simulation frame number
 * @param stanceSymbolsEnabled - Whether stance symbols are enabled in UI settings
 * @returns Instance data ready for GPU upload, or null if no symbols to display
 */
export const prepareStanceSymbolData = (
  boids: BoidsById,
  emojiAtlas: EmojiAtlasResult,
  currentFrame: number,
  stanceSymbolsEnabled: boolean,
): StanceSymbolInstanceData | null => {
  // Check if stance symbols are enabled
  if (!stanceSymbolsEnabled) {
    return null;
  }

  const boidPositions: number[] = [];
  const uvOffsets: number[] = [];
  const alphas: number[] = [];

  for (const boid of iterateBoids(boids)) {
    // Check if stance changed recently (matches Canvas 2D logic from pipeline.ts)
    const framesSinceChange = currentFrame - boid.stanceEnteredAtFrame;

    if (framesSinceChange > STANCE_SYMBOL_CONFIG.displayDuration) {
      continue; // Don't show old stances
    }

    // Get emoji for this stance
    const stanceInfo = stanceSymbols[boid.stance];
    if (!stanceInfo) continue;

    const uvCoords = emojiAtlas.uvMap.get(stanceInfo.emoji);
    if (!uvCoords) continue;

    // Calculate fade-out alpha
    let alpha = 1.0;
    if (framesSinceChange > STANCE_SYMBOL_CONFIG.fadeStart) {
      const fadeProgress =
        (framesSinceChange - STANCE_SYMBOL_CONFIG.fadeStart) /
        (STANCE_SYMBOL_CONFIG.displayDuration - STANCE_SYMBOL_CONFIG.fadeStart);
      alpha = 1.0 - fadeProgress;
    }

    // Add instance data
    boidPositions.push(boid.position.x, boid.position.y);
    uvOffsets.push(uvCoords.u, uvCoords.v);
    alphas.push(alpha);
  }

  if (boidPositions.length === 0) {
    return null;
  }

  return {
    boidPositions: new Float32Array(boidPositions),
    uvOffsets: new Float32Array(uvOffsets),
    alphas: new Float32Array(alphas),
    count: boidPositions.length / 2,
  };
};
