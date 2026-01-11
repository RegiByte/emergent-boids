/**
 * Shape Boids Data Preparation
 *
 * Prepares per-instance data for shape-based boid rendering
 */

import type { Boid } from '@/boids/vocabulary/schemas/entities.ts'
import type { SpeciesConfig } from '@/boids/vocabulary/schemas/species.ts'
import type { ShapeAtlasResult } from '../atlases/shapeAtlas.ts'
import { colorToRgb, calculateBoidRotation } from './utils.ts'
import { shapeSizeParamFromBaseSize } from '@/lib/shapeSizing.ts'
import { darken } from '@/lib/colors.ts' // Session 101 Phase 2: Perceptual shadow colors

export type ShapeBoidInstanceData = {
  positions: Float32Array
  rotations: Float32Array
  colors: Float32Array
  borderColors: Float32Array
  shadowColors: Float32Array // Session 101 Phase 2: Shadow colors (perceptual)
  scales: Float32Array
  shapeUVs: Float32Array
  count: number
}

/**
 * Prepare shape-based boid data for GPU (with UV coordinates)
 */
export const prepareShapeBoidData = (
  boids: Boid[],
  speciesConfigs: Record<string, SpeciesConfig>,
  shapeAtlas: ShapeAtlasResult | null
): ShapeBoidInstanceData => {
  const count = boids.length
  const positions = new Float32Array(count * 2)
  const rotations = new Float32Array(count)
  const colors = new Float32Array(count * 3)
  const borderColors = new Float32Array(count * 3)
  const shadowColors = new Float32Array(count * 3) // Session 101 Phase 2: Shadow colors
  const scales = new Float32Array(count)
  const shapeUVs = new Float32Array(count * 2)

  for (let i = 0; i < count; i++) {
    const boid = boids[i]

    positions[i * 2] = boid.position.x
    positions[i * 2 + 1] = boid.position.y

    rotations[i] = calculateBoidRotation(boid.velocity.x, boid.velocity.y)

    const [r, g, b] = colorToRgb(boid.phenotype.color)
    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b

    borderColors[i * 3] = r * 0.5
    borderColors[i * 3 + 1] = g * 0.5
    borderColors[i * 3 + 2] = b * 0.5

    const shadowHex = darken(boid.phenotype.color, 2.5)
    const [shadowR, shadowG, shadowB] = colorToRgb(shadowHex)
    shadowColors[i * 3] = shadowR
    shadowColors[i * 3 + 1] = shadowG
    shadowColors[i * 3 + 2] = shadowB

    if (shapeAtlas) {
      const speciesConfig = speciesConfigs[boid.typeId]
      const shapeName = speciesConfig?.visualConfig?.shape || 'triangle'
      scales[i] = shapeSizeParamFromBaseSize(shapeName, boid.phenotype.baseSize)
      const shapeUV = shapeAtlas.uvMap.get(shapeName)

      if (shapeUV) {
        shapeUVs[i * 2] = shapeUV.u
        shapeUVs[i * 2 + 1] = shapeUV.v
      } else {
        const triangleUV = shapeAtlas.uvMap.get('triangle')
        shapeUVs[i * 2] = triangleUV?.u || 0
        shapeUVs[i * 2 + 1] = triangleUV?.v || 0
      }
    }
    if (!shapeAtlas) {
      scales[i] = shapeSizeParamFromBaseSize(
        'triangle',
        boid.phenotype.baseSize
      )
    }
  }

  return {
    positions,
    rotations,
    colors,
    borderColors,
    shadowColors,
    scales,
    shapeUVs,
    count,
  }
}
