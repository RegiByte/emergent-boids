/**
 * Shape Rendering Functions - Atlas Edition
 *
 * UNIFIED RENDERING: Canvas 2D now uses texture atlases for EVERYTHING
 * for pixel-perfect visual parity with WebGL.
 *
 * Architecture:
 * - Base shapes: Atlas-based rendering (single source of truth!)
 * - Body parts: Atlas-based rendering (single source of truth!)
 * - Coordinate system: Unified transformations via coordinates.ts
 * - Drawing responsibility: Renderers handle their own fill/stroke
 * - Color tinting: Pixel-level color replacement with caching
 *
 * Philosophy: Atlas for all → perfect Canvas/WebGL parity
 * Pattern: Shape renderers perform COMPLETE drawing (not just path creation)
 *
 * Technical Note:
 * - WebGL uses shaders to tint white atlas shapes
 * - Canvas 2D uses pixel-level color replacement (ImageData API)
 * - Colored shapes are cached to avoid recomputing pixel data every frame
 * - Cache key: "shapeName_R_G_B" (e.g., "circle_255_100_50")
 */

import type {
  BodyPart,
  RenderBodyPartType,
  RenderShapeType,
} from '../../../boids/vocabulary/schemas/visual.ts'
import type { AtlasesResult } from '../atlases.ts'
import {
  transformBodyPartCanvas2D,
  type BodyPartType,
} from '@/lib/coordinates.ts'
import type { BodyPartsAtlasResult } from '@/resources/browser/webgl/atlases/bodyPartsAtlas.ts'
import type { ShapeAtlasResult } from '@/resources/browser/webgl/atlases/shapeAtlas.ts'
import { toRgb, darken } from '@/lib/colors.ts' // Session 101 Phase 2: Perceptual colors

export type ShapeRenderer = (
  _ctx: CanvasRenderingContext2D,
  _size: number
) => void

const coloredShapeCache = new Map<string, HTMLCanvasElement>()

/**
 * Generic atlas-based shape renderer with pixel-level color replacement
 *
 *
 * Session 99B: Pixel-level color replacement for proper tinting (OPTIMIZED with caching)
 *
 * Session 101 Phase 2: BLUE shadow support for depth and visual polish
 *
 *
 * @param ctx - Canvas rendering context
 * @param size - Size of the shape
 * @param shapeName - Name of the shape in atlas
 * @param atlas - Shape atlas (from resource)
 * @param colors - Optional color overrides for multi-color rendering
 */
function renderAtlasShape(
  ctx: CanvasRenderingContext2D,
  size: number,
  shapeName: string,
  atlas: ShapeAtlasResult | null,
  colors?: {
    primary?: string
    border?: string
    shadow?: string
  }
): void {
  if (!atlas) {
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    return
  }

  const shapeUV = atlas.uvMap.get(shapeName)
  if (!shapeUV) {
    console.warn(`Shape "${shapeName}" not found in atlas`)
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    return
  }

  const atlasSize = atlas.canvas.width
  const cellPixelSize = atlasSize / atlas.gridSize
  const srcX = shapeUV.u * atlasSize
  const srcY = shapeUV.v * atlasSize
  const srcWidth = cellPixelSize
  const srcHeight = cellPixelSize

  const destSize = size * 2.0

  const primaryColor = colors?.primary || (ctx.fillStyle as string)
  const [primaryR, primaryG, primaryB] = toRgb(primaryColor)

  const [borderR, borderG, borderB] = colors?.border
    ? toRgb(colors.border)
    : [
        Math.floor(primaryR * 0.5),
        Math.floor(primaryG * 0.5),
        Math.floor(primaryB * 0.5),
      ]

  const shadowHex = colors?.shadow ? colors.shadow : darken(primaryColor, 2.5)
  const [shadowR, shadowG, shadowB] = toRgb(shadowHex)

  const cacheKey = `${shapeName}_${primaryR}_${primaryG}_${primaryB}_${borderR}_${borderG}_${borderB}_${shadowR}_${shadowG}_${shadowB}`

  let coloredCanvas = coloredShapeCache.get(cacheKey)

  if (!coloredCanvas) {
    coloredCanvas = document.createElement('canvas')
    coloredCanvas.width = cellPixelSize
    coloredCanvas.height = cellPixelSize
    const offCtx = coloredCanvas.getContext('2d')!

    offCtx.drawImage(
      atlas.canvas,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
      0,
      0,
      cellPixelSize,
      cellPixelSize
    )

    const imageData = offCtx.getImageData(0, 0, cellPixelSize, cellPixelSize)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]

      if (a === 0) continue // Skip transparent pixels

      const rDominant = r > g * 2 && r > b * 2
      const gDominant = g > r * 2 && g > b * 2
      const bDominant = b > r * 2 && b > g * 2

      if (rDominant && r > 128) {
        data[i] = primaryR
        data[i + 1] = primaryG
        data[i + 2] = primaryB
      } else if (gDominant && g > 128) {
        data[i] = borderR
        data[i + 1] = borderG
        data[i + 2] = borderB
      } else if (bDominant && b > 128) {
        data[i] = shadowR
        data[i + 1] = shadowG
        data[i + 2] = shadowB
      } else {
        data[i] = Math.floor((r / 255) * primaryR)
        data[i + 1] = Math.floor((g / 255) * primaryG)
        data[i + 2] = Math.floor((b / 255) * primaryB)
      }
    }

    offCtx.putImageData(imageData, 0, 0)

    coloredShapeCache.set(cacheKey, coloredCanvas)
  }

  ctx.drawImage(coloredCanvas, -destSize / 2, -destSize / 2, destSize, destSize)
}

/**
 * Get shape renderer for a given shape type
 *
 *
 * @param shape - Shape type to render
 * @param atlases - Pre-generated atlases from resource
 * @returns Shape renderer function
 */
export const getShapeRenderer = (
  shape: RenderShapeType,
  atlases: AtlasesResult
): ShapeRenderer => {
  const shapeAtlas = atlases.shapes

  return (ctx: CanvasRenderingContext2D, size: number) => {
    renderAtlasShape(ctx, size, shape, shapeAtlas)
  }
}

/**
 * Body Parts System - Composable visual elements
 * These are rendered AFTER the main body shape to add character
 *
 * ATLAS-BASED RENDERING:
 * Body parts are now rendered from texture atlases for visual parity with WebGL.
 * Uses unified coordinate transformations and samples from the same atlas canvas.
 */

export type BodyPartRenderer = (context: BodyPartRendererContext) => void

type BodyPartRendererContext = {
  ctx: CanvasRenderingContext2D
  atlas: BodyPartsAtlasResult | null
  boidSize: number
  color: string
  bodyParts: BodyPart[] // Array of body parts of this type from genome
}

type AtlasRenderingContext = {
  ctx: CanvasRenderingContext2D
  boidSize: number
  color: string
  bodyParts: BodyPart[]
  partTypeName: string
  atlas: BodyPartsAtlasResult | null
  useMultiColor: boolean
}

/**
 * Generic atlas-based body part renderer
 *
 * Renders a body part by sampling from the atlas texture.
 * Applies position, rotation, and scale transformations using unified coordinate system.
 *
 *
 *
 * @param ctx - Canvas rendering context
 * @param boidSize - Size of the boid (for scaling)
 * @param color - Color to tint the part (hex string)
 * @param bodyParts - Array of body parts from genome
 * @param partTypeName - Name of the part type (for UV lookup)
 * @param atlas - Body parts atlas (from resource)
 * @param useMultiColor - Whether to use multi-color marker detection (for eyes)
 */
function renderAtlasPart({
  ctx,
  boidSize,
  color,
  bodyParts,
  partTypeName,
  atlas,
  useMultiColor,
}: AtlasRenderingContext): void {
  if (!atlas) {
    return
  }

  const partUV = atlas.uvMap.get(partTypeName)
  if (!partUV) {
    console.warn(`Part type "${partTypeName}" not found in atlas`)
    return
  }

  const atlasSize = atlas.canvas.width
  const cellPixelSize = atlasSize / atlas.gridSize
  const srcX = partUV.u * atlasSize
  const srcY = partUV.v * atlasSize
  const srcWidth = cellPixelSize
  const srcHeight = cellPixelSize

  for (const part of bodyParts) {
    const partSize = part.size || 1.0
    const partPosX = part.position?.x || 0
    const partPosY = part.position?.y || 0
    const partRotation = part.rotation || 0

    const { offset, rotation } = transformBodyPartCanvas2D(
      { x: partPosX, y: partPosY },
      partRotation,
      partTypeName as BodyPartType,
      boidSize
    )

    const destSize = boidSize * 2.0 * partSize

    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.rotate(rotation)

    if (useMultiColor) {
      const [primaryR, primaryG, primaryB] = toRgb(color)

      let scleraR, scleraG, scleraB
      let irisR, irisG, irisB
      let pupilR, pupilG, pupilB

      if (partTypeName === 'eye') {
        scleraR = 255
        scleraG = 255
        scleraB = 255 // White
        irisR = primaryR
        irisG = primaryG
        irisB = primaryB // Boid color
        pupilR = 0
        pupilG = 0
        pupilB = 0 // Black
      } else if (partTypeName === 'shell') {
        const borderColor = darken(color, 2.5) // Very dark for border
        const cellColor = color // Primary boid color for fills
        const lineColor = darken(color, 1.5) // Dark but contrasts with border

        ;[scleraR, scleraG, scleraB] = toRgb(borderColor) // RED → Border
        ;[irisR, irisG, irisB] = toRgb(cellColor) // GREEN → Cells
        ;[pupilR, pupilG, pupilB] = toRgb(lineColor) // BLUE → Lines
      } else {
        scleraR = primaryR
        scleraG = primaryG
        scleraB = primaryB
        irisR = primaryR
        irisG = primaryG
        irisB = primaryB
        pupilR = primaryR
        pupilG = primaryG
        pupilB = primaryB
      }

      const cacheKey = `${partTypeName}_mc_${primaryR}_${primaryG}_${primaryB}`

      let coloredCanvas = coloredShapeCache.get(cacheKey)

      if (!coloredCanvas) {
        coloredCanvas = document.createElement('canvas')
        coloredCanvas.width = cellPixelSize
        coloredCanvas.height = cellPixelSize
        const offCtx = coloredCanvas.getContext('2d')!

        offCtx.drawImage(
          atlas.canvas,
          srcX,
          srcY,
          srcWidth,
          srcHeight,
          0,
          0,
          cellPixelSize,
          cellPixelSize
        )

        const imageData = offCtx.getImageData(
          0,
          0,
          cellPixelSize,
          cellPixelSize
        )
        const data = imageData.data

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]

          if (a === 0) continue // Skip transparent pixels

          const rDominant = r > g * 2 && r > b * 2
          const gDominant = g > r * 2 && g > b * 2
          const bDominant = b > r * 2 && b > g * 2

          if (rDominant && r > 128) {
            data[i] = scleraR
            data[i + 1] = scleraG
            data[i + 2] = scleraB
          } else if (gDominant && g > 128) {
            data[i] = irisR
            data[i + 1] = irisG
            data[i + 2] = irisB
          } else if (bDominant && b > 128) {
            data[i] = pupilR
            data[i + 1] = pupilG
            data[i + 2] = pupilB
          } else {
          }
        }

        offCtx.putImageData(imageData, 0, 0)

        coloredShapeCache.set(cacheKey, coloredCanvas)
      }

      ctx.drawImage(
        coloredCanvas,
        -destSize / 2,
        -destSize / 2,
        destSize,
        destSize
      )
    } else {
      ctx.drawImage(
        atlas.canvas,
        srcX,
        srcY,
        srcWidth,
        srcHeight, // Source rect in atlas
        -destSize / 2,
        -destSize / 2,
        destSize,
        destSize // Dest rect (centered)
      )
    }

    ctx.restore()
  }
}

/**
 * Get body part renderer for a given part type
 *
 *
 * @param part - Body part type to render
 * @param atlases - Pre-generated atlases from resource
 * @returns Body part renderer function, or undefined if not found
 */
/**
 * Body part renderer factory functions
 *
 * Each function is a standalone renderer that can be easily extracted or tested
 */
const bodyPartRendererFactories = {
  eye: (context: BodyPartRendererContext) =>
    renderAtlasPart({
      ctx: context.ctx,
      boidSize: context.boidSize,
      color: context.color,
      bodyParts: context.bodyParts,
      partTypeName: 'eye',
      atlas: context.atlas,
      useMultiColor: true,
    }),
  fin: (context: BodyPartRendererContext) =>
    renderAtlasPart({
      ctx: context.ctx,
      boidSize: context.boidSize,
      color: context.color,
      bodyParts: context.bodyParts,
      partTypeName: 'fin',
      atlas: context.atlas,
      useMultiColor: false,
    }),
  spike: (context: BodyPartRendererContext) =>
    renderAtlasPart({
      ctx: context.ctx,
      boidSize: context.boidSize,
      color: context.color,
      bodyParts: context.bodyParts,
      partTypeName: 'spike',
      atlas: context.atlas,
      useMultiColor: false,
    }),
  tail: (context: BodyPartRendererContext) =>
    renderAtlasPart({
      ctx: context.ctx,
      boidSize: context.boidSize,
      color: context.color,
      bodyParts: context.bodyParts,
      partTypeName: 'tail',
      atlas: context.atlas,
      useMultiColor: false,
    }),
  antenna: (context: BodyPartRendererContext) =>
    renderAtlasPart({
      ctx: context.ctx,
      boidSize: context.boidSize,
      color: context.color,
      bodyParts: context.bodyParts,
      partTypeName: 'antenna',
      atlas: context.atlas,
      useMultiColor: false,
    }),
  shell: (context: BodyPartRendererContext) =>
    renderAtlasPart({
      ctx: context.ctx,
      boidSize: context.boidSize,
      color: context.color,
      bodyParts: context.bodyParts,
      partTypeName: 'shell',
      atlas: context.atlas,
      useMultiColor: true,
    }),
  glow: (context: BodyPartRendererContext) => {
    const glowPart = context.bodyParts[0]
    const glowSize = glowPart?.size || 1.0
    context.ctx.shadowBlur = context.boidSize * 0.8 * glowSize
    context.ctx.shadowColor = context.color
  },
} as const satisfies Record<RenderBodyPartType, BodyPartRenderer>

/**
 * Get body part renderer for a given part type
 *
 *
 * @param part - Body part type to render
 * @param atlases - Pre-generated atlases from resource
 * @returns Body part renderer function, or undefined if not found
 */
export const getBodyPartRenderer = (
  part: RenderBodyPartType
): BodyPartRenderer | undefined => {
  return bodyPartRendererFactories[part] || undefined
}
