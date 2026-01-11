import type { RenderShapeType } from '@/boids/vocabulary/schemas/visual'

/**
 * Shape sizing helpers
 *
 * The shape drawing code (Canvas 2D + WebGL atlas generation) uses a "size parameter"
 * which is then multiplied by various coefficients inside each shape.
 *
 * To make a *single* source of truth for sizing, we treat:
 * - `phenotype.baseSize` as the intended collision radius (world units / pixels)
 * - `shapeSizeParam` as the value passed into shape renderers / shape atlas quads
 *
 * `shapeMaxExtentFactor(shape)` returns the max extent of that shape relative to its
 * input `size` parameter (so we can invert it).
 */

export function shapeMaxExtentFactor(shape: RenderShapeType): number {
  switch (shape) {
    case 'diamond':
      return 0.9
    case 'circle':
      return 0.7
    case 'hexagon':
      return 0.7
    case 'square':
      return 0.6
    case 'triangle':
      return 0.8
    default:
      return 0.7
  }
}

/**
 * Convert collision radius (`baseSize`) into the parameter expected by shape renderers.
 *
 * Guarantees: `shapeSizeParam * shapeMaxExtentFactor(shape) ≈ baseSize`
 */
export function shapeSizeParamFromBaseSize(
  shape: RenderShapeType,
  baseSize: number
): number {
  return baseSize / shapeMaxExtentFactor(shape)
}
