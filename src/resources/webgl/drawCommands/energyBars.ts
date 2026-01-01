/**
 * WebGL Draw Command - Energy Bars
 *
 * Renders energy bars above boids using instanced rendering.
 * Each bar is rendered as a quad (triangle strip) with background and fill layers.
 */

import type REGL from "regl";
import energyBarVertShader from "../../../shaders/energyBar.vert?raw";
import energyBarFragShader from "../../../shaders/energyBar.frag?raw";

/**
 * Quad geometry for energy bars (unit square)
 */
const QUAD_POSITIONS = [
  [0, 0], // Bottom-left
  [1, 0], // Bottom-right
  [0, 1], // Top-left
  [1, 1], // Top-right
];

/**
 * Energy bar dimensions and positioning
 */
export const ENERGY_BAR_CONFIG = {
  width: 22,
  height: 3,
  offsetY: 20,
} as const;

/**
 * Creates a REGL draw command for rendering energy bars
 *
 * @param regl - REGL instance
 * @returns REGL draw command for energy bars
 */
export const createEnergyBarsDrawCommand = (
  regl: REGL.Regl,
): REGL.DrawCommand => {
  return regl({
    vert: energyBarVertShader,
    frag: energyBarFragShader,

    attributes: {
      // Shared quad geometry
      position: QUAD_POSITIONS,

      // Per-instance data
      boidPos: {
        buffer: (regl.prop as (name: string) => unknown)("boidPositions"),
        divisor: 1,
      },
      energyPercent: {
        buffer: (regl.prop as (name: string) => unknown)("energyPercents"),
        divisor: 1,
      },
      barColor: {
        buffer: (regl.prop as (name: string) => unknown)("barColors"),
        divisor: 1,
      },
    },

    uniforms: {
      transform: (regl.prop as unknown as (name: string) => number[])(
        "transform",
      ),
      barWidth: ENERGY_BAR_CONFIG.width,
      barHeight: ENERGY_BAR_CONFIG.height,
      barOffsetY: ENERGY_BAR_CONFIG.offsetY,
      layerType: (regl.prop as unknown as (name: string) => number)(
        "layerType",
      ),
    },

    // CRITICAL: Disable depth testing for 2D overlays
    // Without this, depth buffer decides visibility instead of draw order
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
