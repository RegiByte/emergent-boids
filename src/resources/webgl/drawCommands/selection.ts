/**
 * WebGL Draw Command - Selection Circles
 *
 * Renders selection circles using instanced rendering.
 * Used for picker mode and followed boid indicators.
 */

import type REGL from "regl";
import selectionVertShader from "../../../shaders/selection.vert?raw";
import selectionFragShader from "../../../shaders/selection.frag?raw";

/**
 * Circle outline geometry configuration
 */
const OUTLINE_SEGMENTS = 64;

/**
 * Creates circle outline positions for line loop rendering
 */
const createCircleOutlinePositions = (): number[][] => {
  const positions: number[][] = [];
  for (let i = 0; i < OUTLINE_SEGMENTS; i++) {
    const angle = (i / OUTLINE_SEGMENTS) * Math.PI * 2;
    positions.push([Math.cos(angle), Math.sin(angle)]);
  }
  return positions;
};

/**
 * Creates a REGL draw command for rendering selection circles
 *
 * @param regl - REGL instance
 * @returns REGL draw command for selection circles
 */
export const createSelectionCirclesDrawCommand = (
  regl: REGL.Regl,
): REGL.DrawCommand => {
  const outlinePositions = createCircleOutlinePositions();

  return regl({
    vert: selectionVertShader,
    frag: selectionFragShader,

    attributes: {
      // Shared circle outline geometry
      position: outlinePositions,

      // Per-instance data
      center: {
        buffer: (regl.prop as (name: string) => unknown)("centers"),
        divisor: 1,
      },
      radius: {
        buffer: (regl.prop as (name: string) => unknown)("radii"),
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

    // Note: WebGL line width is limited to 1.0 on most systems
    // For thicker lines, we'd need to use triangle strips or instanced quads
    lineWidth: 1,

    primitive: "line loop",
    count: OUTLINE_SEGMENTS,
    instances: (regl.prop as unknown as (name: string) => number)("count"),
  });
};
