/**
 * Font Atlas Generation
 *
 * Creates a bitmap font texture atlas for text rendering.
 * Each character is rendered to a grid cell with UV coordinates and width metrics.
 */

import type REGL from 'regl'
import type { AtlasResult } from './types.ts'
import type { ExpandType } from '@/utils/types.ts'
import { createPreviewURL } from './utils.ts'

export type FontAtlasResult = ExpandType<
  AtlasResult<{
    u: number
    v: number
    width: number
  }> & {
    charSize: number
    fontSize: number
  }
>

/**
 * Create bitmap font atlas for text rendering
 */
export const createFontAtlas = (
  fontFamily: string,
  fontSize: number,
  chars: string
): FontAtlasResult | null => {
  const charSize = fontSize * 1.5 // Extra padding for descenders/ascenders
  const uniqueChars = Array.from(new Set(chars))

  const gridSize = Math.ceil(Math.sqrt(uniqueChars.length))
  const atlasSize = gridSize * charSize

  const atlasCanvas = document.createElement('canvas')
  atlasCanvas.width = atlasSize
  atlasCanvas.height = atlasSize
  const ctx = atlasCanvas.getContext('2d')

  if (!ctx) {
    console.error('Failed to create font atlas canvas context')
    return null
  }

  ctx.clearRect(0, 0, atlasSize, atlasSize)

  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'white' // White text, we'll colorize in shader

  const charUVMap = new Map<
    string,
    {
      u: number
      v: number
      width: number // Actual character width for proper spacing
    }
  >()

  uniqueChars.forEach((char, index) => {
    const col = index % gridSize
    const row = Math.floor(index / gridSize)
    const x = col * charSize + charSize / 2
    const y = row * charSize + charSize / 2

    ctx.fillText(char, x, y)

    const metrics = ctx.measureText(char)
    const charWidth = metrics.width

    charUVMap.set(char, {
      u: col / gridSize,
      v: row / gridSize,
      width: charWidth,
    })
  })

  return {
    canvas: atlasCanvas,
    uvMap: charUVMap,
    gridSize,
    cellSize: 1.0 / gridSize,
    charSize, // Size of each cell in pixels
    fontSize,
    previewURL: createPreviewURL(atlasCanvas),
  }
}

/**
 * Create REGL texture from font atlas
 */
export const createFontTexture = (
  regl: REGL.Regl,
  atlas: FontAtlasResult
): REGL.Texture2D => {
  return regl.texture({
    data: atlas.canvas,
    mag: 'linear',
    min: 'linear',
    wrap: 'clamp',
    flipY: false,
  })
}

/**
 * Default character set for stats rendering
 * Includes: A-Z, a-z, 0-9, and common symbols
 */
export const DEFAULT_FONT_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 :.,-+()[]{}!?@#$%&*=/'
