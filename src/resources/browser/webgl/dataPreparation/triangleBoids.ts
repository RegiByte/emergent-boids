/**
 * WebGL Data Preparation - Triangle Boids (Fallback)
 *
 * Prepares instance data for triangle-based boid rendering.
 * This is a fallback when shape-based rendering is not available.
 */

import type { Boid } from '../../../../boids/vocabulary/schemas/entities.ts'
import { toRgb } from '../../../../lib/colors.ts'

/**
 * Instance data for triangle-based boid rendering
 */
export type TriangleBoidInstanceData = {
  positions: Float32Array
  rotations: Float32Array
  colors: Float32Array
  scales: Float32Array
  count: number
}

/**
 * Prepares triangle boid instance data for GPU rendering
 *
 * @param boids - Array of boids to render
 * @returns Instance data ready for GPU upload
 */
export const prepareTriangleBoidData = (
  boids: Boid[]
): TriangleBoidInstanceData => {
  const count = boids.length
  const positions = new Float32Array(count * 2)
  const rotations = new Float32Array(count)
  const colors = new Float32Array(count * 3)
  const scales = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const boid = boids[i]

    positions[i * 2] = boid.position.x
    positions[i * 2 + 1] = boid.position.y

    rotations[i] = Math.atan2(-boid.velocity.y, boid.velocity.x)

    const [r, g, b] = toRgb(boid.phenotype.color)
    colors[i * 3] = r / 255
    colors[i * 3 + 1] = g / 255
    colors[i * 3 + 2] = b / 255

    scales[i] = boid.phenotype.collisionRadius
  }

  return { positions, rotations, colors, scales, count }
}
