/**
 * Static Boid WebGL Renderer
 *
 * Standalone WebGL utilities for rendering individual boids without the full
 * resource system. Used for developer tools like the boids atlas.
 *
 * Architecture:
 * - Minimal REGL context with atlases and shaders
 * - Single boid rendering (no batching needed)
 * - Reuses existing infrastructure (atlases, shaders, data preparation)
 * - No dependency on braided resource system
 */

import REGL from 'regl'
import type { Boid } from '@/boids/vocabulary/schemas/entities'
import type { SpeciesConfig } from '@/boids/vocabulary/schemas/species'
import type { AtlasesResult } from '@/resources/browser/atlases.ts'
import {
  createShapeTexture,
  type ShapeAtlasResult,
} from '@/resources/browser/webgl/atlases/shapeAtlas'
import {
  createBodyPartsTexture,
  type BodyPartsAtlasResult,
} from '@/resources/browser/webgl/atlases/bodyPartsAtlas'
import { createShapeBoidsDrawCommand } from '@/resources/browser/webgl/drawCommands/shapeBoids'
import { createBodyPartsDrawCommand } from '@/resources/browser/webgl/drawCommands/bodyParts'
import { colorToRgb } from '@/resources/browser/webgl/dataPreparation/utils'
import { transformBodyPartWebGL, type BodyPartType } from '@/lib/coordinates'
import { shapeSizeParamFromBaseSize } from '@/lib/shapeSizing'
import { darken } from '@/lib/colors' // Session 101 Phase 2: Perceptual shadow colors

/**
 * Minimal WebGL context for static boid rendering
 * Contains all resources needed to render a single boid
 */
export interface StaticWebGLContext {
  regl: REGL.Regl
  shapeAtlas: ShapeAtlasResult
  shapeTexture: REGL.Texture2D
  bodyPartsAtlas: BodyPartsAtlasResult
  bodyPartsTexture: REGL.Texture2D
  drawShapeBoids: REGL.DrawCommand
  drawBodyParts: REGL.DrawCommand
}

/**
 * Initialize a minimal WebGL context for static boid rendering
 *
 * Creates REGL context, uses pre-generated texture atlases, compiles shaders,
 * and prepares draw commands. This is a standalone setup that doesn't
 * depend on the full resource system.
 *
 *
 * This eliminates redundant atlas generation and improves performance.
 *
 * @param canvas - Canvas element to render to
 * @param atlases - Pre-generated atlases from the atlases resource
 * @returns WebGL context or null if initialization fails
 */
export function createMinimalWebGLContext(
  canvas: HTMLCanvasElement,
  atlases: AtlasesResult
): StaticWebGLContext | null {
  try {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false, // Match blend function expectations
    })

    if (!gl) {
      console.error(
        'Failed to create WebGL context - WebGL may not be available'
      )
      return null
    }

    const regl = REGL({
      gl,
      extensions: ['ANGLE_instanced_arrays'],
    })

    const shapeAtlas = atlases.shapes
    if (!shapeAtlas) {
      console.error('Shape atlas not available from resource')
      return null
    }

    const shapeTexture = createShapeTexture(regl, shapeAtlas)
    if (!shapeTexture) {
      console.error('Failed to create shape texture')
      return null
    }

    const bodyPartsAtlas = atlases.bodyParts
    if (!bodyPartsAtlas) {
      console.error('Body parts atlas not available from resource')
      return null
    }

    const bodyPartsTexture = createBodyPartsTexture(regl, bodyPartsAtlas)
    if (!bodyPartsTexture) {
      console.error('Failed to create body parts texture')
      return null
    }

    const drawShapeBoids = createShapeBoidsDrawCommand(
      regl,
      shapeTexture,
      shapeAtlas
    )
    const drawBodyParts = createBodyPartsDrawCommand(
      regl,
      bodyPartsTexture,
      bodyPartsAtlas
    )

    return {
      regl,
      shapeAtlas,
      shapeTexture,
      bodyPartsAtlas,
      bodyPartsTexture,
      drawShapeBoids,
      drawBodyParts,
    }
  } catch (error) {
    console.error('Failed to initialize WebGL context:', error)
    return null
  }
}

/**
 * Create transform matrix for static boid rendering
 * Centers the boid in the canvas and applies scale
 *
 * @param scale - Scale multiplier
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Column-major mat3 for WebGL
 */
function createStaticTransformMatrix(
  _scale: number,
  width: number,
  height: number
): number[] {
  const scaleX = 2 / width
  const scaleY = 2 / height // Positive Y (WebGL coords, not flipped)

  return [
    scaleX,
    0,
    0, // Column 0: affects x
    0,
    scaleY,
    0, // Column 1: affects y
    0,
    0,
    1, // Column 2: translation + homogeneous
  ]
}

/**
 * Render a single boid using WebGL
 *
 * Prepares instance data for the boid and its body parts,
 * then issues draw calls. Matches Canvas 2D rendering exactly.
 *
 * @param context - WebGL context with atlases and shaders
 * @param boid - The boid to render
 * @param speciesConfig - Species configuration (for shape, tail color, etc.)
 * @param options - Rendering options
 */
export function renderBoidWebGL(
  context: StaticWebGLContext,
  boid: Boid,
  speciesConfig: SpeciesConfig | undefined,
  options: {
    scale?: number
    width: number
    height: number
  }
): void {
  const { regl, shapeAtlas, bodyPartsAtlas, drawShapeBoids, drawBodyParts } =
    context
  const { scale = 1, width, height } = options

  regl.clear({
    color: [0, 0, 0, 0],
    depth: 1,
  })

  const transform = createStaticTransformMatrix(scale, width, height)

  const shapeBoidData = prepareShapeBoidInstanceData(
    boid,
    speciesConfig,
    shapeAtlas,
    scale
  )

  drawShapeBoids({
    ...shapeBoidData,
    transform,
  })

  const bodyPartsData = prepareBodyPartsInstanceData(
    boid,
    speciesConfig,
    bodyPartsAtlas,
    scale
  )

  if (bodyPartsData && bodyPartsData.count > 0) {
    drawBodyParts({
      ...bodyPartsData,
      transform,
    })
  }

  const collisionRadius = boid.phenotype.collisionRadius * scale
  drawDebugCollisionCircle(regl, transform, boid.position, collisionRadius)
}

/**
 * Prepare instance data for a single boid's shape
 * Matches the format expected by the shape boids draw command
 */
function prepareShapeBoidInstanceData(
  boid: Boid,
  speciesConfig: SpeciesConfig | undefined,
  shapeAtlas: ShapeAtlasResult,
  scale: number
) {
  const { position, velocity, phenotype } = boid

  const rotation = Math.atan2(velocity.y, velocity.x)

  const [r, g, b] = colorToRgb(phenotype.color)

  const borderR = r * 0.5
  const borderG = g * 0.5
  const borderB = b * 0.5

  const shadowHex = darken(phenotype.color, 2.5)
  const [shadowR, shadowG, shadowB] = colorToRgb(shadowHex)

  const baseSize = phenotype.baseSize

  const shapeName = speciesConfig?.visualConfig?.shape || 'triangle'
  const boidScale = shapeSizeParamFromBaseSize(shapeName, baseSize) * scale
  const shapeUV = shapeAtlas.uvMap.get(shapeName)
  const uvCoords = shapeUV || shapeAtlas.uvMap.get('triangle') || { u: 0, v: 0 }

  return {
    positions: new Float32Array([position.x, position.y]),
    rotations: new Float32Array([rotation]),
    colors: new Float32Array([r, g, b]),
    borderColors: new Float32Array([borderR, borderG, borderB]),
    shadowColors: new Float32Array([shadowR, shadowG, shadowB]),
    scales: new Float32Array([boidScale]),
    shapeUVs: new Float32Array([uvCoords.u, uvCoords.v]),
    count: 1,
  }
}

/**
 * Prepare instance data for a single boid's body parts
 * Handles deduplication and tail color overrides
 */
function prepareBodyPartsInstanceData(
  boid: Boid,
  speciesConfig: SpeciesConfig | undefined,
  bodyPartsAtlas: BodyPartsAtlasResult,
  scale: number
) {
  const { position, velocity, phenotype } = boid
  const bodyParts = speciesConfig?.baseGenome?.visual?.bodyParts || []

  if (bodyParts.length === 0) return null

  const renderableParts = bodyParts.filter((part) => {
    const partType = typeof part === 'string' ? part : part.type
    return partType !== 'glow'
  })

  if (renderableParts.length === 0) return null

  const boidRotation = Math.atan2(velocity.y, velocity.x)
  const boidColor = colorToRgb(phenotype.color)

  const boidScale = phenotype.baseSize * scale

  const tailColor = speciesConfig?.visualConfig?.tailColor
    ? colorToRgb(speciesConfig.visualConfig.tailColor)
    : boidColor

  const partDataArrays: {
    boidPos: number[]
    boidRotation: number[]
    boidColor: number[]
    boidScale: number[]
    partUV: number[]
    partOffset: number[]
    partRotation: number[]
    partScale: number[]

    primaryColor: number[]
    secondaryColor: number[]
    tertiaryColor: number[]
  } = {
    boidPos: [],
    boidRotation: [],
    boidColor: [],
    boidScale: [],
    partUV: [],
    partOffset: [],
    partRotation: [],
    partScale: [],
    primaryColor: [],
    secondaryColor: [],
    tertiaryColor: [],
  }

  for (const part of renderableParts) {
    const partType = typeof part === 'string' ? part : part.type
    const partData = typeof part === 'object' ? part : null
    const partSize = partData?.size || 1.0
    const partPosX = partData?.position?.x || 0
    const partPosY = partData?.position?.y || 0
    const partRotation = partData?.rotation || 0 // Rotation in degrees (from genome)

    const partUV = bodyPartsAtlas.uvMap.get(partType)
    if (!partUV) continue

    const partColor = partType === 'tail' ? tailColor : boidColor

    partDataArrays.boidPos.push(position.x, position.y)
    partDataArrays.boidRotation.push(boidRotation)
    partDataArrays.boidColor.push(partColor[0], partColor[1], partColor[2])
    partDataArrays.boidScale.push(boidScale)
    partDataArrays.partUV.push(partUV.u, partUV.v)

    const { offset, rotation } = transformBodyPartWebGL(
      { x: partPosX, y: partPosY },
      partRotation,
      partType as BodyPartType,
      boidScale
    )

    partDataArrays.partOffset.push(offset.x, offset.y)
    partDataArrays.partRotation.push(rotation)

    partDataArrays.partScale.push(partSize * boidScale)

    partDataArrays.primaryColor.push(1.0, 1.0, 1.0) // White
    partDataArrays.secondaryColor.push(partColor[0], partColor[1], partColor[2]) // Part color
    partDataArrays.tertiaryColor.push(0.0, 0.0, 0.0) // Black
  }

  const count = renderableParts.length

  return {
    boidPositions: new Float32Array(partDataArrays.boidPos),
    boidRotations: new Float32Array(partDataArrays.boidRotation),
    boidColors: new Float32Array(partDataArrays.boidColor),
    boidScales: new Float32Array(partDataArrays.boidScale),
    partUVs: new Float32Array(partDataArrays.partUV),
    partOffsets: new Float32Array(partDataArrays.partOffset),
    partRotations: new Float32Array(partDataArrays.partRotation),
    partScales: new Float32Array(partDataArrays.partScale),

    primaryColors: new Float32Array(partDataArrays.primaryColor),
    secondaryColors: new Float32Array(partDataArrays.secondaryColor),
    tertiaryColors: new Float32Array(partDataArrays.tertiaryColor),
    count,
  }
}

/**
 * Draw debug collision circle
 * Simple circle outline to show collision radius
 */
function drawDebugCollisionCircle(
  regl: REGL.Regl,
  transform: number[],
  position: { x: number; y: number },
  radius: number
): void {
  const segments = 32
  const positions: number[] = []

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    positions.push(
      position.x + Math.cos(angle) * radius,
      position.y + Math.sin(angle) * radius
    )
  }

  const drawCircle = regl({
    vert: `
      precision mediump float;
      attribute vec2 position;
      uniform mat3 transform;
      
      void main() {
        vec3 pos = transform * vec3(position, 1.0);
        gl_Position = vec4(pos.xy, 0.0, 1.0);
      }
    `,
    frag: `
      precision mediump float;
      
      void main() {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 0.5); // Red semi-transparent
      }
    `,
    attributes: {
      position: positions,
    },
    uniforms: {
      transform,
    },
    count: segments + 1,
    primitive: 'line strip',
  })

  drawCircle()
}

/**
 * Cleanup WebGL resources
 * Call this when done with the context to free GPU memory
 *
 * @param context - WebGL context to cleanup
 */
export function destroyWebGLContext(context: StaticWebGLContext): void {
  try {
    context.shapeTexture.destroy()
    context.bodyPartsTexture.destroy()

    context.regl.destroy()
  } catch (error) {
    console.error('Error destroying WebGL context:', error)
  }
}
