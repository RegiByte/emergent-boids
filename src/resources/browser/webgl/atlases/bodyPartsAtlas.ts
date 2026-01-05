/**
 * Body Parts Atlas Generation
 *
 * Creates a texture atlas for all boid body parts.
 * Body parts are composable visual elements that layer on top of the base shape.
 * They provide visual variety and can convey mechanical bonuses (eyes = vision, fins = turn rate, etc.)
 *
 * Parts are rendered in white and colorized in the shader to match the boid's color.
 * This allows dynamic coloring without needing separate textures per color.
 *
 * CRITICAL DESIGN CONVENTIONS:
 * 1. Each part is CENTERED in its atlas cell as a standalone graphic
 * 2. ALL directional parts point RIGHT (0°, along +X axis) in base state
 * 3. Positioning/rotation happens during rendering via genome values
 * 4. No hardcoded rotation offsets needed - genome rotation is applied directly
 *
 * UNIFIED ORIENTATION STANDARD (Session 94, Phase 2):
 * - Fin: Points RIGHT (base at left, tip extends right)
 * - Spike: Points RIGHT (base at origin, tip extends right)
 * - Tail: Points RIGHT (base at left, tips extend right in V-shape)
 * - Eye/Glow/Shell: Circular (no orientation)
 * - Antenna: Vertical (no directional preference)
 *
 * NORMALIZED ATLAS SIZING (Session 98):
 * - ALL parts drawn at the SAME normalized size (80% of cell)
 * - This ensures genome size parameter directly controls visual appearance
 * - size: 1.0 means "100% of body radius" regardless of part type
 * - Allows maximum texture detail (every part uses full cell space)
 * - Future-proof for detailed textures with borders, gradients, multiple layers
 *
 * The genome specifies multiple instances if needed (e.g., [eye, eye] = two eyes)
 */

import type REGL from "regl";
import type { AtlasResult } from "./types.ts";
import { bodyPartKeywords } from "@/boids/vocabulary/keywords.ts";
import { BodyPartType } from "@/lib/coordinates.ts";
import {
  generateRingSeeds,
  lloydRelaxation,
  drawVoronoi,
} from "@/lib/voronoi.ts";

// Type alias for backwards compatibility
export type BodyPartsAtlasResult = AtlasResult;

type PartRenderer = (
  ctx: CanvasRenderingContext2D,
  normalizedSize: number,
) => void;
type PartRendererMap = Record<BodyPartType, PartRenderer>;

const partRenderers = {
  [bodyPartKeywords.eye]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number,
  ) => {
    // Session 102: Multi-color eye with three layers
    // RED = outer eye white, GREEN = iris outline, BLUE = pupil center
    // This tests the marker color system on body parts!
    const eyeRadius = normalizedSize * 0.35; // Full eye size
    const irisRadius = eyeRadius * 0.65; // Iris size (smaller than full eye)
    const pupilRadius = eyeRadius * 0.4; // Pupil size (smallest)

    // Layer 1: Outer eye sclera (RED marker)
    ctx.fillStyle = "rgb(255, 0, 0)"; // RED marker
    ctx.beginPath();
    ctx.arc(0, 0, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 2: Iris outline (GREEN marker)
    ctx.strokeStyle = "rgb(0, 255, 0)"; // GREEN marker
    ctx.lineWidth = 4; // Visible iris ring
    ctx.beginPath();
    ctx.arc(0, 0, irisRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Layer 3: Pupil center (BLUE marker)
    ctx.fillStyle = "rgb(0, 0, 255)"; // BLUE marker
    ctx.beginPath();
    ctx.arc(0, 0, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
  },
  [bodyPartKeywords.fin]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number,
  ) => {
    // Angular fin - POINTS RIGHT (0°) in base state
    // Genome rotation will orient the fin as needed
    // Normalized to fill cell consistently with other parts
    ctx.fillStyle = "white"; // Solid white (Session 101)

    // Create angular fin pointing RIGHT (base at left, tip at right)
    // Scaled to normalizedSize for consistency
    const finLength = normalizedSize * 0.45; // Fin length
    const finWidth = normalizedSize * 0.25; // Fin width

    ctx.beginPath();
    ctx.moveTo(-finLength * 0.3, -finWidth); // Top base (at body)
    ctx.lineTo(finLength, 0); // Pointy tip (pointing right)
    ctx.lineTo(-finLength * 0.3, finWidth); // Bottom base (at body)
    ctx.lineTo(-finLength * 0.15, 0); // Inner point (creates angular shape)
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
  [bodyPartKeywords.spike]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number,
  ) => {
    // Single defensive spike - POINTS RIGHT (0°) in base state
    // Genome rotation will orient the spike as needed
    // Normalized to fill cell consistently
    ctx.strokeStyle = "white";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    // Spike pointing RIGHT (along +X axis)
    const spikeLength = normalizedSize * 0.45;
    ctx.beginPath();
    ctx.moveTo(-spikeLength * 0.1, 0); // Base (at boid body)
    ctx.lineTo(spikeLength, 0); // Tip (pointing right)
    ctx.stroke();

    // Add a thicker base for visual weight
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-spikeLength * 0.1, 0);
    ctx.lineTo(spikeLength * 0.2, 0);
    ctx.stroke();
  },
  [bodyPartKeywords.tail]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number,
  ) => {
    // Prominent tail fin - POINTS RIGHT (0°) in base state
    // Two merged triangles creating angular perspective
    // Genome rotation will orient the tail (typically 180° to point backward)
    // Normalized to fill cell consistently
    ctx.fillStyle = "white"; // Solid white (Session 101)

    // V-shape pointing RIGHT (base at left, tips extending right)
    const tailLength = normalizedSize * 0.45;
    const tailHeight = normalizedSize * 0.3;

    ctx.beginPath();
    ctx.moveTo(-tailLength * 0.3, 0); // Base (at boid body)
    ctx.lineTo(tailLength, -tailHeight); // Top tip (pointing right)
    ctx.lineTo(tailLength * 0.8, 0); // Middle point (creates angular V)
    ctx.lineTo(tailLength, tailHeight); // Bottom tip (pointing right)
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
  [bodyPartKeywords.antenna]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number,
  ) => {
    // Single antenna - CENTERED in cell (extends vertically)
    // Normalized to fill cell consistently
    const antennaLength = normalizedSize * 0.45;

    // Antenna stalk (centered vertically around origin)
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -antennaLength);
    ctx.lineTo(0, antennaLength);
    ctx.stroke();

    // Antenna bulb at top
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(0, -antennaLength, normalizedSize * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Small bulb at bottom for symmetry
    ctx.beginPath();
    ctx.arc(0, antennaLength, normalizedSize * 0.04, 0, Math.PI * 2);
    ctx.fill();
  },
  [bodyPartKeywords.glow]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number,
  ) => {
    // Glow is a special marker - render a visible radial gradient
    // The actual glow effect is handled in the shader
    // Make it more visible in the atlas by using concentric circles
    // Normalized to fill cell consistently
    // Session 101: Solid white circles (no alpha manipulation)
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;

    // Draw concentric circles to represent glow
    const glowRadius = normalizedSize * 0.15;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, glowRadius * i, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Add a bright center
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  },
  [bodyPartKeywords.shell]: (
    ctx: CanvasRenderingContext2D,
    normalizedSize: number,
  ) => {
    // Turtle shell using Voronoi tessellation 🐢
    // Session 103: Beautiful organic scutes with Lloyd relaxation
    // 3-channel color markers: RED=border, GREEN=cells, BLUE=edges
    // Centered in cell, normalized size

    const shellStartTime = performance.now();
    const radius = normalizedSize * 0.4;

    // Ellipse ratio: >1 = wider (horizontal), <1 = taller (vertical), 1.0 = circle
    // Examples: 1.2 = slightly oval, 1.5 = wide oval, 0.8 = tall oval
    const ellipseRatio = 1.15;

    // Generate turtle-like seed distribution
    // Center + 5 inner ring + 9 outer ring = classic turtle pattern
    const seedStartTime = performance.now();
    let seeds = generateRingSeeds(radius, [5, 9], true);
    console.log(
      `  ⏱️ Shell: generateRingSeeds took ${(performance.now() - seedStartTime).toFixed(2)}ms`,
    );

    // Lloyd relaxation for organic, even distribution (3 iterations)
    // Sample size should be proportional to radius for consistent quality
    const relaxationSampleSize = Math.floor(radius * 2);
    const relaxationStartTime = performance.now();
    for (let i = 0; i < 3; i++) {
      const iterStart = performance.now();
      seeds = lloydRelaxation(seeds, radius, relaxationSampleSize);
      console.log(
        `  ⏱️ Shell: Lloyd relaxation iteration ${i + 1} took ${(performance.now() - iterStart).toFixed(2)}ms`,
      );
    }
    console.log(
      `  ⏱️ Shell: Total Lloyd relaxation took ${(performance.now() - relaxationStartTime).toFixed(2)}ms`,
    );

    // Draw the Voronoi shell with 3-channel color markers
    // OPTIMIZATION: Use smaller resolution for atlas (128px instead of 2x normalizedSize)
    // The atlas will be scaled up during rendering, so we can use lower resolution here
    const drawStartTime = performance.now();
    const voronoiSize = Math.floor(normalizedSize * 2); // Fixed resolution for atlas (good quality, much faster)
    drawVoronoi(ctx, voronoiSize, {
      seeds,
      radius: radius, // Scale radius to match new size
      ellipseRatio, // Oval shell shape
      edgeThickness: normalizedSize * 3 * (voronoiSize / (normalizedSize * 2)), // Scale edge thickness

      // Color marker channels (RGB):
      borderColor: "rgb(255, 0, 0)", // RED = Outer ring/border
      cellFillColor: "rgb(0, 255, 0)", // GREEN = Cell interiors
      edgeColor: "rgb(0, 0, 255)", // BLUE = Scute lines/edges
    });
    console.log(
      `  ⏱️ Shell: drawVoronoi took ${(performance.now() - drawStartTime).toFixed(2)}ms`,
    );
    console.log(
      `  ⏱️ Shell: Total shell render took ${(performance.now() - shellStartTime).toFixed(2)}ms`,
    );
  },
} as const satisfies PartRendererMap;

const fallbackRenderer = (
  ctx: CanvasRenderingContext2D,
  normalizedSize: number,
) => {
  // Fallback: small circle at normalized size
  ctx.beginPath();
  ctx.arc(0, 0, normalizedSize * 0.3, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * Create texture atlas for all boid body parts
 */
export const createBodyPartsAtlas = (): AtlasResult | null => {
  const atlasStartTime = performance.now();
  console.log("⏳ [BodyPartsAtlas] Starting atlas generation...");

  // Define all available body parts
  const parts = [
    bodyPartKeywords.eye, // Single eye (rendered multiple times at different positions)
    bodyPartKeywords.fin, // Side fin for aquatic look
    bodyPartKeywords.spike, // Defensive spike for predators
    bodyPartKeywords.tail, // Prominent tail fin
    bodyPartKeywords.antenna, // Sensory appendage
    bodyPartKeywords.glow, // Glow effect (marker only, handled in shader)
    bodyPartKeywords.shell, // Protective shell
  ];

  const cellSize = 256; // Pixels per part (same as shapes)
  const gridSize = Math.ceil(Math.sqrt(parts.length));
  const atlasSize = gridSize * cellSize;

  // Create offscreen canvas
  const canvasStartTime = performance.now();
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasSize;
  atlasCanvas.height = atlasSize;
  const ctx = atlasCanvas.getContext("2d");
  console.log(
    `  ⏱️ [BodyPartsAtlas] Canvas creation took ${(performance.now() - canvasStartTime).toFixed(2)}ms`,
  );

  if (!ctx) {
    console.error("Failed to create body parts atlas canvas context");
    return null;
  }

  // Clear to transparent
  ctx.clearRect(0, 0, atlasSize, atlasSize);

  // Store UV coordinates for each part
  const partUVMap = new Map<string, { u: number; v: number }>();

  // Render each part to the atlas
  const renderStartTime = performance.now();
  parts.forEach((partName, index) => {
    const partStartTime = performance.now();
    const col = index % gridSize;
    const row = Math.floor(index / gridSize);
    const cellX = col * cellSize;
    const cellY = row * cellSize;
    const centerX = cellX + cellSize / 2;
    const centerY = cellY + cellSize / 2;

    // Session 98: NORMALIZED ATLAS SIZE
    // All parts draw at the same size in their cells (80% of cell)
    // This allows genome size parameter to directly control visual size
    // without parts having different "intrinsic" scales
    const normalizedSize = cellSize * 0.8; // All parts fill 80% of cell

    // Save context and translate to cell center
    ctx.save();
    ctx.translate(centerX, centerY);

    // Session 101: Render parts in solid white (no opacity)
    // We'll colorize in shader/pixel manipulation
    ctx.fillStyle = "white";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // Render the body part
    // All parts drawn at normalizedSize for consistent scaling
    const renderer = partRenderers[partName] || fallbackRenderer;
    renderer(ctx, normalizedSize);

    // Restore context
    ctx.restore();

    // Store UV coordinates (normalized 0-1)
    partUVMap.set(partName, {
      u: col / gridSize,
      v: row / gridSize,
    });

    console.log(
      `  ⏱️ [BodyPartsAtlas] Rendered part "${partName}" in ${(performance.now() - partStartTime).toFixed(2)}ms`,
    );
  });
  console.log(
    `  ⏱️ [BodyPartsAtlas] Total rendering loop took ${(performance.now() - renderStartTime).toFixed(2)}ms`,
  );

  const totalTime = performance.now() - atlasStartTime;
  console.log(
    `✅ [BodyPartsAtlas] Atlas generation complete in ${totalTime.toFixed(2)}ms`,
  );

  return {
    canvas: atlasCanvas,
    uvMap: partUVMap,
    gridSize,
    cellSize: 1.0 / gridSize, // UV size of each cell
    previewURL: atlasCanvas.toDataURL("image/png"), // For debugging!
  };
};

/**
 * Create REGL texture from body parts atlas
 */
export const createBodyPartsTexture = (
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
 * Log body parts atlas debug info to console
 */
export const logBodyPartsAtlasDebugInfo = (atlas: AtlasResult): void => {
  // console.log("🎨 Body Parts Atlas Preview URL:", atlas.previewURL);
  console.log("📊 Body Parts Atlas Info:", {
    parts: Array.from(atlas.uvMap.keys()),
    gridSize: atlas.gridSize,
    cellSize: atlas.cellSize,
    expectedCellSize: 1.0 / atlas.gridSize,
    firstPartUV: atlas.uvMap.get("eye"),
  });
  console.log("💡 To preview: window.open(bodyPartsAtlasPreviewURL)");
  (
    window as unknown as { bodyPartsAtlasPreviewURL: string }
  ).bodyPartsAtlasPreviewURL = atlas.previewURL;
};
