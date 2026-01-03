/**
 * WebGL Draw Command - Triangle Boids (Fallback)
 *
 * Renders boids as simple triangles using instanced rendering.
 * This is a fallback when shape-based rendering is not available.
 * Each boid is rendered as a triangle pointing in the direction of movement.
 */

import type REGL from "regl";
import boidVertShader from "../../../../shaders/boid.vert?raw";
import boidFragShader from "../../../../shaders/boid.frag?raw";

/**
 * Triangle vertices (shared by all boids)
 * Pointing right (0 degrees = east)
 * Base size needs to be visible in world coordinates (world is 2500x2500)
 * At default zoom (1.0), we want boids to be ~10 pixels, so 10 world units
 */
const TRIANGLE_POSITIONS = [
  [5, 0], // Tip (right) - 10 units wide total
  [-3, -3], // Bottom left
  [-3, 3], // Top left
];

/**
 * Creates a REGL draw command for rendering boids as triangles
 *
 * @param regl - REGL instance
 * @returns REGL draw command for triangle-based boids
 */
export const createTriangleBoidsDrawCommand = (
  regl: REGL.Regl,
): REGL.DrawCommand => {
  return regl({
    vert: boidVertShader,
    frag: boidFragShader,

    attributes: {
      // Shared triangle shape
      position: TRIANGLE_POSITIONS,

      // Per-instance data
      offset: {
        buffer: (regl.prop as (name: string) => unknown)("positions"),
        divisor: 1,
      },
      rotation: {
        buffer: (regl.prop as (name: string) => unknown)("rotations"),
        divisor: 1,
      },
      color: {
        buffer: (regl.prop as (name: string) => unknown)("colors"),
        divisor: 1,
      },
      scale: {
        buffer: (regl.prop as (name: string) => unknown)("scales"),
        divisor: 1,
      },
    },

    uniforms: {
      transform: (regl.prop as unknown as (name: string) => number[])(
        "transform",
      ),
    },

    count: 3, // 3 vertices per triangle
    instances: (regl.prop as unknown as (name: string) => number)("count"),
  });
};
