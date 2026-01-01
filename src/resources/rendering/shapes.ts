/**
 * Shape Rendering Functions - Atlas Edition (Session 98 - Full Atlas)
 *
 * UNIFIED RENDERING: Canvas 2D now uses texture atlases for EVERYTHING
 * for pixel-perfect visual parity with WebGL.
 *
 * Architecture (Session 99 - Renderer Refactor):
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
import {
  createShapeAtlas,
  type ShapeAtlasResult,
} from "@/resources/webgl/atlases/shapeAtlas";
import { toRgb } from "@/lib/colors";

export type ShapeRenderer = (
  _ctx: CanvasRenderingContext2D,
  _size: number
) => void;

// ============================================================================
// ATLAS INITIALIZATION (Lazy Loading)
// ============================================================================

let bodyPartsAtlas: BodyPartsAtlasResult | null = null;
let shapeAtlas: ShapeAtlasResult | null = null;

// Session 99: Shape color cache for pixel-level tinting
// Cache colored shapes to avoid recomputing pixel data every frame
// Key format: "shapeName_R_G_B" (e.g., "circle_255_100_50")
const coloredShapeCache = new Map<string, HTMLCanvasElement>();

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
 * Get or create the shape atlas
 * Lazy initialization ensures atlas is only created when needed
 * Session 98: Shapes now use atlas too!
 */
function getShapeAtlas(): ShapeAtlasResult | null {
  if (!shapeAtlas) {
    shapeAtlas = createShapeAtlas();
    if (!shapeAtlas) {
      console.error("Failed to create shape atlas for Canvas 2D");
      return null;
    }
    console.log("✅ Shape atlas loaded for Canvas 2D rendering");
  }
  return shapeAtlas;
}

/**
 * Generic atlas-based shape renderer with pixel-level color replacement
 * Session 98: ALL shapes now use atlas (not just body parts!)
 * Session 99: Renderers now handle complete drawing (fill + stroke)
 * Session 99B: Pixel-level color replacement for proper tinting (OPTIMIZED with caching)
 *
 * @param ctx - Canvas rendering context
 * @param size - Size of the shape
 * @param shapeName - Name of the shape in atlas
 */
function renderAtlasShape(
  ctx: CanvasRenderingContext2D,
  size: number,
  shapeName: string
): void {
  const atlas = getShapeAtlas();
  if (!atlas) {
    // Fallback: render circle manually with complete drawing
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // Add subtle outline (using pre-set stroke style from pipeline)
    ctx.stroke();
    return;
  }

  // Get UV coordinates for this shape
  const shapeUV = atlas.shapeUVMap.get(shapeName);
  if (!shapeUV) {
    console.warn(`Shape "${shapeName}" not found in atlas`);
    // Fallback to circle with complete drawing
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }

  // Calculate source rectangle in atlas canvas
  const atlasSize = atlas.canvas.width;
  const cellPixelSize = atlasSize / atlas.gridSize;
  const srcX = shapeUV.u * atlasSize;
  const srcY = shapeUV.v * atlasSize;
  const srcWidth = cellPixelSize;
  const srcHeight = cellPixelSize;

  // Calculate destination size (diameter)
  const destSize = size * 2.0;

  // Extract fillStyle color and parse to RGB using color utility
  const fillColor = ctx.fillStyle as string;
  const [targetR, targetG, targetB] = toRgb(fillColor);
  
  // Create cache key: shapeName_R_G_B
  const cacheKey = `${shapeName}_${targetR}_${targetG}_${targetB}`;
  
  // Check if we already have this colored shape cached
  let coloredCanvas = coloredShapeCache.get(cacheKey);
  
  if (!coloredCanvas) {
    // Cache miss - create colored shape
    // Create an offscreen canvas for pixel manipulation
    coloredCanvas = document.createElement('canvas');
    coloredCanvas.width = cellPixelSize;
    coloredCanvas.height = cellPixelSize;
    const offCtx = coloredCanvas.getContext('2d')!;
    
    // Draw the white shape from atlas to offscreen canvas
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
    );
    
    // Get pixel data
    const imageData = offCtx.getImageData(0, 0, cellPixelSize, cellPixelSize);
    const data = imageData.data;
    
    // Replace white pixels with target color, preserving alpha
    // White in atlas (255, 255, 255) → target color (R, G, B)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      // Only recolor non-transparent pixels
      // Multiply white (1.0) by target color
      if (a > 0) {
        data[i] = (r / 255) * targetR;
        data[i + 1] = (g / 255) * targetG;
        data[i + 2] = (b / 255) * targetB;
        // Keep alpha unchanged
      }
    }
    
    // Put modified pixel data back
    offCtx.putImageData(imageData, 0, 0);
    
    // Store in cache for reuse
    coloredShapeCache.set(cacheKey, coloredCanvas);
  }
  
  // Draw the colored shape to main canvas (from cache or freshly created)
  ctx.drawImage(
    coloredCanvas,
    -destSize / 2,
    -destSize / 2,
    destSize,
    destSize
  );
  
  // Atlas rendering complete - shape is now colored at pixel level!
}

// Shape renderers - All use atlas now!
const renderDiamond: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "diamond");
const renderCircle: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "circle");
const renderHexagon: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "hexagon");
const renderSquare: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "square");
const renderTriangle: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "triangle");
const renderOval: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "oval");
const renderRectangle: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "rectangle");
const renderPentagonInverted: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "pentagon_inverted");
const renderHeptagon: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "heptagon");
const renderNonagon: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "nonagon");
const renderTrapezoid: ShapeRenderer = (ctx, size) =>
  renderAtlasShape(ctx, size, "trapezoid");

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
 */
function renderAtlasPart(
  ctx: CanvasRenderingContext2D,
  boidSize: number,
  _color: string,
  bodyParts: BodyPart[],
  partTypeName: string
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

    // Calculate destination size
    // Session 98: partSize is percentage of body radius (0.1-3.0)
    // Canvas 2D needs diameter, so we multiply by 2.0 to match WebGL shader behavior
    const destSize = boidSize * 2.0 * partSize;

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

/**
 * Eyes - Rendered from atlas (Session 95)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderEyes: BodyPartRenderer = (ctx, boidSize, _color, bodyParts) => {
  // Eyes should remain white/black (not tinted), so we pass white color
  // The atlas already has white eyes with black pupils
  renderAtlasPart(ctx, boidSize, "#FFFFFF", bodyParts, "eye");
};

/**
 * Fins - Rendered from atlas (Session 95)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderFins: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  renderAtlasPart(ctx, boidSize, color, bodyParts, "fin");
};

/**
 * Spikes - Rendered from atlas (Session 95)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderSpikes: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  renderAtlasPart(ctx, boidSize, color, bodyParts, "spike");
};

/**
 * Tail - Rendered from atlas (Session 95)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderTail: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  renderAtlasPart(ctx, boidSize, color, bodyParts, "tail");
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
 * Antenna - Rendered from atlas (Session 98)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderAntenna: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  renderAtlasPart(ctx, boidSize, color, bodyParts, "antenna");
};

/**
 * Shell - Rendered from atlas (Session 98)
 * ATLAS-BASED: Uses texture atlas for pixel-perfect visual parity with WebGL
 */
const renderShell: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  renderAtlasPart(ctx, boidSize, color, bodyParts, "shell");
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
  // Session 98: New shapes from expanded atlas
  oval: renderOval,
  rectangle: renderRectangle,
  pentagon_inverted: renderPentagonInverted,
  heptagon: renderHeptagon,
  nonagon: renderNonagon,
  trapezoid: renderTrapezoid,
};

/**
 * Body parts registry - Maps part names to rendering functions
 */
export const bodyPartRenderers: Record<RenderBodyPartType, BodyPartRenderer> = {
  eye: renderEyes,
  fin: renderFins,
  spike: renderSpikes,
  tail: renderTail,
  antenna: renderAntenna, // Session 98: Proper antenna renderer
  glow: renderGlow,
  shell: renderShell, // Session 98: Proper shell renderer
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
