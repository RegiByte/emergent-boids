/**
 * WebGL Draw Command - Trails
 *
 * Renders boid movement trails as lines using instanced rendering.
 * Each trail segment is rendered as a line between two positions.
 */

import type REGL from "regl";
import trailVertShader from "../../../shaders/trail.vert?raw";
import trailFragShader from "../../../shaders/trail.frag?raw";

/**
 * Line geometry for trails (simple line segment)
 * Each segment has 2 vertices: start (0.0) and end (1.0)
 * This is a 1D attribute that controls interpolation between startPos and endPos
 */
const LINE_POSITIONS = [0.0, 1.0];

/**
 * Creates a REGL draw command for rendering trails
 *
 * @param regl - REGL instance
 * @returns REGL draw command for trails
 */
export const createTrailsDrawCommand = (regl: REGL.Regl): REGL.DrawCommand => {
  return regl({
    vert: trailVertShader,
    frag: trailFragShader,

    attributes: {
      // Shared line geometry
      position: LINE_POSITIONS,

      // Per-instance data (one per trail segment)
      startPos: {
        buffer: (regl.prop as (name: string) => unknown)("startPositions"),
        divisor: 1,
      },
      endPos: {
        buffer: (regl.prop as (name: string) => unknown)("endPositions"),
        divisor: 1,
      },
      color: {
        buffer: (regl.prop as (name: string) => unknown)("colors"),
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

    // Line width (WebGL 1.0 only supports lineWidth = 1)
    // For thicker lines, we'd need to use quads, but 1px is fine for trails
    lineWidth: 1,

    primitive: "lines",
    count: 2, // 2 vertices per line
    instances: (regl.prop as unknown as (name: string) => number)("count"),
  });
};
