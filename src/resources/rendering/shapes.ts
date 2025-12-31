/**
 * Shape Rendering Functions - Atlas Edition (Session 95)
 *
 * UNIFIED RENDERING: Canvas 2D now uses the same texture atlases as WebGL
 * for pixel-perfect visual parity across renderers.
 *
 * Architecture:
 * - Base shapes: Manual drawing (kept for performance)
 * - Body parts: Atlas-based rendering (single source of truth)
 * - Coordinate system: Unified transformations via coordinates.ts
 *
 * Philosophy: Simple shapes + atlas parts + unified coordinates = visual consistency
 */

import type {
  RenderBodyPartType,
  RenderShapeType,
} from "../../boids/vocabulary/schemas/prelude";
import type { BodyPart } from "../../boids/vocabulary/schemas/genetics";
import {
  transformBodyPartCanvas2D,
  type BodyPartType,
} from "@/lib/coordinates";
import {
  createBodyPartsAtlas,
  type BodyPartsAtlasResult,
} from "@/resources/webgl/atlases/bodyPartsAtlas";

export type ShapeRenderer = (
  _ctx: CanvasRenderingContext2D,
  _size: number
) => void;

// ============================================================================
// ATLAS INITIALIZATION (Lazy Loading)
// ============================================================================

let bodyPartsAtlas: BodyPartsAtlasResult | null = null;

/**
 * Get or create the body parts atlas
 * Lazy initialization ensures atlas is only created when needed
 */
function getBodyPartsAtlas(): BodyPartsAtlasResult | null {
  if (!bodyPartsAtlas) {
    bodyPartsAtlas = createBodyPartsAtlas();
    if (!bodyPartsAtlas) {
      console.error("Failed to create body parts atlas for Canvas 2D");
      return null;
    }
    console.log("✅ Body parts atlas loaded for Canvas 2D rendering");
  }
  return bodyPartsAtlas;
}

/**
 * Diamond - Rotated square, pointed and agile
 * Good for: Fast species (explorers, predators)
 */
const renderDiamond: ShapeRenderer = (ctx, size) => {
  ctx.beginPath();
  // Match WebGL atlas shape definition (`src/resources/webgl/atlases/shapeAtlas.ts`)
  ctx.moveTo(size * 0.9, 0); // Right point (forward)
  ctx.lineTo(-size * 0.3, size * 0.55); // Bottom point
  ctx.lineTo(-size * 0.8, 0); // Left point (back)
  ctx.lineTo(-size * 0.3, -size * 0.55); // Top point
  ctx.closePath();
};

/**
 * Circle - Smooth and social
 * Good for: Schooling species, social prey
 */
const renderCircle: ShapeRenderer = (ctx, size) => {
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
  ctx.closePath();
};

/**
 * Hexagon - Sturdy and grounded
 * Good for: Ground prey, herbivores, defensive species
 */
const renderHexagon: ShapeRenderer = (ctx, size) => {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6; // Rotate to point forward
    const x = size * 0.7 * Math.cos(angle);
    const y = size * 0.7 * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

/**
 * Square - Solid and stable
 * Good for: Tank-like species, slow but sturdy
 */
const renderSquare: ShapeRenderer = (ctx, size) => {
  const halfSize = size * 0.6;
  ctx.beginPath();
  ctx.rect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
  ctx.closePath();
};

/**
 * Triangle - Classic boid (backward compatible)
 * Good for: Generic species, fallback
 */
const renderTriangle: ShapeRenderer = (ctx, size) => {
  ctx.beginPath();
  // Match WebGL atlas shape definition (`src/resources/webgl/atlases/shapeAtlas.ts`)
  ctx.moveTo(size * 0.8, 0); // Tip (right)
  ctx.lineTo(-size * 0.5, size * 0.5);
  ctx.lineTo(-size * 0.5, -size * 0.5);
  ctx.closePath();
};

/**
 * Body Parts System - Composable visual elements
 * These are rendered AFTER the main body shape to add character
 *
 * ATLAS-BASED RENDERING (Session 95):
 * Body parts are now rendered from texture atlases for visual parity with WebGL.
 * Uses unified coordinate transformations and samples from the same atlas canvas.
 */

export type BodyPartRenderer = (
  _ctx: CanvasRenderingContext2D,
  _boidSize: number,
  _color: string,
  _bodyParts: BodyPart[] // Array of body parts of this type from genome
) => void;

/**
 * Generic atlas-based body part renderer
 *
 * Renders a body part by sampling from the atlas texture.
 * Applies position, rotation, and scale transformations using unified coordinate system.
 *
 * @param ctx - Canvas rendering context
 * @param boidSize - Size of the boid (for scaling)
 * @param color - Color to tint the part (hex string)
 * @param bodyParts - Array of body parts from genome
 * @param partTypeName - Name of the part type (for UV lookup)
 * @param sizeMultiplier - Visual size adjustment (matches WebGL)
 */
function renderAtlasPart(
  ctx: CanvasRenderingContext2D,
  boidSize: number,
  _color: string,
  bodyParts: BodyPart[],
  partTypeName: string,
  sizeMultiplier: number = 0.7
): void {
  const atlas = getBodyPartsAtlas();
  if (!atlas) {
    // Fallback: render nothing (atlas failed to load)
    return;
  }

  // Get UV coordinates for this part type
  const partUV = atlas.partUVMap.get(partTypeName);
  if (!partUV) {
    console.warn(`Part type "${partTypeName}" not found in atlas`);
    return;
  }

  // Calculate source rectangle in atlas canvas
  const atlasSize = atlas.canvas.width;
  const cellPixelSize = atlasSize / atlas.gridSize;
  const srcX = partUV.u * atlasSize;
  const srcY = partUV.v * atlasSize;
  const srcWidth = cellPixelSize;
  const srcHeight = cellPixelSize;

  // Render each body part instance
  for (const part of bodyParts) {
    const partSize = part.size || 1.0;
    const partPosX = part.position?.x || 0;
    const partPosY = part.position?.y || 0;
    const partRotation = part.rotation || 0;

    // Use unified coordinate transformation
    const { offset, rotation } = transformBodyPartCanvas2D(
      { x: partPosX, y: partPosY },
      partRotation,
      partTypeName as BodyPartType,
      boidSize
    );

    // Calculate destination size (matches WebGL scaling)
    // WebGL uses: partSize * boidScale * 0.7
    // We need to match that without over-compensating
    const destSize = boidSize * sizeMultiplier * partSize;

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.rotate(rotation);

    // Draw part from atlas (centered)
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
    );

    ctx.restore();
  }
}

// Size multiplier to match WebGL's bodyPartScaleMultiplier
// Session 97: WebGL shader applies * 2.0, so we use 0.7 * 2.0 = 1.4 effective size
// Canvas doesn't have the shader doubling, so we need higher value for parity
// Testing shows 1.4 works well for Canvas to match WebGL's (0.7 * 2.0)
const sizeMultiplier = 1.4;
/**
 * Eyes - Rendered from atlas (Session 95)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderEyes: BodyPartRenderer = (ctx, boidSize, _color, bodyParts) => {
  // Eyes should remain white/black (not tinted), so we pass white color
  // The atlas already has white eyes with black pupils
  // Size multiplier empirically tuned to match WebGL visual scale
  renderAtlasPart(ctx, boidSize, "#FFFFFF", bodyParts, "eye", sizeMultiplier);
};

/**
 * Fins - Rendered from atlas (Session 95)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderFins: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  renderAtlasPart(ctx, boidSize, color, bodyParts, "fin", sizeMultiplier);
};

/**
 * Spikes - Rendered from atlas (Session 95)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderSpikes: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  renderAtlasPart(ctx, boidSize, color, bodyParts, "spike", sizeMultiplier);
};

/**
 * Tail - Rendered from atlas (Session 95)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderTail: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  renderAtlasPart(ctx, boidSize, color, bodyParts, "tail", sizeMultiplier);
};

/**
 * Glow - Subtle glow effect for special species
 * GENOME-DRIVEN: Reads size from body part data
 */
const renderGlow: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  // Use the first glow part's size (usually only one)
  const glowPart = bodyParts[0];
  const glowSize = glowPart?.size || 1.0;

  ctx.shadowBlur = boidSize * 0.8 * glowSize;
  ctx.shadowColor = color;
  // The glow is applied to the main body, so we don't draw anything here
  // This is just a marker that tells the renderer to enable shadow
};

/**
 * Shape registry - Maps shape names to rendering functions
 */
export const shapeRenderers: Record<RenderShapeType, ShapeRenderer> = {
  diamond: renderDiamond,
  circle: renderCircle,
  hexagon: renderHexagon,
  square: renderSquare,
  triangle: renderTriangle,
};

/**
 * Body parts registry - Maps part names to rendering functions
 */
export const bodyPartRenderers: Record<RenderBodyPartType, BodyPartRenderer> = {
  eye: renderEyes,
  fin: renderFins,
  spike: renderSpikes,
  tail: renderTail,
  antenna: renderEyes, // Reuse eyes renderer for now
  glow: renderGlow,
  shell: renderSpikes, // Reuse spikes renderer for now
};

/**
 * Get shape renderer for a given shape type
 * Falls back to circle if shape not found
 */
export const getShapeRenderer = (shape: RenderShapeType): ShapeRenderer => {
  return shapeRenderers[shape] || renderCircle;
};

/**
 * Get body part renderer for a given part type
 */
export const getBodyPartRenderer = (
  part: RenderBodyPartType
): BodyPartRenderer | undefined => {
  return bodyPartRenderers[part];
};
