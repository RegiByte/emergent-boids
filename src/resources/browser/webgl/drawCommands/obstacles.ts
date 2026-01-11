/**
 * WebGL Draw Command - Obstacles
 *
 * Renders obstacles using pre-rendered texture atlas (hazard stripes).
 * Uses instanced rendering with textured quads.
 */

import type REGL from 'regl'
import obstacleVertShader from '../../../../shaders/obstacle.vert?raw'
import obstacleFragShader from '../../../../shaders/obstacle.frag?raw'

/**
 * Creates a REGL draw command for rendering obstacles
 *
 * @param regl - REGL instance
 * @param obstacleTexture - Pre-rendered obstacle texture (hazard pattern)
 * @returns REGL draw command for obstacles
 */
export const createObstacleDrawCommand = (
  regl: REGL.Regl,
  obstacleTexture: REGL.Texture2D
): REGL.DrawCommand => {
  const quadPositions = [
    [-1, -1], // Bottom-left
    [1, -1], // Bottom-right
    [-1, 1], // Top-left
    [1, 1], // Top-right
  ]

  return regl({
    vert: obstacleVertShader,
    frag: obstacleFragShader,

    attributes: {
      position: quadPositions,

      obstaclePosition: {
        buffer: (regl.prop as (name: string) => unknown)('positions'),
        divisor: 1,
      },
      radius: {
        buffer: (regl.prop as (name: string) => unknown)('radii'),
        divisor: 1,
      },
    },

    uniforms: {
      transform: (regl.prop as unknown as (name: string) => number[])(
        'transform'
      ),
      obstacleTexture,
    },

    blend: {
      enable: true,
      func: {
        srcRGB: 'src alpha',
        srcAlpha: 1,
        dstRGB: 'one minus src alpha',
        dstAlpha: 1,
      },
    },

    depth: {
      enable: false,
    },

    primitive: 'triangle strip',
    count: 4, // 4 vertices for a quad
    instances: (regl.prop as unknown as (name: string) => number)('count'),
  })
}
