/**
 * Unified Coordinate System Converters - Emergent Boids
 *
 * Pure functions for converting between coordinate systems.
 * No classes, no state, just transformations.
 *
 * Philosophy: "Everything is information processing. Simple rules compose."
 *
 * Coordinate Systems:
 * - Boid-Local: Genome space (-1 to 1, boid faces -Y)
 * - Boid-Relative: Pixel space, boid faces +X
 * - Canvas 2D: Y-down, rotation clockwise
 * - WebGL: Y-up, rotation counter-clockwise
 */

import type { RenderBodyPartType } from '@/boids/vocabulary/schemas/visual'
import type { Vector2 } from '@/boids/vocabulary/schemas/primitives'

export type BoidLocalPosition = Vector2 // Normalized (-1 to 1)
export type BoidRelativePosition = Vector2 // Pixels
export type Canvas2DPosition = Vector2 // Pixels, Y-down
export type WebGLPosition = Vector2 // Pixels, Y-up

export type BodyPartType = RenderBodyPartType

/**
 * Semantic scale factors for genome position mapping
 *
 * These control how genome positions (-1 to 1) map to pixel offsets.
 * - FULL: genome ±1.0 → ±boidSize pixels
 * - HALF: genome ±1.0 → ±(boidSize/2) pixels
 * - QUARTER: genome ±1.0 → ±(boidSize/4) pixels
 * - TIGHT: genome ±1.0 → ±(boidSize/10) pixels
 */
export const SCALE_FACTORS = {
  FULL: 1.0,
  HALF: 0.5,
  QUARTER: 0.25,
  TIGHT: 0.1,
} as const

/**
 * Get appropriate scale factor for a body part type
 *
 * This encodes our design decisions about how far from the body center
 * each part type can be positioned.
 */
export function getPartScaleFactor(partType: BodyPartType): number {
  switch (partType) {
    case 'eye':
    case 'antenna':
      return SCALE_FACTORS.FULL // Eyes/antennae can be far from center

    case 'fin':
    case 'spike':
    case 'shell':
      return SCALE_FACTORS.HALF // Structural parts closer to body

    case 'tail':
      return SCALE_FACTORS.QUARTER // Tail attaches close to body

    case 'glow':
      return SCALE_FACTORS.FULL // Glow can extend far

    default:
      return SCALE_FACTORS.HALF // Safe default
  }
}

/**
 * Convert genome position to boid-relative pixel coordinates
 *
 * This is the CORE transformation that all renderers use.
 *
 * Boid-Local Space:
 * - Normalized (-1 to 1)
 * - Boid faces forward along -Y axis
 * - X: left (negative) to right (positive)
 * - Y: front (negative) to back (positive)
 *
 * Boid-Relative Space:
 * - Pixels
 * - Boid faces right along +X axis
 * - X: left to right
 * - Y: perpendicular to boid (renderer-dependent sign)
 *
 * Transform: Rotate coordinate system 90° clockwise
 * - Boid-Local -Y (front) → Boid-Relative +X (right)
 * - Boid-Local +X (right) → Boid-Relative +Y
 *
 * @param localPos - Position in boid-local space (-1 to 1)
 * @param boidSize - Boid size in pixels
 * @returns Position in boid-relative space (pixels)
 */
export function boidLocalToBoidRelative(
  localPos: BoidLocalPosition,
  boidSize: number
): BoidRelativePosition {
  return {
    x: -localPos.y * boidSize, // Front/back → Right/left
    y: localPos.x * boidSize, // Left/right → Perpendicular
  }
}

/**
 * Convert genome position to Canvas 2D offset
 *
 * Canvas 2D Space:
 * - Y-down (positive Y is down)
 * - Rotation clockwise
 * - Boid faces right (+X) after ctx.rotate(heading)
 *
 * @param genomePos - Position in genome space (-1 to 1)
 * @param boidSize - Boid size in pixels
 * @returns Offset in Canvas 2D space (pixels, Y-down)
 */
export function genomeToCanvas2D(
  genomePos: BoidLocalPosition,
  boidSize: number
): Canvas2DPosition {
  return boidLocalToBoidRelative(genomePos, boidSize)
}

/**
 * Calculate boid heading from velocity for Canvas 2D
 *
 * @param velocity - Velocity vector in world space
 * @returns Heading angle in radians (clockwise from +X)
 */
export function getBoidHeadingCanvas2D(velocity: Vector2): number {
  return Math.atan2(velocity.y, velocity.x)
}

/**
 * Convert genome position to WebGL offset
 *
 * WebGL Space:
 * - Y-up (positive Y is up)
 * - Rotation counter-clockwise
 * - Boid faces right (+X) after rotation in shader
 *
 * @param genomePos - Position in genome space (-1 to 1)
 * @param boidSize - Boid size in pixels
 * @returns Offset in WebGL space (pixels, Y-up)
 */
export function genomeToWebGL(
  genomePos: BoidLocalPosition,
  boidSize: number
): WebGLPosition {
  const relative = boidLocalToBoidRelative(genomePos, boidSize)

  return {
    x: relative.x,
    y: -relative.y, // Flip Y for WebGL
  }
}

/**
 * Calculate boid heading from velocity for WebGL
 *
 * @param velocity - Velocity vector in world space
 * @returns Heading angle in radians (counter-clockwise from +X)
 */
export function getBoidHeadingWebGL(velocity: Vector2): number {
  return Math.atan2(-velocity.y, velocity.x)
}

/**
 * Convert genome rotation (degrees) to radians
 *
 * Genome rotation:
 * - 0° = Right (+X)
 * - 90° = Up (in boid-local space, which is -Y)
 * - 180° = Left (-X)
 * - 270° = Down (in boid-local space, which is +Y)
 *
 * @param degrees - Rotation in degrees (0-360)
 * @returns Rotation in radians
 */
export function genomeRotationToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Convert radians to degrees
 *
 * @param radians - Rotation in radians
 * @returns Rotation in degrees (0-360)
 */
export function radiansToGenomeRotation(radians: number): number {
  return (radians * 180) / Math.PI
}

/**
 * Transform genome body part to Canvas 2D rendering parameters
 *
 * This is a convenience function that combines position and rotation
 * conversions for a complete body part transformation.
 *
 * @param genomePos - Position in genome space (-1 to 1)
 * @param genomeRotation - Rotation in degrees
 * @param partType - Type of body part (for scale factor)
 * @param boidSize - Boid size in pixels
 * @returns Canvas 2D rendering parameters
 */
export function transformBodyPartCanvas2D(
  genomePos: BoidLocalPosition,
  genomeRotation: number,
  partType: BodyPartType,
  boidSize: number
): {
  offset: Canvas2DPosition
  rotation: number
  scaleFactor: number
} {
  const scaleFactor = getPartScaleFactor(partType)
  const offset = genomeToCanvas2D(genomePos, boidSize * scaleFactor)
  const rotation = genomeRotationToRadians(genomeRotation)

  return { offset, rotation, scaleFactor }
}

/**
 * Transform genome body part to WebGL rendering parameters
 *
 * @param genomePos - Position in genome space (-1 to 1)
 * @param genomeRotation - Rotation in degrees
 * @param partType - Type of body part (for scale factor)
 * @param boidSize - Boid size in pixels
 * @returns WebGL rendering parameters
 */
export function transformBodyPartWebGL(
  genomePos: BoidLocalPosition,
  genomeRotation: number,
  partType: BodyPartType,
  boidSize: number
): {
  offset: WebGLPosition
  rotation: number
  scaleFactor: number
} {
  const scaleFactor = getPartScaleFactor(partType)
  const offset = genomeToWebGL(genomePos, boidSize * scaleFactor)
  const rotation = genomeRotationToRadians(genomeRotation)

  return { offset, rotation, scaleFactor }
}

/**
 * Test cases for validation
 *
 * Run these to verify coordinate conversions are correct.
 */
export const TEST_CASES = {
  leftEye: {
    genome: { x: -0.2, y: -0.4, rotation: 0 },
    boidSize: 100,
    expectedCanvas2D: { x: 40, y: -20 }, // Front → right, left → up
    expectedWebGL: { x: 40, y: 20 }, // Front → right, left → down (Y-flip)
  },

  rightEye: {
    genome: { x: 0.2, y: -0.4, rotation: 0 },
    boidSize: 100,
    expectedCanvas2D: { x: 40, y: 20 }, // Front → right, right → down
    expectedWebGL: { x: 40, y: -20 }, // Front → right, right → up (Y-flip)
  },

  tail: {
    genome: { x: 0, y: 0.5, rotation: 0 },
    boidSize: 100,
    expectedCanvas2D: { x: -50, y: 0 }, // Back → left, center → center
    expectedWebGL: { x: -50, y: 0 }, // Back → left, center → center
  },

  rightSpike: {
    genome: { x: 0.4, y: 0, rotation: -90 },
    boidSize: 100,
    expectedCanvas2D: { x: 0, y: 40 }, // Center → center, right → down
    expectedWebGL: { x: 0, y: -40 }, // Center → center, right → up (Y-flip)
    expectedRotation: -Math.PI / 2, // -90° in radians
  },

  leftFin: {
    genome: { x: -0.3, y: 0.1, rotation: 120 },
    boidSize: 100,
    expectedCanvas2D: { x: -10, y: -30 }, // Slightly back, left side
    expectedWebGL: { x: -10, y: 30 }, // Slightly back, left side (Y-flip)
    expectedRotation: (120 * Math.PI) / 180, // 120° in radians
  },
}

/**
 * Run validation tests
 *
 * @returns true if all tests pass, false otherwise
 */
export function runValidationTests(): boolean {
  const epsilon = 0.01 // Floating point tolerance

  function approxEqual(a: number, b: number): boolean {
    return Math.abs(a - b) < epsilon
  }

  function testCase(name: string, actual: Vector2, expected: Vector2): boolean {
    const pass =
      approxEqual(actual.x, expected.x) && approxEqual(actual.y, expected.y)
    console.log(
      `${pass ? '✅' : '❌'} ${name}:`,
      `actual=(${actual.x.toFixed(2)}, ${actual.y.toFixed(2)})`,
      `expected=(${expected.x.toFixed(2)}, ${expected.y.toFixed(2)})`
    )
    return pass
  }

  let allPass = true

  const leftEyeCanvas = genomeToCanvas2D(
    TEST_CASES.leftEye.genome,
    TEST_CASES.leftEye.boidSize
  )
  allPass &&= testCase(
    'Left Eye (Canvas 2D)',
    leftEyeCanvas,
    TEST_CASES.leftEye.expectedCanvas2D
  )

  const leftEyeWebGL = genomeToWebGL(
    TEST_CASES.leftEye.genome,
    TEST_CASES.leftEye.boidSize
  )
  allPass &&= testCase(
    'Left Eye (WebGL)',
    leftEyeWebGL,
    TEST_CASES.leftEye.expectedWebGL
  )

  const rightEyeCanvas = genomeToCanvas2D(
    TEST_CASES.rightEye.genome,
    TEST_CASES.rightEye.boidSize
  )
  allPass &&= testCase(
    'Right Eye (Canvas 2D)',
    rightEyeCanvas,
    TEST_CASES.rightEye.expectedCanvas2D
  )

  const rightEyeWebGL = genomeToWebGL(
    TEST_CASES.rightEye.genome,
    TEST_CASES.rightEye.boidSize
  )
  allPass &&= testCase(
    'Right Eye (WebGL)',
    rightEyeWebGL,
    TEST_CASES.rightEye.expectedWebGL
  )

  const tailCanvas = genomeToCanvas2D(
    TEST_CASES.tail.genome,
    TEST_CASES.tail.boidSize
  )
  allPass &&= testCase(
    'Tail (Canvas 2D)',
    tailCanvas,
    TEST_CASES.tail.expectedCanvas2D
  )

  const tailWebGL = genomeToWebGL(
    TEST_CASES.tail.genome,
    TEST_CASES.tail.boidSize
  )
  allPass &&= testCase('Tail (WebGL)', tailWebGL, TEST_CASES.tail.expectedWebGL)

  const rightSpikeCanvas = genomeToCanvas2D(
    TEST_CASES.rightSpike.genome,
    TEST_CASES.rightSpike.boidSize
  )
  allPass &&= testCase(
    'Right Spike (Canvas 2D)',
    rightSpikeCanvas,
    TEST_CASES.rightSpike.expectedCanvas2D
  )

  const rightSpikeWebGL = genomeToWebGL(
    TEST_CASES.rightSpike.genome,
    TEST_CASES.rightSpike.boidSize
  )
  allPass &&= testCase(
    'Right Spike (WebGL)',
    rightSpikeWebGL,
    TEST_CASES.rightSpike.expectedWebGL
  )

  return allPass
}

export default {
  SCALE_FACTORS,
  getPartScaleFactor,

  boidLocalToBoidRelative,

  genomeToCanvas2D,
  getBoidHeadingCanvas2D,

  genomeToWebGL,
  getBoidHeadingWebGL,

  genomeRotationToRadians,
  radiansToGenomeRotation,

  transformBodyPartCanvas2D,
  transformBodyPartWebGL,

  TEST_CASES,
  runValidationTests,
}
