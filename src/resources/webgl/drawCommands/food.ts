/**
 * WebGL Draw Command - Food Sources
 *
 * Renders food sources as circles using instanced rendering.
 * Each food source is rendered as a triangle fan with 32 segments.
 */

import type REGL from "regl";
import foodVertShader from "../../../shaders/food.vert?raw";
import foodFragShader from "../../../shaders/food.frag?raw";

/**
 * Circle geometry for food sources
 * Creates a circle with 32 segments for smooth outline
 */
const CIRCLE_SEGMENTS = 32;

const createCirclePositions = (): number[][] => {
  const positions: number[][] = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
    const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    positions.push([Math.cos(angle), Math.sin(angle)]);
  }
  return positions;
};

/**
 * Creates a REGL draw command for rendering food sources
 *
 * @param regl - REGL instance
 * @returns REGL draw command for food sources
 */
export const createFoodDrawCommand = (regl: REGL.Regl): REGL.DrawCommand => {
  const circlePositions = createCirclePositions();

  return regl({
    vert: foodVertShader,
    frag: foodFragShader,

    attributes: {
      // Shared circle shape
      position: circlePositions,

      // Per-instance data
      offset: {
        buffer: (regl.prop as (name: string) => unknown)("positions"),
        divisor: 1,
      },
      color: {
        buffer: (regl.prop as (name: string) => unknown)("colors"),
        divisor: 1,
      },
      radius: {
        buffer: (regl.prop as (name: string) => unknown)("radii"),
        divisor: 1,
      },
      alpha: {
        buffer: (regl.prop as (name: string) => unknown)("alphas"),
        divisor: 1,
      },
    },

    uniforms: {
      transform: (regl.prop as unknown as (name: string) => number[])(
        "transform",
      ),
    },

    // Enable blending for transparency
    blend: {
      enable: true,
      func: {
        srcRGB: "src alpha",
        srcAlpha: 1,
        dstRGB: "one minus src alpha",
        dstAlpha: 1,
      },
    },

    primitive: "triangle fan",
    count: CIRCLE_SEGMENTS + 1,
    instances: (regl.prop as unknown as (name: string) => number)("count"),
  });
};
