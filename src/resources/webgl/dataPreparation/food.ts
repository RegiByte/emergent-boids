/**
 * WebGL Data Preparation - Food Sources
 *
 * Prepares instance data for food source rendering.
 */

import type { FoodSource } from "../../../boids/vocabulary/schemas/entities";
import { toRgb } from "../../../lib/colors";

/**
 * Instance data for food source rendering
 */
export type FoodInstanceData = {
  positions: Float32Array;
  colors: Float32Array;
  radii: Float32Array;
  alphas: Float32Array;
  count: number;
};

/**
 * Food source visual configuration
 */
const FOOD_CONFIG = {
  minRadius: 12,
  maxRadius: 28,
  minAlpha: 0.5,
  maxAlpha: 1.0,
  preyColor: "#4CAF50",
  predatorColor: "#F44336",
} as const;

/**
 * Prepares food source instance data for GPU rendering
 *
 * @param foodSources - Array of food sources to render
 * @returns Instance data ready for GPU upload
 */
export const prepareFoodData = (
  foodSources: FoodSource[],
): FoodInstanceData => {
  const count = foodSources.length;
  const positions = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const alphas = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const food = foodSources[i];

    // Position
    positions[i * 2] = food.position.x;
    positions[i * 2 + 1] = food.position.y;

    // Color based on type (green for prey, red for predator)
    const color =
      food.sourceType === "prey"
        ? FOOD_CONFIG.preyColor
        : FOOD_CONFIG.predatorColor;
    const [r, g, b] = toRgb(color);
    colors[i * 3] = r / 255;
    colors[i * 3 + 1] = g / 255;
    colors[i * 3 + 2] = b / 255;

    // Radius scales with energy (12-28px)
    const energyRatio = food.energy / food.maxEnergy;
    radii[i] =
      FOOD_CONFIG.minRadius +
      energyRatio * (FOOD_CONFIG.maxRadius - FOOD_CONFIG.minRadius);

    // Alpha scales with energy (0.5-1.0)
    alphas[i] = Math.max(FOOD_CONFIG.minAlpha, energyRatio);
  }

  return { positions, colors, radii, alphas, count };
};
