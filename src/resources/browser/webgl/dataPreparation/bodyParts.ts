/**
 * Body Parts Data Preparation
 *
 * Prepares per-instance data for body parts rendering
 * Each body part becomes a separate instance with its own position/rotation/scale
 */

import type { Boid } from '@/boids/vocabulary/schemas/entities.ts'
import type { RenderBodyPartType } from '@/boids/vocabulary/schemas/visual.ts'
import type { SpeciesConfig } from '@/boids/vocabulary/schemas/species.ts'
import { darken, toRgb } from '@/lib/colors.ts'
import { transformBodyPartWebGL } from '@/lib/coordinates.ts'
import type { BodyPartsAtlasResult } from '../atlases/bodyPartsAtlas.ts'
import { calculateBoidRotation, colorToRgb } from './utils.ts'

export type BodyPartsInstanceData = {
  boidPositions: Float32Array
  boidRotations: Float32Array
  boidColors: Float32Array
  boidScales: Float32Array
  partUVs: Float32Array
  partOffsets: Float32Array
  partRotations: Float32Array
  partScales: Float32Array

  primaryColors: Float32Array
  secondaryColors: Float32Array
  tertiaryColors: Float32Array
  count: number
}

type BodyPartData = {
  boidPos: [number, number]
  boidRotation: number
  boidColor: [number, number, number]
  boidScale: number
  partUV: [number, number]
  partOffset: [number, number]
  partRotation: number
  partScale: number
  partType: RenderBodyPartType
}

/**
 * Prepare body parts data for GPU
 * Collects all body parts from all boids and creates per-instance data
 */
export const prepareBodyPartsData = (
  boids: Boid[],
  speciesConfigs: Record<string, SpeciesConfig>,
  bodyPartsAtlas: BodyPartsAtlasResult | null
): BodyPartsInstanceData | null => {
  if (!bodyPartsAtlas) return null

  const parts: BodyPartData[] = []

  for (const boid of boids) {
    const speciesConfig = speciesConfigs[boid.typeId]
    const bodyParts = speciesConfig?.baseGenome?.visual?.bodyParts || []

    if (bodyParts.length === 0) continue

    const boidRotation = calculateBoidRotation(boid.velocity.x, boid.velocity.y)
    const boidColor = colorToRgb(boid.phenotype.color)

    const boidScale = boid.phenotype.baseSize

    for (const part of bodyParts) {
      const partType = part.type

      if (partType === 'glow') continue

      const partUV = bodyPartsAtlas.uvMap.get(partType)
      if (!partUV) continue

      const partData = typeof part === 'object' ? part : null
      const partSize = partData?.size || 1.0
      const partPosX = partData?.position?.x || 0
      const partPosY = partData?.position?.y || 0
      const partRotation = partData?.rotation || 0 // Degrees

      const { offset, rotation } = transformBodyPartWebGL(
        { x: partPosX, y: partPosY },
        partRotation,
        partType,
        boidScale
      )

      parts.push({
        boidPos: [boid.position.x, boid.position.y],
        boidRotation,
        boidColor,
        boidScale,
        partUV: [partUV.u, partUV.v],
        partOffset: [offset.x, offset.y],
        partRotation: rotation,

        partScale: partSize * boidScale,
        partType,
      })
    }
  }

  if (parts.length === 0) return null

  const count = parts.length
  const boidPositions = new Float32Array(count * 2)
  const boidRotations = new Float32Array(count)
  const boidColors = new Float32Array(count * 3)
  const boidScales = new Float32Array(count)
  const partUVs = new Float32Array(count * 2)
  const partOffsets = new Float32Array(count * 2)
  const partRotations = new Float32Array(count)
  const partScales = new Float32Array(count)

  const primaryColors = new Float32Array(count * 3)
  const secondaryColors = new Float32Array(count * 3)
  const tertiaryColors = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const part = parts[i]

    boidPositions[i * 2] = part.boidPos[0]
    boidPositions[i * 2 + 1] = part.boidPos[1]
    boidRotations[i] = part.boidRotation
    boidColors[i * 3] = part.boidColor[0]
    boidColors[i * 3 + 1] = part.boidColor[1]
    boidColors[i * 3 + 2] = part.boidColor[2]
    boidScales[i] = part.boidScale
    partUVs[i * 2] = part.partUV[0]
    partUVs[i * 2 + 1] = part.partUV[1]
    partOffsets[i * 2] = part.partOffset[0]
    partOffsets[i * 2 + 1] = part.partOffset[1]
    partRotations[i] = part.partRotation
    partScales[i] = part.partScale

    const partType = part.partType

    const boidColorHex = `rgb(${Math.round(part.boidColor[0] * 255)}, ${Math.round(part.boidColor[1] * 255)}, ${Math.round(part.boidColor[2] * 255)})`

    let primary: [number, number, number]
    let secondary: [number, number, number]
    let tertiary: [number, number, number]

    if (partType === 'eye') {
      primary = [1.0, 1.0, 1.0] // White
      secondary = part.boidColor // Boid color
      tertiary = [0.0, 0.0, 0.0] // Black
    } else if (partType === 'shell') {
      const borderColor = darken(boidColorHex, 2.5) // Very dark for border
      const cellColor = boidColorHex // Primary boid color for fills
      const lineColor = darken(boidColorHex, 1.5) // Dark but contrasts with border

      const borderRgb = toRgb(borderColor)
      const cellRgb = toRgb(cellColor)
      const lineRgb = toRgb(lineColor)

      primary = [borderRgb[0] / 255, borderRgb[1] / 255, borderRgb[2] / 255] // Border
      secondary = [cellRgb[0] / 255, cellRgb[1] / 255, cellRgb[2] / 255] // Cells
      tertiary = [lineRgb[0] / 255, lineRgb[1] / 255, lineRgb[2] / 255] // Lines
    } else {
      primary = part.boidColor
      secondary = part.boidColor
      tertiary = part.boidColor
    }

    primaryColors[i * 3] = primary[0]
    primaryColors[i * 3 + 1] = primary[1]
    primaryColors[i * 3 + 2] = primary[2]

    secondaryColors[i * 3] = secondary[0]
    secondaryColors[i * 3 + 1] = secondary[1]
    secondaryColors[i * 3 + 2] = secondary[2]

    tertiaryColors[i * 3] = tertiary[0]
    tertiaryColors[i * 3 + 1] = tertiary[1]
    tertiaryColors[i * 3 + 2] = tertiary[2]
  }

  return {
    boidPositions,
    boidRotations,
    boidColors,
    boidScales,
    partUVs,
    partOffsets,
    partRotations,
    partScales,
    primaryColors,
    secondaryColors,
    tertiaryColors,
    count,
  }
}
