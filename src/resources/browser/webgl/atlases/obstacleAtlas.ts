/**
 * Obstacle Atlas Generation
 *
 * Creates a texture atlas for obstacle hazard patterns.
 * Renders the hazard stripe pattern (black/yellow diagonal) to a texture
 * so both Canvas and WebGL renderers use the exact same visual.
 */

import type REGL from 'regl'
import type { AtlasResult } from './types.ts'
import { createPreviewURL } from './utils.ts'

export type { AtlasResult }

/**
 * Obstacle visual configuration
 */
export const OBSTACLE_CONFIG = {
  atlasSize: 128, // Size of obstacle texture
  stripeWidth: 8, // Width of each hazard stripe
  borderWidth: 3, // Width of yellow border
  borderColor: '#FFD700', // Gold/yellow border
  stripeColor1: '#000000', // Black stripes
  stripeColor2: '#FFD700', // Yellow stripes
  warningEmoji: '⚠', // Warning symbol for large obstacles
} as const

/**
 * Create obstacle texture atlas
 * Renders a circular hazard pattern with diagonal stripes
 */
export const createObstacleAtlas = (): AtlasResult | null => {
  const size = OBSTACLE_CONFIG.atlasSize

  const atlasCanvas = document.createElement('canvas')
  atlasCanvas.width = size
  atlasCanvas.height = size
  const ctx = atlasCanvas.getContext('2d')

  if (!ctx) {
    console.error('Failed to create obstacle atlas canvas context')
    return null
  }

  ctx.clearRect(0, 0, size, size)

  const centerX = size / 2
  const centerY = size / 2
  const radius = size / 2 - OBSTACLE_CONFIG.borderWidth

  ctx.save()
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.clip()

  const stripeWidth = OBSTACLE_CONFIG.stripeWidth
  const numStripes = Math.ceil((radius * 2 + radius * 2) / stripeWidth)

  for (let i = -numStripes; i < numStripes; i++) {
    ctx.fillStyle =
      i % 2 === 0 ? OBSTACLE_CONFIG.stripeColor1 : OBSTACLE_CONFIG.stripeColor2
    ctx.fillRect(
      centerX - radius * 2 + i * stripeWidth,
      centerY - radius * 2,
      stripeWidth,
      radius * 4
    )
  }

  ctx.restore()

  ctx.strokeStyle = OBSTACLE_CONFIG.borderColor
  ctx.lineWidth = OBSTACLE_CONFIG.borderWidth
  ctx.shadowColor = OBSTACLE_CONFIG.borderColor
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.shadowBlur = 0

  const uvMap = new Map<string, { u: number; v: number }>()
  uvMap.set('obstacle', { u: 0, v: 0 })

  return {
    canvas: atlasCanvas,
    uvMap,
    gridSize: 1, // Single texture
    cellSize: 1.0, // Full texture
    previewURL: createPreviewURL(atlasCanvas),
  }
}

/**
 * Create REGL texture from obstacle atlas
 */
export const createObstacleTexture = (
  regl: REGL.Regl,
  atlas: AtlasResult
): REGL.Texture2D => {
  return regl.texture({
    data: atlas.canvas,
    mag: 'linear', // Smooth scaling when zoomed in
    min: 'linear', // Smooth scaling when zoomed out
    wrap: 'clamp', // Don't repeat the texture
    flipY: false, // Canvas is already right-side up
  })
}
