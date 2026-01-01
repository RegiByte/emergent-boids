/**
 * WebGL Data Preparation - Text Rendering
 *
 * Prepares instance data for text rendering using a font atlas.
 * Converts strings to character quads with UV coordinates.
 */

import type { FontAtlasResult } from "../atlases/fontAtlas";

/**
 * Instance data for text rendering
 */
export type TextInstanceData = {
  charPositions: Float32Array;
  uvOffsets: Float32Array;
  charSizes: Float32Array;
  colors: Float32Array;
  alphas: Float32Array;
  count: number;
};

/**
 * Text layout engine - converts string to character quads
 *
 * @param text - Text string to layout
 * @param x - Starting X position in screen space
 * @param y - Starting Y position in screen space
 * @param r - Red color component (0-1)
 * @param g - Green color component (0-1)
 * @param b - Blue color component (0-1)
 * @param alpha - Alpha transparency (0-1)
 * @param fontAtlas - Font atlas containing character UV coordinates
 * @returns Instance data ready for GPU upload, or null if no characters
 */
export const layoutText = (
  text: string,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
  fontAtlas: FontAtlasResult,
): TextInstanceData | null => {
  const charPositions: number[] = [];
  const uvOffsets: number[] = [];
  const charSizes: number[] = [];
  const colors: number[] = [];
  const alphas: number[] = [];

  let cursorX = x;
  const cursorY = y;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charInfo = fontAtlas.uvMap.get(char);

    if (!charInfo) {
      // Unknown character, skip or use space
      cursorX += fontAtlas.fontSize * 0.5;
      continue;
    }

    // Add character quad
    charPositions.push(cursorX, cursorY);
    uvOffsets.push(charInfo.u, charInfo.v);
    charSizes.push(fontAtlas.charSize, fontAtlas.charSize);
    colors.push(r, g, b);
    alphas.push(alpha);

    // Advance cursor by character width
    cursorX += charInfo.width;
  }

  if (charPositions.length === 0) return null;

  return {
    charPositions: new Float32Array(charPositions),
    uvOffsets: new Float32Array(uvOffsets),
    charSizes: new Float32Array(charSizes),
    colors: new Float32Array(colors),
    alphas: new Float32Array(alphas),
    count: charPositions.length / 2,
  };
};
