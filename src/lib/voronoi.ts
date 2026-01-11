/**
 * Voronoi Tessellation Library
 *
 * Pure functional Voronoi diagram generation for procedural textures.
 * Uses distance-field approach - perfect for canvas and WebGL shaders.
 *
 * Philosophy: "Everything is information processing"
 * - Seeds → Distance fields → Cell boundaries
 * - Lloyd relaxation → Organic emergence
 * - No geometry, just pure math
 *
 * Use cases:
 * - Turtle shells (scutes)
 * - Organic patterns (giraffe spots, cracked earth)
 * - Cellular structures
 * - Procedural textures
 *
 *
 */

import { Vector2 } from '@/boids/vocabulary/schemas/primitives'
import { toRgb } from './colors'

export type Point2D = Vector2

/**
 * Squared Euclidean distance (faster - no sqrt needed for comparisons)
 */
export const dist2 = (x1: number, y1: number, x2: number, y2: number): number =>
  (x1 - x2) ** 2 + (y1 - y2) ** 2

/**
 * Euclidean distance
 */
export const dist = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.sqrt(dist2(x1, y1, x2, y2))

/**
 * Generate seeds in concentric rings (turtle shell pattern)
 *
 * @param radius - Maximum radius for seed distribution
 * @param rings - Array of seed counts per ring (e.g., [5, 9] = 5 inner, 9 outer)
 * @param centerSeed - Whether to include a center seed
 * @returns Array of seed points
 *
 * @example
 * // Classic turtle shell: center + 2 rings
 * const seeds = generateRingSeeds(50, [5, 9], true);
 */
export function generateRingSeeds(
  radius: number,
  rings: number[],
  centerSeed: boolean = true
): Point2D[] {
  const seeds: Point2D[] = []

  if (centerSeed) {
    seeds.push({ x: 0, y: 0 })
  }

  rings.forEach((count, ringIndex) => {
    const r = ((ringIndex + 1) / (rings.length + 1)) * radius
    const angleOffset = Math.PI / count // Offset alternate rings for better packing

    for (let i = 0; i < count; i++) {
      const angle =
        (i / count) * Math.PI * 2 + (ringIndex % 2 ? angleOffset : 0)
      seeds.push({
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
      })
    }
  })

  return seeds
}

/**
 * Generate uniformly distributed random seeds
 *
 * @param count - Number of seeds
 * @param radius - Maximum radius (circular constraint)
 * @param rng - Random number generator (0-1)
 * @returns Array of seed points
 */
export function generateRandomSeeds(
  count: number,
  radius: number,
  rng: () => number = Math.random
): Point2D[] {
  const seeds: Point2D[] = []

  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rng()) * radius
    const angle = rng() * Math.PI * 2
    seeds.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    })
  }

  return seeds
}

/**
 * Find the closest seed to a point
 *
 * @returns [seedIndex, distanceSquared]
 */
export function closestSeed(
  x: number,
  y: number,
  seeds: Point2D[]
): [number, number] {
  let minDist = Infinity
  let minIndex = 0

  for (let i = 0; i < seeds.length; i++) {
    const d = dist2(x, y, seeds[i].x, seeds[i].y)
    if (d < minDist) {
      minDist = d
      minIndex = i
    }
  }

  return [minIndex, minDist]
}

/**
 * Find the two closest seeds (for edge detection)
 *
 * @returns [closestIndex, closestDist, secondClosestDist]
 */
export function closestTwoSeeds(
  x: number,
  y: number,
  seeds: Point2D[]
): [number, number, number] {
  let min1 = Infinity
  let min2 = Infinity
  let minIndex = 0

  for (let i = 0; i < seeds.length; i++) {
    const d = dist2(x, y, seeds[i].x, seeds[i].y)
    if (d < min1) {
      min2 = min1
      min1 = d
      minIndex = i
    } else if (d < min2) {
      min2 = d
    }
  }

  return [minIndex, min1, min2]
}

/**
 * Lloyd's relaxation - moves seeds toward their cell centroids
 * Creates more uniform, organic-looking cells
 *
 * @param seeds - Current seed positions
 * @param radius - Constraint radius (circular boundary)
 * @param size - Sample grid size for centroid calculation
 * @returns New relaxed seed positions
 *
 * @example
 * let seeds = generateRandomSeeds(15, 50);
 * for (let i = 0; i < 5; i++) {
 *   seeds = lloydRelaxation(seeds, 50, 100);
 * }
 */
export function lloydRelaxation(
  seeds: Point2D[],
  radius: number,
  size: number = 100
): Point2D[] {
  const centroids: Point2D[] = seeds.map(() => ({ x: 0, y: 0 }))
  const counts = seeds.map(() => 0)

  const halfSize = size / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x - halfSize
      const py = y - halfSize

      if (px * px + py * py > radius * radius) continue

      const [cellIndex] = closestSeed(px, py, seeds)

      centroids[cellIndex].x += px
      centroids[cellIndex].y += py
      counts[cellIndex]++
    }
  }

  return centroids.map((centroid, i) => {
    if (counts[i] === 0) return seeds[i] // Keep original if no samples

    const cx = centroid.x / counts[i]
    const cy = centroid.y / counts[i]

    const d = Math.sqrt(cx * cx + cy * cy)
    if (d > radius * 0.9) {
      const scale = (radius * 0.9) / d
      return { x: cx * scale, y: cy * scale }
    }

    return { x: cx, y: cy }
  })
}

/**
 * Voronoi Options for rendering
 */
export type VoronoiRenderOptions = {
  seeds: Point2D[]
  radius: number
  edgeThickness?: number // Distance threshold for edge detection
  edgeColor?: string
  fillMode?: 'cells' | 'edges' | 'both'
  cellColorFn?: (cellIndex: number) => string // Custom cell coloring

  ellipseRatio?: number // Width/height ratio (1.0 = circle, >1 = wider, <1 = taller)

  borderColor?: string // Outer ring/boundary color (e.g., RED channel)
  cellFillColor?: string // Cell interior fill color (e.g., GREEN channel)
}

/**
 * Draw Voronoi diagram to canvas using distance field approach
 *
 * This is the core rendering function - 100% canvas-safe, pure pixel iteration
 *
 * @param ctx - Canvas context (assumes centered origin via translate)
 * @param size - Canvas size in pixels
 * @param options - Voronoi rendering options
 *
 * @example
 * ctx.save();
 * ctx.translate(size / 2, size / 2);
 * const seeds = generateRingSeeds(size * 0.4, [5, 9]);
 * drawVoronoi(ctx, size, {
 *   seeds,
 *   radius: size * 0.4,
 *   fillMode: "edges",
 *   edgeColor: "white",
 *   edgeThickness: 150,
 * });
 * ctx.restore();
 */
export function drawVoronoi(
  ctx: CanvasRenderingContext2D,
  size: number,
  options: VoronoiRenderOptions
): void {
  const {
    seeds,
    radius,
    edgeThickness = 100,
    edgeColor = 'white',
    fillMode = 'both',
    cellColorFn = (id) => {
      const shade = 180 + ((id * 13) % 60)
      return `rgb(${shade}, ${shade}, ${shade})`
    },
    ellipseRatio = 1.0, // Default to circular
    borderColor, // Optional outer ring color
    cellFillColor, // Optional cell fill color
  } = options

  const img = ctx.createImageData(size, size)
  const halfSize = size / 2

  const radiusX = radius * ellipseRatio
  const radiusY = radius

  const scaledSeeds = seeds.map((s) => ({
    x: s.x * ellipseRatio,
    y: s.y,
  }))

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x - halfSize
      const py = y - halfSize

      const normalizedDist =
        (px * px) / (radiusX * radiusX) + (py * py) / (radiusY * radiusY)
      if (normalizedDist > 1) continue

      const [cellId, d1, d2] = closestTwoSeeds(px, py, scaledSeeds)

      const idx = (y * size + x) * 4
      const isEdge =
        Math.abs(Math.sqrt(d2) - Math.sqrt(d1)) < edgeThickness / 100

      const distFromCenter = Math.sqrt(normalizedDist)
      const isBorder = distFromCenter > 0.9 // Outer 10% is border

      let color = 'transparent'

      if (isBorder && borderColor) {
        color = borderColor
      } else if (isEdge) {
        color = edgeColor
      } else if (cellFillColor) {
        color = cellFillColor
      } else if (fillMode === 'cells' || fillMode === 'both') {
        color = cellColorFn(cellId)
      }

      if (color !== 'transparent') {
        const rgb = toRgb(color)
        img.data[idx] = rgb[0]
        img.data[idx + 1] = rgb[1]
        img.data[idx + 2] = rgb[2]
        img.data[idx + 3] = 255
      }
    }
  }

  const transform = ctx.getTransform()
  const offsetX = transform.e - halfSize // e is translateX in transform matrix
  const offsetY = transform.f - halfSize // f is translateY in transform matrix

  ctx.putImageData(img, offsetX, offsetY)
}
