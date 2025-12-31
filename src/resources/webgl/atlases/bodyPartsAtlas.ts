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
 * CRITICAL: Each texture cell contains ONE part (one eye, one fin, etc.)
 * The genome specifies multiple instances if needed (e.g., [eye, eye] = two eyes)
 */

import type REGL from "regl";

export type BodyPartsAtlasResult = {
  canvas: HTMLCanvasElement;
  partUVMap: Map<string, { u: number; v: number }>;
  gridSize: number;
  cellSize: number; // UV size of each cell (1.0 / gridSize)
  previewURL: string; // Data URL for debugging
};

/**
 * Create texture atlas for all boid body parts
 */
export const createBodyPartsAtlas = (): BodyPartsAtlasResult | null => {
  // Define all available body parts
  const parts = [
    "eye", // Single eye (rendered multiple times at different positions)
    "fin", // Side fin for aquatic look
    "spike", // Defensive spike for predators
    "tail", // Prominent tail fin
    "antenna", // Sensory appendage
    "glow", // Glow effect (marker only, handled in shader)
    "shell", // Protective shell
  ];

  const cellSize = 128; // Pixels per part (same as shapes)
  const gridSize = Math.ceil(Math.sqrt(parts.length));
  const atlasSize = gridSize * cellSize;

  // Create offscreen canvas
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasSize;
  atlasCanvas.height = atlasSize;
  const ctx = atlasCanvas.getContext("2d");

  if (!ctx) {
    console.error("Failed to create body parts atlas canvas context");
    return null;
  }

  // Clear to transparent
  ctx.clearRect(0, 0, atlasSize, atlasSize);

  // Store UV coordinates for each part
  const partUVMap = new Map<string, { u: number; v: number }>();

  // Render each part to the atlas
  parts.forEach((partName, index) => {
    const col = index % gridSize;
    const row = Math.floor(index / gridSize);
    const cellX = col * cellSize;
    const cellY = row * cellSize;
    const centerX = cellX + cellSize / 2;
    const centerY = cellY + cellSize / 2;

    // Size of part (relative to boid size, which will be ~10-20 world units)
    const size = cellSize * 0.35;

    // Save context and translate to cell center
    ctx.save();
    ctx.translate(centerX, centerY);

    // Render parts in white (colorized in shader)
    ctx.fillStyle = "white";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    // Render the body part
    switch (partName) {
      case "eye": {
        // Single eye (will be rendered multiple times at different positions)
        const eyeSize = size * 0.4; // Larger since it's just one eye

        // Outer eye (white)
        ctx.beginPath();
        ctx.arc(0, 0, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Pupil (darker white for contrast)
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        const pupilSize = eyeSize * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, pupilSize, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "fin":
        // Single fin (will be rendered multiple times at different positions/rotations)
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";

        ctx.beginPath();
        ctx.moveTo(-size * 0.1, 0);
        ctx.lineTo(-size * 0.6, -size * 0.7);
        ctx.lineTo(-size * 0.2, -size * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case "spike":
        // Single defensive spike (will be rendered multiple times)
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.3);
        ctx.lineTo(-size * 0.15, -size * 0.8);
        ctx.lineTo(size * 0.15, -size * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case "tail":
        // Prominent tail fin
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";

        ctx.beginPath();
        ctx.moveTo(-size * 0.5, 0);
        ctx.lineTo(-size * 1.0, -size * 0.4);
        ctx.lineTo(-size * 0.8, 0);
        ctx.lineTo(-size * 1.0, size * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case "antenna": {
        // Single antenna (will be rendered multiple times at different positions)
        const antennaLength = size * 0.6;

        // Antenna stalk
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -antennaLength);
        ctx.stroke();

        // Antenna bulb
        ctx.beginPath();
        ctx.arc(0, -antennaLength, size * 0.15, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "glow":
        // Glow is a special marker - render a visible radial gradient
        // The actual glow effect is handled in the shader
        // Make it more visible in the atlas by using concentric circles
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;

        // Draw concentric circles to represent glow
        for (let i = 1; i <= 3; i++) {
          ctx.globalAlpha = 1.0 - i * 0.25; // Fade out
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.3 * i, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0; // Reset alpha

        // Add a bright center
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
        break;

      case "shell":
        // Protective shell (overlapping arcs)
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";

        // Draw overlapping shell segments
        for (let i = 0; i < 3; i++) {
          const offset = -size * 0.3 + i * size * 0.2;
          ctx.beginPath();
          ctx.arc(offset, 0, size * 0.4, -Math.PI / 2, Math.PI / 2);
          ctx.stroke();
        }

        // Outer shell outline
        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.6, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        break;

      default:
        // Fallback: small circle
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Restore context
    ctx.restore();

    // Store UV coordinates (normalized 0-1)
    partUVMap.set(partName, {
      u: col / gridSize,
      v: row / gridSize,
    });
  });

  return {
    canvas: atlasCanvas,
    partUVMap,
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
  atlas: BodyPartsAtlasResult
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
export const logBodyPartsAtlasDebugInfo = (
  atlas: BodyPartsAtlasResult
): void => {
  console.log("🎨 Body Parts Atlas Preview URL:", atlas.previewURL);
  console.log("📊 Body Parts Atlas Info:", {
    parts: Array.from(atlas.partUVMap.keys()),
    gridSize: atlas.gridSize,
    cellSize: atlas.cellSize,
    expectedCellSize: 1.0 / atlas.gridSize,
    firstPartUV: atlas.partUVMap.get("eye"),
  });
  console.log("💡 To preview: window.open(bodyPartsAtlasPreviewURL)");
  (
    window as unknown as { bodyPartsAtlasPreviewURL: string }
  ).bodyPartsAtlasPreviewURL = atlas.previewURL;
};
