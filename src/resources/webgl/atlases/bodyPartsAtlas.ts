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

    // Session 98: NORMALIZED ATLAS SIZE
    // All parts draw at the same size in their cells (80% of cell)
    // This allows genome size parameter to directly control visual size
    // without parts having different "intrinsic" scales
    const normalizedSize = cellSize * 0.8; // All parts fill 80% of cell

    // Save context and translate to cell center
    ctx.save();
    ctx.translate(centerX, centerY);

    // Render parts in white (colorized in shader)
    ctx.fillStyle = "white";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // Render the body part
    // All parts drawn at normalizedSize for consistent scaling
    switch (partName) {
      case "eye": {
        // Eye drawn at full normalized size (genome size will control actual scale)
        const eyeRadius = normalizedSize * 0.35; // Full eye size

        // Outer eye (white)
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(0, 0, eyeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Pupil (black for contrast)
        ctx.fillStyle = "#000000";
        const pupilRadius = eyeRadius * 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, pupilRadius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "fin": {
        // Angular fin - POINTS RIGHT (0°) in base state
        // Genome rotation will orient the fin as needed
        // Normalized to fill cell consistently with other parts
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";

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
        break;
      }

      case "spike": {
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
        break;
      }

      case "tail": {
        // Prominent tail fin - POINTS RIGHT (0°) in base state
        // Two merged triangles creating angular perspective
        // Genome rotation will orient the tail (typically 180° to point backward)
        // Normalized to fill cell consistently
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";

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
        break;
      }

      case "antenna": {
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
        ctx.arc(0, antennaLength, normalizedSize * 0.08, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "glow": {
        // Glow is a special marker - render a visible radial gradient
        // The actual glow effect is handled in the shader
        // Make it more visible in the atlas by using concentric circles
        // Normalized to fill cell consistently
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;

        // Draw concentric circles to represent glow
        const glowRadius = normalizedSize * 0.15;
        for (let i = 1; i <= 3; i++) {
          ctx.globalAlpha = 1.0 - i * 0.25; // Fade out
          ctx.beginPath();
          ctx.arc(0, 0, glowRadius * i, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0; // Reset alpha

        // Add a bright center
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case "shell": {
        // Protective shell - CENTERED in cell (circular armor pattern)
        // Normalized to fill cell consistently
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";

        // Draw concentric shell segments (centered)
        const shellRadius = normalizedSize * 0.4;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = 0.3 + i * 0.2;
          ctx.beginPath();
          ctx.arc(0, 0, shellRadius * (0.4 + i * 0.2), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // Outer shell outline (full circle, centered)
        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, shellRadius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      default:
        // Fallback: small circle at normalized size
        ctx.beginPath();
        ctx.arc(0, 0, normalizedSize * 0.3, 0, Math.PI * 2);
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
