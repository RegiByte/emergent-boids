/**
 * WebGL Data Preparation - Health Bars
 *
 * Prepares instance data for health bar rendering.
 * Health bars are shown above boids to indicate their current health level.
 * Only displayed for damaged boids (health < 100%).
 */

import type { Boid } from "../../../../boids/vocabulary/schemas/entities.ts";
import { shouldShowHealthBar } from "../../../../boids/lifecycle/health.ts";

/**
 * Instance data for health bar rendering
 */
export type HealthBarInstanceData = {
  boidPositions: Float32Array;
  healthPercents: Float32Array;
  barColors: Float32Array;
  count: number;
};

/**
 * Health bar color thresholds and colors
 */
const HEALTH_BAR_CONFIG = {
  thresholds: {
    high: 0.7, // > 70% = green
    medium: 0.4, // 40-70% = yellow
    // < 40% = red
  },
  colors: {
    high: { r: 0.0, g: 1.0, b: 0.0 }, // Green
    medium: { r: 1.0, g: 1.0, b: 0.0 }, // Yellow
    low: { r: 1.0, g: 0.0, b: 0.0 }, // Red
  },
} as const;

/**
 * Determines health bar color based on health percentage
 */
const getHealthBarColor = (
  healthPercent: number,
): { r: number; g: number; b: number } => {
  if (healthPercent > HEALTH_BAR_CONFIG.thresholds.high) {
    return HEALTH_BAR_CONFIG.colors.high;
  } else if (healthPercent > HEALTH_BAR_CONFIG.thresholds.medium) {
    return HEALTH_BAR_CONFIG.colors.medium;
  } else {
    return HEALTH_BAR_CONFIG.colors.low;
  }
};

/**
 * Prepares health bar instance data for GPU rendering
 *
 * @param boids - Array of boids to render health bars for
 * @param healthBarsEnabled - Whether health bars are enabled in UI settings
 * @returns Instance data ready for GPU upload
 */
export const prepareHealthBarData = (
  boids: Boid[],
  healthBarsEnabled: boolean,
): HealthBarInstanceData => {
  // Early return if health bars are disabled
  if (!healthBarsEnabled) {
    return {
      boidPositions: new Float32Array(0),
      healthPercents: new Float32Array(0),
      barColors: new Float32Array(0),
      count: 0,
    };
  }

  // Filter boids that should show health bars (damaged boids only)
  const boidsWithBars = boids.filter((boid) => shouldShowHealthBar(boid));

  const count = boidsWithBars.length;
  const boidPositions = new Float32Array(count * 2);
  const healthPercents = new Float32Array(count);
  const barColors = new Float32Array(count * 3);

  for (let i = 0; i < boidsWithBars.length; i++) {
    const boid = boidsWithBars[i];
    const healthPercent = boid.health / boid.phenotype.maxHealth;

    // Determine bar color based on health percentage
    const color = getHealthBarColor(healthPercent);

    boidPositions[i * 2] = boid.position.x;
    boidPositions[i * 2 + 1] = boid.position.y;
    healthPercents[i] = healthPercent;
    barColors[i * 3] = color.r;
    barColors[i * 3 + 1] = color.g;
    barColors[i * 3 + 2] = color.b;
  }

  return { boidPositions, healthPercents, barColors, count };
};
