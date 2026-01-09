/**
 * WebGL Data Preparation - Obstacles (Session 130)
 *
 * Prepares instance data for obstacle rendering using texture atlas.
 */

import type { Obstacle } from "../../../../boids/vocabulary/schemas/entities.ts";

/**
 * Instance data for obstacle rendering
 */
export type ObstacleInstanceData = {
  positions: Float32Array;
  radii: Float32Array;
  count: number;
};

/**
 * Prepares obstacle instance data for GPU rendering
 *
 * @param obstacles - Array of obstacles to render
 * @returns Instance data ready for GPU upload
 */
export const prepareObstacleData = (
  obstacles: Obstacle[],
): ObstacleInstanceData => {
  const count = obstacles.length;
  const positions = new Float32Array(count * 2);
  const radii = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const obstacle = obstacles[i];

    // Position
    positions[i * 2] = obstacle.position.x;
    positions[i * 2 + 1] = obstacle.position.y;

    // Radius
    radii[i] = obstacle.radius;
  }

  return { positions, radii, count };
};

