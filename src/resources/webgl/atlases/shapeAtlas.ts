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

export type ShapeAtlasResult = {
  canvas: HTMLCanvasElement;
  shapeUVMap: Map<string, { u: number; v: number }>;
  gridSize: number;
  cellSize: number; // UV size of each cell (1.0 / gridSize)
  previewURL: string; // Data URL for debugging
};

/**
 * Create texture atlas for all boid body shapes
 */
export const createShapeAtlas = (): ShapeAtlasResult | null => {
  // Define all available shapes
  const shapes = [
    // Existing shapes (from shapes.ts)
    "diamond",
    "circle",
    "hexagon",
    "square",
    "triangle",

    // New shapes (requested by Sir RegiByte)
    "oval",
    "rectangle",
    "pentagon_inverted",
    "heptagon",
    "nonagon",
    "trapezoid",
  ];

  const cellSize = 128; // Pixels per shape (high res for quality)
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

    // Render shape in white (we'll colorize in shader)
    ctx.fillStyle = "white";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2;

    // Render the shape
    ctx.beginPath();

    switch (shapeName) {
      case "diamond":
        // Rotated square, pointed and agile
        ctx.moveTo(size * 0.9, 0); // Right point (forward)
        ctx.lineTo(-size * 0.3, size * 0.55); // Bottom point
        ctx.lineTo(-size * 0.8, 0); // Left point (back)
        ctx.lineTo(-size * 0.3, -size * 0.55); // Top point
        ctx.closePath();
        break;

      case "circle":
        // Smooth and social
        ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
        ctx.closePath();
        break;

      case "hexagon":
        // Sturdy and grounded
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6; // Rotate to point forward
          const x = size * 0.7 * Math.cos(angle);
          const y = size * 0.7 * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;

      case "square": {
        // Solid and stable
        const halfSize = size * 0.6;
        ctx.rect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
        ctx.closePath();
        break;
      }

      case "triangle":
        // Classic boid shape
        ctx.moveTo(size * 0.8, 0); // Tip (right)
        ctx.lineTo(-size * 0.5, size * 0.5); // Bottom left
        ctx.lineTo(-size * 0.5, -size * 0.5); // Top left
        ctx.closePath();
        break;

      case "oval":
        // Elongated ellipse (capsule-like)
        ctx.ellipse(0, 0, size * 0.8, size * 0.5, 0, 0, Math.PI * 2);
        ctx.closePath();
        break;

      case "rectangle": {
        // Wider than tall
        const rectWidth = size * 0.9;
        const rectHeight = size * 0.5;
        ctx.rect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight);
        ctx.closePath();
        break;
      }

      case "pentagon_inverted":
        // Pentagon pointing backward (defensive)
        for (let i = 0; i < 5; i++) {
          const angle = ((Math.PI * 2) / 5) * i + Math.PI; // Rotate 180° to point left
          const x = size * 0.7 * Math.cos(angle);
          const y = size * 0.7 * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;

      case "heptagon":
        // 7-sided polygon
        for (let i = 0; i < 7; i++) {
          const angle = ((Math.PI * 2) / 7) * i - Math.PI / 2; // Point up
          const x = size * 0.7 * Math.cos(angle);
          const y = size * 0.7 * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;

      case "nonagon":
        // 9-sided polygon (almost circular)
        for (let i = 0; i < 9; i++) {
          const angle = ((Math.PI * 2) / 9) * i - Math.PI / 2; // Point up
          const x = size * 0.7 * Math.cos(angle);
          const y = size * 0.7 * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;

      case "trapezoid":
        // Wider at front, narrower at back
        ctx.moveTo(size * 0.8, size * 0.4); // Front right
        ctx.moveTo(size * 0.8, -size * 0.4); // Front left
        ctx.lineTo(-size * 0.6, -size * 0.3); // Back left
        ctx.lineTo(-size * 0.6, size * 0.3); // Back right
        ctx.closePath();
        break;

      default:
        // Fallback to circle
        ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
        ctx.closePath();
    }

    // Fill and stroke
    ctx.fill();
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
    shapeUVMap,
    gridSize,
    cellSize: 1.0 / gridSize, // UV size of each cell
    previewURL: atlasCanvas.toDataURL("image/png"), // For debugging!
  };
};

/**
 * Create REGL texture from shape atlas
 */
export const createShapeTexture = (
  regl: REGL.Regl,
  atlas: ShapeAtlasResult
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
export const logShapeAtlasDebugInfo = (atlas: ShapeAtlasResult): void => {
  console.log("🎨 Shape Atlas Preview URL:", atlas.previewURL);
  console.log("📊 Shape Atlas Info:", {
    shapes: Array.from(atlas.shapeUVMap.keys()),
    gridSize: atlas.gridSize,
    cellSize: atlas.cellSize,
  });
  console.log("💡 To preview: window.open(shapeAtlasPreviewURL)");
  (window as unknown as { shapeAtlasPreviewURL: string }).shapeAtlasPreviewURL =
    atlas.previewURL;
};
