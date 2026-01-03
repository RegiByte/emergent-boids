/**
 * Shared utilities for data preparation
 */

import { toRgb } from "@/lib/colors.ts";

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

// NOTE (Session 96):
// Scale is now derived from `boid.phenotype.baseSize` (== collisionRadius) plus a per-shape
// max-extent factor (see `src/lib/shapeSizing.ts`). Keeping sizing logic centralized prevents
// drift between Canvas and WebGL.
