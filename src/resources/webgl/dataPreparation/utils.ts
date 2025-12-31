/**
 * Shared utilities for data preparation
 */

import { toRgb } from "@/lib/colors";

/**
 * Convert hex color to normalized RGB array (0-1)
 */
export const colorToRgb = (hexColor: string): [number, number, number] => {
  const [r, g, b] = toRgb(hexColor);
  return [r / 255, g / 255, b / 255];
};

/**
 * Calculate boid rotation from velocity
 * Note: Negate Y because our projection flips Y axis (Canvas Y-down vs WebGL Y-up)
 */
export const calculateBoidRotation = (vx: number, vy: number): number => {
  return Math.atan2(-vy, vx);
};

/**
 * Calculate boid scale for WebGL rendering
 * Matches Canvas 2D sizing with atlas scale compensation
 */
export const calculateBoidScale = (
  isPredator: boolean,
  sizeMultiplier: number,
  renderSize: number
): number => {
  const baseSize = isPredator ? 12 : 8;
  const atlasScaleFactor = 2.5; // Compensate for shape not filling texture
  return baseSize * sizeMultiplier * renderSize * atlasScaleFactor;
};

