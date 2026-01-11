/**
 * Body Parts Atlas Generation
 *
 * Creates a texture atlas for all boid body parts.
 * Body parts are composable visual elements that layer on top of the base shape.
 * They provide visual variety and can convey mechanical bonuses (eyes = vision, fins = turn rate, etc.)
 *
 * Parts are rendered in white and colorized in the shader to match the boid's color.
 * This allows dynamic coloring without needing separate textures per color.
 *
 * CRITICAL DESIGN CONVENTIONS:
 * 1. Each part is CENTERED in its atlas cell as a standalone graphic
 * 2. ALL directional parts point RIGHT (0°, along +X axis) in base state
 * 3. Positioning/rotation happens during rendering via genome values
 * 4. No hardcoded rotation offsets needed - genome rotation is applied directly
 *
 * UNIFIED ORIENTATION STANDARD:
 * - Fin: Points RIGHT (base at left, tip extends right)
 * - Spike: Points RIGHT (base at origin, tip extends right)
 * - Tail: Points RIGHT (base at left, tips extend right in V-shape)
 * - Eye/Glow/Shell: Circular (no orientation)
 * - Antenna: Vertical (no directional preference)
 *
 * NORMALIZED ATLAS SIZING:
 * - ALL parts drawn at the SAME normalized size (80% of cell)
 * - This ensures genome size parameter directly controls visual appearance
 * - size: 1.0 means "100% of body radius" regardless of part type
 * - Allows maximum texture detail (every part uses full cell space)
 * - Future-proof for detailed textures with borders, gradients, multiple layers
 *
 * The genome specifies multiple instances if needed (e.g., [eye, eye] = two eyes)
 */

import type REGL from 'regl'
import type { AtlasResult } from './types.ts'
import { bodyPartKeywords } from '@/boids/vocabulary/keywords.ts'
import { BodyPartType } from '@/lib/coordinates.ts'
import {
  generateRingSeeds,
  lloydRelaxation,
  drawVoronoi,
} from '@/lib/voronoi.ts'

export type BodyPartsAtlasResult = AtlasResult

type PartRenderer = (
  ctx: CanvasRenderingContext2D,
  normalizedSize: number
) => void
type PartRendererMap = Record<BodyPartType, PartRenderer>

const partRenderers = {
  [bodyPartKeywords.eye]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number
  ) => {
    const eyeRadius = normalizedSize * 0.35 // Full eye size
    const irisRadius = eyeRadius * 0.65 // Iris size (smaller than full eye)
    const pupilRadius = eyeRadius * 0.4 // Pupil size (smallest)

    ctx.fillStyle = 'rgb(255, 0, 0)' // RED marker
    ctx.beginPath()
    ctx.arc(0, 0, eyeRadius, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgb(0, 255, 0)' // GREEN marker
    ctx.lineWidth = 4 // Visible iris ring
    ctx.beginPath()
    ctx.arc(0, 0, irisRadius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = 'rgb(0, 0, 255)' // BLUE marker
    ctx.beginPath()
    ctx.arc(0, 0, pupilRadius, 0, Math.PI * 2)
    ctx.fill()
  },
  [bodyPartKeywords.fin]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number
  ) => {
    ctx.fillStyle = 'white' // Solid white

    const finLength = normalizedSize * 0.45 // Fin length
    const finWidth = normalizedSize * 0.25 // Fin width

    ctx.beginPath()
    ctx.moveTo(-finLength * 0.3, -finWidth) // Top base (at body)
    ctx.lineTo(finLength, 0) // Pointy tip (pointing right)
    ctx.lineTo(-finLength * 0.3, finWidth) // Bottom base (at body)
    ctx.lineTo(-finLength * 0.15, 0) // Inner point (creates angular shape)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  },
  [bodyPartKeywords.spike]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number
  ) => {
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'

    const spikeLength = normalizedSize * 0.45
    ctx.beginPath()
    ctx.moveTo(-spikeLength * 0.1, 0) // Base (at boid body)
    ctx.lineTo(spikeLength, 0) // Tip (pointing right)
    ctx.stroke()

    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(-spikeLength * 0.1, 0)
    ctx.lineTo(spikeLength * 0.2, 0)
    ctx.stroke()
  },
  [bodyPartKeywords.tail]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number
  ) => {
    ctx.fillStyle = 'white' // Solid white

    const tailLength = normalizedSize * 0.45
    const tailHeight = normalizedSize * 0.3

    ctx.beginPath()
    ctx.moveTo(-tailLength * 0.3, 0) // Base (at boid body)
    ctx.lineTo(tailLength, -tailHeight) // Top tip (pointing right)
    ctx.lineTo(tailLength * 0.8, 0) // Middle point (creates angular V)
    ctx.lineTo(tailLength, tailHeight) // Bottom tip (pointing right)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  },
  [bodyPartKeywords.antenna]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number
  ) => {
    const antennaLength = normalizedSize * 0.45

    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, -antennaLength)
    ctx.lineTo(0, antennaLength)
    ctx.stroke()

    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(0, -antennaLength, normalizedSize * 0.1, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.arc(0, antennaLength, normalizedSize * 0.04, 0, Math.PI * 2)
    ctx.fill()
  },
  [bodyPartKeywords.glow]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number
  ) => {
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 2

    const glowRadius = normalizedSize * 0.15
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath()
      ctx.arc(0, 0, glowRadius * i, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(0, 0, glowRadius * 0.6, 0, Math.PI * 2)
    ctx.fill()
  },
  [bodyPartKeywords.shell]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number
  ) => {
    const shellStartTime = performance.now()
    const radius = normalizedSize * 0.4

    const ellipseRatio = 1.15

    const seedStartTime = performance.now()
    let seeds = generateRingSeeds(radius, [5, 9], true)
    console.log(
      `  ⏱️ Shell: generateRingSeeds took ${(performance.now() - seedStartTime).toFixed(2)}ms`
    )

    const relaxationSampleSize = Math.floor(radius * 2)
    const relaxationStartTime = performance.now()
    for (let i = 0; i < 3; i++) {
      const iterStart = performance.now()
      seeds = lloydRelaxation(seeds, radius, relaxationSampleSize)
      console.log(
        `  ⏱️ Shell: Lloyd relaxation iteration ${i + 1} took ${(performance.now() - iterStart).toFixed(2)}ms`
      )
    }
    console.log(
      `  ⏱️ Shell: Total Lloyd relaxation took ${(performance.now() - relaxationStartTime).toFixed(2)}ms`
    )

    const drawStartTime = performance.now()
    const voronoiSize = Math.floor(normalizedSize * 2) // Fixed resolution for atlas (good quality, much faster)
    drawVoronoi(ctx, voronoiSize, {
      seeds,
      radius: radius, // Scale radius to match new size
      ellipseRatio, // Oval shell shape
      edgeThickness: normalizedSize * 3 * (voronoiSize / (normalizedSize * 2)), // Scale edge thickness

      borderColor: 'rgb(255, 0, 0)', // RED = Outer ring/border
      cellFillColor: 'rgb(0, 255, 0)', // GREEN = Cell interiors
      edgeColor: 'rgb(0, 0, 255)', // BLUE = Scute lines/edges
    })
    console.log(
      `  ⏱️ Shell: drawVoronoi took ${(performance.now() - drawStartTime).toFixed(2)}ms`
    )
    console.log(
      `  ⏱️ Shell: Total shell render took ${(performance.now() - shellStartTime).toFixed(2)}ms`
    )
  },
} as const satisfies PartRendererMap

const fallbackRenderer = (
  ctx: CanvasRenderingContext2D,
  normalizedSize: number
) => {
  ctx.beginPath()
  ctx.arc(0, 0, normalizedSize * 0.3, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Create texture atlas for all boid body parts
 */
export const createBodyPartsAtlas = (): AtlasResult | null => {
  const atlasStartTime = performance.now()
  console.log('⏳ [BodyPartsAtlas] Starting atlas generation...')

  const parts = [
    bodyPartKeywords.eye, // Single eye (rendered multiple times at different positions)
    bodyPartKeywords.fin, // Side fin for aquatic look
    bodyPartKeywords.spike, // Defensive spike for predators
    bodyPartKeywords.tail, // Prominent tail fin
    bodyPartKeywords.antenna, // Sensory appendage
    bodyPartKeywords.glow, // Glow effect (marker only, handled in shader)
    bodyPartKeywords.shell, // Protective shell
  ]

  const cellSize = 256 // Pixels per part (same as shapes)
  const gridSize = Math.ceil(Math.sqrt(parts.length))
  const atlasSize = gridSize * cellSize

  const canvasStartTime = performance.now()
  const atlasCanvas = document.createElement('canvas')
  atlasCanvas.width = atlasSize
  atlasCanvas.height = atlasSize
  const ctx = atlasCanvas.getContext('2d')
  console.log(
    `  ⏱️ [BodyPartsAtlas] Canvas creation took ${(performance.now() - canvasStartTime).toFixed(2)}ms`
  )

  if (!ctx) {
    console.error('Failed to create body parts atlas canvas context')
    return null
  }

  ctx.clearRect(0, 0, atlasSize, atlasSize)

  const partUVMap = new Map<string, { u: number; v: number }>()

  const renderStartTime = performance.now()
  parts.forEach((partName, index) => {
    const partStartTime = performance.now()
    const col = index % gridSize
    const row = Math.floor(index / gridSize)
    const cellX = col * cellSize
    const cellY = row * cellSize
    const centerX = cellX + cellSize / 2
    const centerY = cellY + cellSize / 2

    const normalizedSize = cellSize * 0.8 // All parts fill 80% of cell

    ctx.save()
    ctx.translate(centerX, centerY)

    ctx.fillStyle = 'white'
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'

    const renderer = partRenderers[partName] || fallbackRenderer
    renderer(ctx, normalizedSize)

    ctx.restore()

    partUVMap.set(partName, {
      u: col / gridSize,
      v: row / gridSize,
    })

    console.log(
      `  ⏱️ [BodyPartsAtlas] Rendered part "${partName}" in ${(performance.now() - partStartTime).toFixed(2)}ms`
    )
  })
  console.log(
    `  ⏱️ [BodyPartsAtlas] Total rendering loop took ${(performance.now() - renderStartTime).toFixed(2)}ms`
  )

  const totalTime = performance.now() - atlasStartTime
  console.log(
    `✅ [BodyPartsAtlas] Atlas generation complete in ${totalTime.toFixed(2)}ms`
  )

  return {
    canvas: atlasCanvas,
    uvMap: partUVMap,
    gridSize,
    cellSize: 1.0 / gridSize, // UV size of each cell
    previewURL: atlasCanvas.toDataURL('image/png'), // For debugging!
  }
}

/**
 * Create REGL texture from body parts atlas
 */
export const createBodyPartsTexture = (
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

/**
 * Log body parts atlas debug info to console
 */
export const logBodyPartsAtlasDebugInfo = (atlas: AtlasResult): void => {
  console.log('📊 Body Parts Atlas Info:', {
    parts: Array.from(atlas.uvMap.keys()),
    gridSize: atlas.gridSize,
    cellSize: atlas.cellSize,
    expectedCellSize: 1.0 / atlas.gridSize,
    firstPartUV: atlas.uvMap.get('eye'),
  })
  console.log('💡 To preview: window.open(bodyPartsAtlasPreviewURL)')
  ;(
    window as unknown as { bodyPartsAtlasPreviewURL: string }
  ).bodyPartsAtlasPreviewURL = atlas.previewURL
}
