/**
 * WebGL Draw Command - Health Bars
 *
 * Renders health bars above boids using instanced rendering.
 * Each bar is rendered as a quad (triangle strip) with background and fill layers.
 * Health bars are positioned above energy bars.
 */

import type REGL from "regl";
import healthBarVertShader from "../../../shaders/healthBar.vert?raw";
import healthBarFragShader from "../../../shaders/healthBar.frag?raw";

/**
 * Quad geometry for health bars (unit square)
 */
const QUAD_POSITIONS = [
  [0, 0], // Bottom-left
  [1, 0], // Bottom-right
  [0, 1], // Top-left
  [1, 1], // Top-right
];

/**
 * Health bar dimensions and positioning
 */
export const HEALTH_BAR_CONFIG = {
  width: 22,
  height: 3,
  offsetY: 25, // Position above energy bar (5px higher)
} as const;

/**
 * Creates a REGL draw command for rendering health bars
 *
 * @param regl - REGL instance
 * @returns REGL draw command for health bars
 */
export const createHealthBarsDrawCommand = (
  regl: REGL.Regl
): REGL.DrawCommand => {
  return regl({
    vert: healthBarVertShader,
    frag: healthBarFragShader,

    attributes: {
      // Shared quad geometry
      position: QUAD_POSITIONS,

      // Per-instance data
      boidPos: {
        buffer: (regl.prop as (name: string) => unknown)("boidPositions"),
        divisor: 1,
      },
      healthPercent: {
        buffer: (regl.prop as (name: string) => unknown)("healthPercents"),
        divisor: 1,
      },
      barColor: {
        buffer: (regl.prop as (name: string) => unknown)("barColors"),
        divisor: 1,
      },
    },

    uniforms: {
      transform: (regl.prop as unknown as (name: string) => number[])(
        "transform"
      ),
      barWidth: HEALTH_BAR_CONFIG.width,
      barHeight: HEALTH_BAR_CONFIG.height,
      barOffsetY: HEALTH_BAR_CONFIG.offsetY,
      layerType: (regl.prop as unknown as (name: string) => number)(
        "layerType"
      ),
    },

    // CRITICAL: Disable depth testing for 2D overlays
    depth: {
      enable: false,
    },

    // Enable blending for proper layering
    blend: {
      enable: true,
      func: {
        srcRGB: "src alpha",
        srcAlpha: 1,
        dstRGB: "one minus src alpha",
        dstAlpha: 1,
      },
    },

    primitive: "triangle strip",
    count: 4, // 4 vertices per quad
    instances: (regl.prop as unknown as (name: string) => number)("count"),
  });
};

