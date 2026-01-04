/**
 * Shape Atlas Generation
 *
 * Creates a texture atlas for all boid body shapes.
 * This generates geometric shapes as textures that can be sampled in shaders.
 *
 * Benefits:
 * - One draw call for all boids regardless of shape
 * - Smooth anti-aliasing from Canvas 2D
 * - Easy to add new shapes
 * - Consistent with emoji/text atlas pattern
 *
 * Shapes are rendered centered, pointing right (0° = →)
 */

import type REGL from "regl";
import { createPreviewURL } from "./utils.ts";
import { AtlasResult } from "./types.ts";
import type { RenderShapeType } from "@/boids/vocabulary/schemas/visual.ts";
import { shapeKeywords } from "@/boids/vocabulary/keywords.ts";

// Type alias for backwards compatibility
export type ShapeAtlasResult = AtlasResult;

type ShapeRenderer = (ctx: CanvasRenderingContext2D, size: number) => void;
type ShapeRendererMap = Record<RenderShapeType, ShapeRenderer>;

const shapeRenderers = {
  [shapeKeywords.diamond]: (ctx: CanvasRenderingContext2D, size: number) => {
    // Rotated square, pointed and agile
    ctx.beginPath();
    ctx.moveTo(size * 0.9, 0); // Right point (forward)
    ctx.lineTo(-size * 0.3, size * 0.55); // Bottom point
    ctx.lineTo(-size * 0.8, 0); // Left point (back)
    ctx.lineTo(-size * 0.3, -size * 0.55); // Top point
    ctx.closePath();
  },
  [shapeKeywords.circle]: (ctx: CanvasRenderingContext2D, size: number) => {
    // Smooth and social
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
    ctx.closePath();
  },
  [shapeKeywords.hexagon]: (ctx: CanvasRenderingContext2D, size: number) => {
    // Sturdy and grounded
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6; // Rotate to point forward
      const x = size * 0.7 * Math.cos(angle);
      const y = size * 0.7 * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  },
  [shapeKeywords.square]: (ctx: CanvasRenderingContext2D, size: number) => {
    // Solid and stable
    const halfSize = size * 0.6;
    ctx.beginPath();
    ctx.rect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
    ctx.closePath();
  },
  [shapeKeywords.triangle]: (ctx: CanvasRenderingContext2D, size: number) => {
    // Classic boid shape
    ctx.beginPath();
    ctx.moveTo(size * 0.8, 0); // Tip (right)
    ctx.lineTo(-size * 0.5, size * 0.5); // Bottom left
    ctx.lineTo(-size * 0.5, -size * 0.5); // Top left
    ctx.closePath();
  },
  [shapeKeywords.oval]: (ctx: CanvasRenderingContext2D, size: number) => {
    // Elongated ellipse (capsule-like)
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.8, size * 0.5, 0, 0, Math.PI * 2);
    ctx.closePath();
  },
  [shapeKeywords.rectangle]: (ctx: CanvasRenderingContext2D, size: number) => {
    // Wider than tall
    const rectWidth = size * 0.9;
    const rectHeight = size * 0.5;
    ctx.beginPath();
    ctx.rect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight);
    ctx.closePath();
  },
  [shapeKeywords.pentagon_inverted]: (
    ctx: CanvasRenderingContext2D,
    size: number,
  ) => {
    // Pentagon pointing backward (defensive)
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = ((Math.PI * 2) / 5) * i + Math.PI; // Rotate 180° to point left
      const x = size * 0.7 * Math.cos(angle);
      const y = size * 0.7 * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  },
  [shapeKeywords.heptagon]: (ctx: CanvasRenderingContext2D, size: number) => {
    // 7-sided polygon
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const angle = ((Math.PI * 2) / 7) * i - Math.PI / 2; // Point up
      const x = size * 0.7 * Math.cos(angle);
      const y = size * 0.7 * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  },
  [shapeKeywords.nonagon]: (ctx: CanvasRenderingContext2D, size: number) => {
    // 9-sided polygon (almost circular)
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const angle = ((Math.PI * 2) / 9) * i - Math.PI / 2; // Point up
      const x = size * 0.7 * Math.cos(angle);
      const y = size * 0.7 * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  },
  [shapeKeywords.trapezoid]: (ctx: CanvasRenderingContext2D, size: number) => {
    // Wider at front, narrower at back
    ctx.beginPath();
    ctx.moveTo(size * 0.8, size * 0.4); // Front right
    ctx.lineTo(size * 0.8, -size * 0.4); // Front left
    ctx.lineTo(-size * 0.6, -size * 0.3); // Back left
    ctx.lineTo(-size * 0.6, size * 0.3); // Back right
    ctx.closePath();
  },
} as const satisfies ShapeRendererMap;

const fallbackRenderer = (ctx: CanvasRenderingContext2D, size: number) => {
  // Fallback to circle
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
  ctx.closePath();
};

/**
 * Create texture atlas for all boid body shapes
 */
export const createShapeAtlas = (): AtlasResult | null => {
  // Define all available shapes
  const shapes: RenderShapeType[] = [
    // Existing shapes (from shapes.ts)
    shapeKeywords.diamond,
    shapeKeywords.circle,
    shapeKeywords.hexagon,
    shapeKeywords.square,
    shapeKeywords.triangle,

    // New shapes (requested by Sir RegiByte)
    shapeKeywords.oval,
    shapeKeywords.rectangle,
    shapeKeywords.pentagon_inverted,
    shapeKeywords.heptagon,
    shapeKeywords.nonagon,
    shapeKeywords.trapezoid,
  ];

  const cellSize = 256; // Session 102: Increased from 128px to reduce pixelation when zoomed
  const gridSize = Math.ceil(Math.sqrt(shapes.length));
  const atlasSize = gridSize * cellSize;

  // Create offscreen canvas
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasSize;
  atlasCanvas.height = atlasSize;
  const ctx = atlasCanvas.getContext("2d");

  if (!ctx) {
    console.error("Failed to create shape atlas canvas context");
    return null;
  }

  // Clear to transparent
  ctx.clearRect(0, 0, atlasSize, atlasSize);

  // Store UV coordinates for each shape
  const shapeUVMap = new Map<string, { u: number; v: number }>();

  // Render each shape to the atlas
  shapes.forEach((shapeName, index) => {
    const col = index % gridSize;
    const row = Math.floor(index / gridSize);
    const cellX = col * cellSize;
    const cellY = row * cellSize;
    const centerX = cellX + cellSize / 2;
    const centerY = cellY + cellSize / 2;

    // Size of shape (use most of cell with minimal padding)
    const size = cellSize * 0.5; // Increased from 0.35 to 0.45 (90% total width)

    // Save context and translate to cell center
    ctx.save();
    ctx.translate(centerX, centerY);

    // Session 101 Phase 2: Draw three-layer shape (shadow, body, outline)
    // Canvas 2D paths are consumed by fill/stroke, so we redraw for each layer

    // Get the appropriate renderer
    const renderer = shapeRenderers[shapeName] || fallbackRenderer;

    // Layer 1: BLUE shadow (drawn first, slightly offset and SCALED UP for visibility)
    ctx.save();
    ctx.translate(-10, 0); // Shadow offset (3px down-right)
    ctx.scale(1.11, 1.11); // Make shadow 8% larger so it peeks out behind body
    renderer(ctx, size);
    ctx.fillStyle = "rgb(0, 0, 255)"; // BLUE marker
    ctx.fill();
    ctx.restore();

    // Layer 2: RED body (main shape, no offset)
    renderer(ctx, size);
    ctx.fillStyle = "rgb(255, 0, 0)"; // RED marker
    ctx.fill();

    // Layer 3: GREEN outline (drawn last, on top)
    renderer(ctx, size);
    ctx.strokeStyle = "rgb(0, 255, 0)"; // GREEN marker
    ctx.lineWidth = 6; // Visible outline width
    ctx.stroke();

    // Restore context
    ctx.restore();

    // Store UV coordinates (normalized 0-1)
    shapeUVMap.set(shapeName, {
      u: col / gridSize,
      v: row / gridSize,
    });
  });

  return {
    canvas: atlasCanvas,
    uvMap: shapeUVMap,
    gridSize,
    cellSize: 1.0 / gridSize, // UV size of each cell
    previewURL: createPreviewURL(atlasCanvas), // For debugging!
  };
};

/**
 * Create REGL texture from shape atlas
 */
export const createShapeTexture = (
  regl: REGL.Regl,
  atlas: AtlasResult,
): REGL.Texture2D => {
  return regl.texture({
    data: atlas.canvas,
    mag: "linear", // Smooth scaling when zoomed in
    min: "linear", // Smooth scaling when zoomed out
    wrap: "clamp", // Don't repeat the texture
    flipY: false, // Canvas is already right-side up
  });
};

/**
 * Log shape atlas debug info to console
 */
export const logShapeAtlasDebugInfo = (atlas: AtlasResult): void => {
  console.log("🎨 Shape Atlas Preview URL:", atlas.previewURL);
  console.log("📊 Shape Atlas Info:", {
    shapes: Array.from(atlas.uvMap.keys()),
    gridSize: atlas.gridSize,
    cellSize: atlas.cellSize,
  });
  console.log("💡 To preview: window.open(shapeAtlasPreviewURL)");
  (window as unknown as { shapeAtlasPreviewURL: string }).shapeAtlasPreviewURL =
    atlas.previewURL;
};
