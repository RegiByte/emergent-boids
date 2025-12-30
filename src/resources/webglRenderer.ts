import { defineResource } from "braided";
import REGL from "regl";
import type {
  Boid,
  FoodSource,
  SpeciesConfig,
} from "../boids/vocabulary/schemas/prelude";
import type { BoidEngine } from "./engine";
import type { CameraAPI } from "./camera";
import type { CanvasAPI } from "./canvas";
import type { RuntimeStoreResource } from "./runtimeStore";
import { toRgb } from "../lib/colors";
import { shouldShowHealthBar } from "../boids/lifecycle/health";

// Import shaders as strings
import boidVertShader from "../shaders/boid.vert?raw";
import boidFragShader from "../shaders/boid.frag?raw";
import foodVertShader from "../shaders/food.vert?raw";
import foodFragShader from "../shaders/food.frag?raw";
import trailVertShader from "../shaders/trail.vert?raw";
import trailFragShader from "../shaders/trail.frag?raw";
import energyBarVertShader from "../shaders/energyBar.vert?raw";
import energyBarFragShader from "../shaders/energyBar.frag?raw";
import healthBarVertShader from "../shaders/healthBar.vert?raw";
import healthBarFragShader from "../shaders/healthBar.frag?raw";
import selectionVertShader from "../shaders/selection.vert?raw";
import selectionFragShader from "../shaders/selection.frag?raw";
import stanceSymbolVertShader from "../shaders/stanceSymbol.vert?raw";
import stanceSymbolFragShader from "../shaders/stanceSymbol.frag?raw";
import textVertShader from "../shaders/text.vert?raw";
import textFragShader from "../shaders/text.frag?raw";
import shapeBoidVertShader from "../shaders/shapeBoid.vert?raw";
import shapeBoidFragShader from "../shaders/shapeBoid.frag?raw";
import bodyPartVertShader from "../shaders/bodyPart.vert?raw";
import bodyPartFragShader from "../shaders/bodyPart.frag?raw";

export type WebGLRenderer = {
  render: () => void;
  resize: (width: number, height: number) => void;
};

export const webglRenderer = defineResource({
  dependencies: {
    required: ["canvas", "engine", "camera", "runtimeStore", "time"],
    optional: [],
  },
  start: ({
    canvas,
    engine,
    camera,
    runtimeStore,
    time,
  }: {
    canvas: CanvasAPI;
    engine: BoidEngine;
    camera: CameraAPI;
    runtimeStore: RuntimeStoreResource;
    time: { getState: () => { simulationFrame: number } };
  }) => {
    // Create a separate canvas element for WebGL
    // (Can't use the same canvas as 2D context - they're mutually exclusive)
    const webglCanvas = document.createElement("canvas");
    webglCanvas.width = canvas.width;
    webglCanvas.height = canvas.height;
    webglCanvas.classList.add(
      "absolute",
      "top-[50%]",
      "left-[50%]",
      "translate-x-[-50%]",
      "translate-y-[-50%]"
    );
    webglCanvas.style.display = "none"; // Hidden by default (Canvas renderer is default)

    // Mouse wheel for zoom (matches Canvas 2D behavior)
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Get mouse position relative to canvas
      const rect = webglCanvas.getBoundingClientRect();
      const mouseScreenX = e.clientX - rect.left;
      const mouseScreenY = e.clientY - rect.top;

      // Calculate world position under mouse BEFORE zoom
      const worldBeforeZoom = camera.screenToWorld(mouseScreenX, mouseScreenY);

      // Apply zoom
      const zoomFactor = 1.02;
      const oldZoom = camera.zoom;
      const newZoom =
        e.deltaY > 0 ? camera.zoom / zoomFactor : camera.zoom * zoomFactor;
      camera.setZoom(newZoom);

      // If zoom actually changed (not clamped), adjust camera position
      // so the world point under the mouse stays in the same screen position
      if (camera.zoom !== oldZoom) {
        // Calculate where that world point would NOW be on screen with new zoom
        const worldAfterZoom = camera.screenToWorld(mouseScreenX, mouseScreenY);

        // The difference tells us how much the world "shifted" under the mouse
        // We need to move the camera in the OPPOSITE direction to compensate
        const dx = worldBeforeZoom.x - worldAfterZoom.x;
        const dy = worldBeforeZoom.y - worldAfterZoom.y;

        camera.panTo(camera.x + dx, camera.y + dy);
      }
    };

    // Attach zoom listener to WebGL canvas
    webglCanvas.addEventListener("wheel", handleWheel, { passive: false });

    // Throttle picker updates to avoid performance issues
    let lastPickerUpdate = 0;
    const PICKER_UPDATE_INTERVAL = 16; // ~60 FPS (16ms)

    // Mouse move handler for picker mode (matches Canvas 2D behavior)
    const handleMouseMove = (e: MouseEvent) => {
      if (camera.mode.type !== "picker") return;

      // Throttle updates to avoid excessive computation
      const now = performance.now();
      if (now - lastPickerUpdate < PICKER_UPDATE_INTERVAL) return;
      lastPickerUpdate = now;

      const rect = webglCanvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPos = camera.screenToWorld(screenX, screenY);

      // Find closest boid within picker radius (80px screen space)
      const closestBoidId = findClosestBoidToScreen(screenX, screenY, 80);

      camera.updatePickerTarget(closestBoidId, worldPos);
    };

    // Track mouse enter/leave canvas for picker mode
    const handleMouseEnter = () => {
      camera.setMouseInCanvas(true);
    };

    const handleMouseLeave = () => {
      camera.setMouseInCanvas(false);
    };

    // Helper function to find closest boid to screen position
    // Optimized: Only search visible boids in viewport
    const findClosestBoidToScreen = (
      screenX: number,
      screenY: number,
      maxScreenDistance: number
    ): string | null => {
      let closestBoid: string | null = null;
      let closestDistance = maxScreenDistance;

      // Convert screen position to world position for viewport check
      const worldPos = camera.screenToWorld(screenX, screenY);

      // Only search boids near the cursor (within picker radius in world space)
      const searchRadiusWorld = maxScreenDistance / camera.zoom;

      for (const boid of engine.boids) {
        // Quick world-space distance check first (cheaper than screen transform)
        const worldDx = boid.position.x - worldPos.x;
        const worldDy = boid.position.y - worldPos.y;
        const worldDistSq = worldDx * worldDx + worldDy * worldDy;

        // Skip if too far in world space (early rejection)
        if (worldDistSq > searchRadiusWorld * searchRadiusWorld * 4) continue;

        // Now do accurate screen-space distance check
        const boidScreen = camera.worldToScreen(
          boid.position.x,
          boid.position.y
        );
        const dx = boidScreen.x - screenX;
        const dy = boidScreen.y - screenY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestBoid = boid.id;
        }
      }

      return closestBoid;
    };

    // Click handler for starting follow mode (matches Canvas 2D behavior)
    const handleClick = (_e: MouseEvent) => {
      // Don't process clicks while panning
      if (camera.isDragging) {
        return;
      }

      // Handle picker mode - start following target boid
      if (camera.mode.type === "picker" && camera.mode.targetBoidId) {
        const targetId = camera.mode.targetBoidId;
        camera.startFollowing(targetId);
        console.log(`Following boid: ${targetId.slice(0, 8)}...`);
        return;
      }
    };

    // Attach mouse listeners to WebGL canvas
    webglCanvas.addEventListener("click", handleClick);
    webglCanvas.addEventListener("mousemove", handleMouseMove);
    webglCanvas.addEventListener("mouseenter", handleMouseEnter);
    webglCanvas.addEventListener("mouseleave", handleMouseLeave);

    // Initialize regl
    const regl = REGL({
      canvas: webglCanvas,
      extensions: ["ANGLE_instanced_arrays"],
    });

    // ============================================
    // EMOJI ATLAS GENERATION
    // ============================================

    // Define stance symbols (matches Canvas 2D implementation from pipeline.ts)
    const stanceSymbols: Record<string, { emoji: string; color: string }> = {
      // Predator stances
      hunting: { emoji: "😈", color: "#ff0000" },
      seeking_mate: { emoji: "💕", color: "#ff69b4" },
      eating: { emoji: "🍖", color: "#ffa500" },
      idle: { emoji: "😴", color: "#888888" },
      mating: { emoji: "💑", color: "#ff1493" },

      // Prey stances
      flocking: { emoji: "🐟", color: "#00ff88" },
      fleeing: { emoji: "😱", color: "#ffff00" },
      // eating, seeking_mate, and mating are shared with predators
    };

    // Create emoji texture atlas
    const createEmojiAtlas = () => {
      const emojiSize = 64; // Size of each emoji in pixels
      const uniqueEmojis = Array.from(
        new Set(Object.values(stanceSymbols).map((s) => s.emoji))
      );

      // Calculate atlas dimensions (square grid)
      const gridSize = Math.ceil(Math.sqrt(uniqueEmojis.length));
      const atlasSize = gridSize * emojiSize;

      // Create offscreen canvas
      const atlasCanvas = document.createElement("canvas");
      atlasCanvas.width = atlasSize;
      atlasCanvas.height = atlasSize;
      const ctx = atlasCanvas.getContext("2d");

      if (!ctx) {
        console.error("Failed to create emoji atlas canvas context");
        return null;
      }

      // Clear to transparent
      ctx.clearRect(0, 0, atlasSize, atlasSize);

      // Render each emoji to the atlas
      ctx.font = `${emojiSize * 0.75}px Arial`; // Slightly smaller than cell for padding
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const emojiUVMap = new Map<string, { u: number; v: number }>();

      uniqueEmojis.forEach((emoji, index) => {
        const col = index % gridSize;
        const row = Math.floor(index / gridSize);
        const x = col * emojiSize + emojiSize / 2;
        const y = row * emojiSize + emojiSize / 2;

        ctx.fillText(emoji, x, y);

        // Store UV coordinates (normalized 0-1)
        emojiUVMap.set(emoji, {
          u: col / gridSize,
          v: row / gridSize,
        });
      });

      return {
        canvas: atlasCanvas,
        emojiUVMap,
        gridSize,
        cellSize: 1.0 / gridSize, // UV size of each cell
      };
    };

    const emojiAtlas = createEmojiAtlas();

    if (!emojiAtlas) {
      console.error("Failed to create emoji atlas");
    }

    // Create texture from emoji atlas
    const emojiTexture = emojiAtlas
      ? regl.texture({
          data: emojiAtlas.canvas,
          mag: "linear", // Smooth scaling when zoomed in
          min: "linear", // Smooth scaling when zoomed out
          wrap: "clamp", // Don't repeat the texture
          flipY: false, // Canvas is already right-side up
        })
      : null;

    // ============================================
    // BITMAP FONT ATLAS GENERATION
    // ============================================

    // Create bitmap font atlas for text rendering
    const createFontAtlas = (
      fontFamily: string,
      fontSize: number,
      chars: string
    ) => {
      const charSize = fontSize * 1.5; // Extra padding for descenders/ascenders
      const uniqueChars = Array.from(new Set(chars));

      // Calculate atlas dimensions (square grid)
      const gridSize = Math.ceil(Math.sqrt(uniqueChars.length));
      const atlasSize = gridSize * charSize;

      // Create offscreen canvas
      const atlasCanvas = document.createElement("canvas");
      atlasCanvas.width = atlasSize;
      atlasCanvas.height = atlasSize;
      const ctx = atlasCanvas.getContext("2d");

      if (!ctx) {
        console.error("Failed to create font atlas canvas context");
        return null;
      }

      // Clear to transparent
      ctx.clearRect(0, 0, atlasSize, atlasSize);

      // Set font properties
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white"; // White text, we'll colorize in shader

      const charUVMap = new Map<
        string,
        {
          u: number;
          v: number;
          width: number; // Actual character width for proper spacing
        }
      >();

      uniqueChars.forEach((char, index) => {
        const col = index % gridSize;
        const row = Math.floor(index / gridSize);
        const x = col * charSize + charSize / 2;
        const y = row * charSize + charSize / 2;

        // Render character
        ctx.fillText(char, x, y);

        // Measure actual character width for proper spacing
        const metrics = ctx.measureText(char);
        const charWidth = metrics.width;

        // Store UV coordinates (normalized 0-1)
        charUVMap.set(char, {
          u: col / gridSize,
          v: row / gridSize,
          width: charWidth,
        });
      });

      return {
        canvas: atlasCanvas,
        charUVMap,
        gridSize,
        cellSize: 1.0 / gridSize,
        charSize, // Size of each cell in pixels
        fontSize,
      };
    };

    // Create font atlas with monospace font for stats
    // Include all characters we might need: A-Z, a-z, 0-9, and common symbols
    const fontChars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 :.,-+()[]{}!?@#$%&*=/";
    const fontAtlas = createFontAtlas("monospace", 16, fontChars);

    if (!fontAtlas) {
      console.error("Failed to create font atlas");
    }

    // Create texture from font atlas
    const fontTexture = fontAtlas
      ? regl.texture({
          data: fontAtlas.canvas,
          mag: "linear",
          min: "linear",
          wrap: "clamp",
          flipY: false,
        })
      : null;

    // ============================================
    // SHAPE ATLAS GENERATION
    // ============================================

    /**
     * Create texture atlas for all boid body shapes
     *
     * This generates geometric shapes as textures that can be sampled in shaders.
     * Benefits:
     * - One draw call for all boids regardless of shape
     * - Smooth anti-aliasing from Canvas 2D
     * - Easy to add new shapes
     * - Consistent with emoji/text atlas pattern
     *
     * Shapes are rendered centered, pointing right (0° = →)
     */
    const createShapeAtlas = () => {
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

        // Size of shape (70% of cell for padding)
        const size = cellSize * 0.35;

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
            ctx.moveTo(size, 0); // Right point (forward)
            ctx.lineTo(0, size * 0.7); // Bottom point
            ctx.lineTo(-size * 0.6, 0); // Left point (back)
            ctx.lineTo(0, -size * 0.7); // Top point
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

          case "square":
            // Solid and stable
            const halfSize = size * 0.6;
            ctx.rect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
            ctx.closePath();
            break;

          case "triangle":
            // Classic boid shape
            ctx.moveTo(size, 0); // Tip (right)
            ctx.lineTo(-size * 0.5, size * 0.5); // Bottom left
            ctx.lineTo(-size * 0.5, -size * 0.5); // Top left
            ctx.closePath();
            break;

          case "oval":
            // Elongated ellipse (capsule-like)
            ctx.ellipse(0, 0, size * 0.8, size * 0.5, 0, 0, Math.PI * 2);
            ctx.closePath();
            break;

          case "rectangle":
            // Wider than tall
            const rectWidth = size * 0.9;
            const rectHeight = size * 0.5;
            ctx.rect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight);
            ctx.closePath();
            break;

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
            ctx.lineTo(size * 0.8, -size * 0.4); // Front left
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

    const shapeAtlas = createShapeAtlas();

    if (!shapeAtlas) {
      console.error("Failed to create shape atlas");
    } else {
      // Log preview URL for easy debugging
      console.log("🎨 Shape Atlas Preview URL:", shapeAtlas.previewURL);
      console.log("📊 Shape Atlas Info:", {
        shapes: Array.from(shapeAtlas.shapeUVMap.keys()),
        gridSize: shapeAtlas.gridSize,
        cellSize: shapeAtlas.cellSize,
      });

      // Make it easy to open in new tab
      console.log("💡 To preview: window.open(shapeAtlasPreviewURL)");
      (window as any).shapeAtlasPreviewURL = shapeAtlas.previewURL;
    }

    // Create texture from shape atlas
    const shapeTexture = shapeAtlas
      ? regl.texture({
          data: shapeAtlas.canvas,
          mag: "linear", // Smooth scaling when zoomed in
          min: "linear", // Smooth scaling when zoomed out
          wrap: "clamp", // Don't repeat the texture
          flipY: false, // Canvas is already right-side up
        })
      : null;

    // ============================================
    // BODY PARTS ATLAS GENERATION
    // ============================================

    /**
     * Create texture atlas for all boid body parts
     *
     * Body parts are composable visual elements that layer on top of the base shape.
     * They provide visual variety and can convey mechanical bonuses (eyes = vision, fins = turn rate, etc.)
     *
     * Parts are rendered in white and colorized in the shader to match the boid's color.
     * This allows dynamic coloring without needing separate textures per color.
     */
    const createBodyPartsAtlas = () => {
      // Define all available body parts
      const parts = [
        "eye", // Two dots for character
        "fin", // Side fins for aquatic look
        "spike", // Defensive spikes for predators
        "tail", // Prominent tail fin
        "antenna", // Sensory appendages
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

    const bodyPartsAtlas = createBodyPartsAtlas();

    if (!bodyPartsAtlas) {
      console.error("Failed to create body parts atlas");
    } else {
      // Log preview URL for easy debugging
      console.log(
        "🎨 Body Parts Atlas Preview URL:",
        bodyPartsAtlas.previewURL
      );
      console.log("📊 Body Parts Atlas Info:", {
        parts: Array.from(bodyPartsAtlas.partUVMap.keys()),
        gridSize: bodyPartsAtlas.gridSize,
        cellSize: bodyPartsAtlas.cellSize,
        expectedCellSize: 1.0 / bodyPartsAtlas.gridSize,
        firstPartUV: bodyPartsAtlas.partUVMap.get('eye'),
      });

      // Make it easy to open in new tab
      console.log("💡 To preview: window.open(bodyPartsAtlasPreviewURL)");
      (window as any).bodyPartsAtlasPreviewURL = bodyPartsAtlas.previewURL;
    }

    // Create texture from body parts atlas
    const bodyPartsTexture = bodyPartsAtlas
      ? regl.texture({
          data: bodyPartsAtlas.canvas,
          mag: "linear", // Smooth scaling when zoomed in
          min: "linear", // Smooth scaling when zoomed out
          wrap: "clamp", // Don't repeat the texture
          flipY: false, // Canvas is already right-side up
        })
      : null;

    // ============================================
    // SHAPE-BASED BOID RENDERING SETUP
    // ============================================

    // Quad vertices for texture-based shape rendering (unit square)
    // We'll sample from the shape texture atlas
    const shapeBoidQuadPositions = [
      [0, 0], // Bottom-left
      [1, 0], // Bottom-right
      [0, 1], // Top-left
      [1, 1], // Top-right
    ];

    // Create draw command for shape-based boids
    const drawShapeBoids = shapeTexture
      ? regl({
          vert: shapeBoidVertShader,
          frag: shapeBoidFragShader,

          attributes: {
            // Shared quad geometry
            position: shapeBoidQuadPositions,

            // Per-instance data
            offset: {
              buffer: (regl.prop as (name: string) => unknown)("positions"),
              divisor: 1,
            },
            rotation: {
              buffer: (regl.prop as (name: string) => unknown)("rotations"),
              divisor: 1,
            },
            color: {
              buffer: (regl.prop as (name: string) => unknown)("colors"),
              divisor: 1,
            },
            scale: {
              buffer: (regl.prop as (name: string) => unknown)("scales"),
              divisor: 1,
            },
            shapeUV: {
              buffer: (regl.prop as (name: string) => unknown)("shapeUVs"),
              divisor: 1,
            },
          },

          uniforms: {
            transform: (regl.prop as unknown as (name: string) => number[])(
              "transform"
            ),
            shapeTexture: shapeTexture,
            cellSize: shapeAtlas!.cellSize,
          },

          // Enable blending for anti-aliased edges
          blend: {
            enable: true,
            func: {
              srcRGB: "src alpha",
              srcAlpha: 1,
              dstRGB: "one minus src alpha",
              dstAlpha: 1,
            },
          },

          primitive: "triangle strip",
          count: 4, // 4 vertices for quad
          instances: (regl.prop as unknown as (name: string) => number)(
            "count"
          ),
        })
      : null;

    // ============================================
    // BODY PARTS RENDERING SETUP
    // ============================================

    // Quad vertices for body parts (reuse same quad)
    const bodyPartQuadPositions = [
      [0, 0], // Bottom-left
      [1, 0], // Bottom-right
      [0, 1], // Top-left
      [1, 1], // Top-right
    ];

    // Create draw command for body parts
    const drawBodyParts = bodyPartsTexture
      ? regl({
          vert: bodyPartVertShader,
          frag: bodyPartFragShader,

          attributes: {
            // Shared quad geometry
            position: bodyPartQuadPositions,

            // Per-instance data (one instance per body part per boid)
            boidPos: {
              buffer: (regl.prop as (name: string) => unknown)("boidPositions"),
              divisor: 1,
            },
            boidRotation: {
              buffer: (regl.prop as (name: string) => unknown)("boidRotations"),
              divisor: 1,
            },
            boidColor: {
              buffer: (regl.prop as (name: string) => unknown)("boidColors"),
              divisor: 1,
            },
            boidScale: {
              buffer: (regl.prop as (name: string) => unknown)("boidScales"),
              divisor: 1,
            },
            partUV: {
              buffer: (regl.prop as (name: string) => unknown)("partUVs"),
              divisor: 1,
            },
            partOffset: {
              buffer: (regl.prop as (name: string) => unknown)("partOffsets"),
              divisor: 1,
            },
            partRotation: {
              buffer: (regl.prop as (name: string) => unknown)("partRotations"),
              divisor: 1,
            },
            partScale: {
              buffer: (regl.prop as (name: string) => unknown)("partScales"),
              divisor: 1,
            },
          },

          uniforms: {
            transform: (regl.prop as unknown as (name: string) => number[])(
              "transform"
            ),
            bodyPartsTexture: bodyPartsTexture,
            cellSize: bodyPartsAtlas!.cellSize,
          },

          // CRITICAL: Disable depth testing for proper layering
          // Body parts should render on top of boids (painter's algorithm)
          depth: {
            enable: false,
          },

          // Enable blending for transparency
          blend: {
            enable: true,
            func: {
              srcRGB: "src alpha",
              srcAlpha: 1,
              dstRGB: "one minus src alpha",
              dstAlpha: 1,
            },
          },

          primitive: "triangle strip",
          count: 4, // 4 vertices for quad
          instances: (regl.prop as unknown as (name: string) => number)(
            "count"
          ),
        })
      : null;

    // Triangle vertices (shared by all boids)
    // Pointing right (0 degrees = east)
    // Base size needs to be visible in world coordinates (world is 2500x2500)
    // At default zoom (1.0), we want boids to be ~10 pixels, so 10 world units
    const trianglePositions = [
      [5, 0], // Tip (right) - 10 units wide total
      [-3, -3], // Bottom left
      [-3, 3], // Top left
    ];

    // Create draw command for boids
    // Note: regl types are complex, using type assertion for prop() calls
    const drawBoids = regl({
      vert: boidVertShader,
      frag: boidFragShader,

      attributes: {
        // Shared triangle shape
        position: trianglePositions,

        // Per-instance data
        offset: {
          buffer: (regl.prop as (name: string) => unknown)("positions"),
          divisor: 1,
        },
        rotation: {
          buffer: (regl.prop as (name: string) => unknown)("rotations"),
          divisor: 1,
        },
        color: {
          buffer: (regl.prop as (name: string) => unknown)("colors"),
          divisor: 1,
        },
        scale: {
          buffer: (regl.prop as (name: string) => unknown)("scales"),
          divisor: 1,
        },
      },

      uniforms: {
        transform: (regl.prop as unknown as (name: string) => number[])(
          "transform"
        ),
      },

      count: 3, // 3 vertices per triangle
      instances: (regl.prop as unknown as (name: string) => number)("count"),
    });

    // Circle vertices for food sources (triangle fan)
    // Create a circle with 32 segments for smooth outline
    const circleSegments = 32;
    const circlePositions: number[][] = [];
    for (let i = 0; i <= circleSegments; i++) {
      const angle = (i / circleSegments) * Math.PI * 2;
      circlePositions.push([Math.cos(angle), Math.sin(angle)]);
    }

    // Create draw command for food sources
    const drawFood = regl({
      vert: foodVertShader,
      frag: foodFragShader,

      attributes: {
        // Shared circle shape
        position: circlePositions,

        // Per-instance data
        offset: {
          buffer: (regl.prop as (name: string) => unknown)("positions"),
          divisor: 1,
        },
        color: {
          buffer: (regl.prop as (name: string) => unknown)("colors"),
          divisor: 1,
        },
        radius: {
          buffer: (regl.prop as (name: string) => unknown)("radii"),
          divisor: 1,
        },
        alpha: {
          buffer: (regl.prop as (name: string) => unknown)("alphas"),
          divisor: 1,
        },
      },

      uniforms: {
        transform: (regl.prop as unknown as (name: string) => number[])(
          "transform"
        ),
      },

      // Enable blending for transparency
      blend: {
        enable: true,
        func: {
          srcRGB: "src alpha",
          srcAlpha: 1,
          dstRGB: "one minus src alpha",
          dstAlpha: 1,
        },
      },

      primitive: "triangle fan",
      count: circleSegments + 1,
      instances: (regl.prop as unknown as (name: string) => number)("count"),
    });

    // Prepare boid data for GPU
    const prepareBoidData = (boids: Boid[]) => {
      const count = boids.length;
      const positions = new Float32Array(count * 2);
      const rotations = new Float32Array(count);
      const colors = new Float32Array(count * 3);
      const scales = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const boid = boids[i];

        // Position
        positions[i * 2] = boid.position.x;
        positions[i * 2 + 1] = boid.position.y;

        // Rotation (from velocity) - atan2 gives angle in radians
        // Note: Negate Y because our projection flips Y axis (Canvas Y-down vs WebGL Y-up)
        // This ensures boids point in the direction they're moving
        rotations[i] = Math.atan2(-boid.velocity.y, boid.velocity.x);

        // Color (normalized to 0-1) - convert hex to RGB
        const [r, g, b] = toRgb(boid.phenotype.color);
        colors[i * 3] = r / 255;
        colors[i * 3 + 1] = g / 255;
        colors[i * 3 + 2] = b / 255;

        // Scale (from phenotype renderSize)
        // renderSize is typically 0.8-1.2 (size multiplier from genome)
        scales[i] = boid.phenotype.renderSize;
      }

      return { positions, rotations, colors, scales, count };
    };

    // Prepare shape-based boid data for GPU (with UV coordinates)
    const prepareShapeBoidData = (boids: Boid[]) => {
      const { config } = runtimeStore.store.getState();
      const count = boids.length;
      const positions = new Float32Array(count * 2);
      const rotations = new Float32Array(count);
      const colors = new Float32Array(count * 3);
      const scales = new Float32Array(count);
      const shapeUVs = new Float32Array(count * 2);

      for (let i = 0; i < count; i++) {
        const boid = boids[i];

        // Position
        positions[i * 2] = boid.position.x;
        positions[i * 2 + 1] = boid.position.y;

        // Rotation (from velocity)
        rotations[i] = Math.atan2(-boid.velocity.y, boid.velocity.x);

        // Color (normalized to 0-1)
        const [r, g, b] = toRgb(boid.phenotype.color);
        colors[i * 3] = r / 255;
        colors[i * 3 + 1] = g / 255;
        colors[i * 3 + 2] = b / 255;

        // Scale (match Canvas 2D sizing)
        // Canvas 2D uses: baseSize (8 for prey, 12 for predator) * sizeMultiplier
        // But we need to scale up more because:
        // 1. Shapes in atlas don't fill entire cell (70% of cell)
        // 2. Shapes themselves use size * 0.7 for radius
        // 3. Combined: effective size is ~0.5 of the quad
        // So we need to scale by ~2x to match Canvas 2D
        const speciesConfig = config.species[boid.typeId];
        const sizeMultiplier = speciesConfig?.baseGenome?.traits?.size || 1.0;
        const baseSize = speciesConfig?.role === "predator" ? 12 : 8;
        const atlasScaleFactor = 2.5; // Compensate for shape not filling texture
        scales[i] =
          baseSize *
          sizeMultiplier *
          boid.phenotype.renderSize *
          atlasScaleFactor;

        // Shape UV coordinates (lookup from atlas)
        if (shapeAtlas) {
          const speciesConfig = config.species[boid.typeId];
          const shapeName = speciesConfig?.visualConfig?.shape || "triangle";
          const shapeUV = shapeAtlas.shapeUVMap.get(shapeName);

          if (shapeUV) {
            shapeUVs[i * 2] = shapeUV.u;
            shapeUVs[i * 2 + 1] = shapeUV.v;
          } else {
            // Fallback to triangle if shape not found
            const triangleUV = shapeAtlas.shapeUVMap.get("triangle");
            shapeUVs[i * 2] = triangleUV?.u || 0;
            shapeUVs[i * 2 + 1] = triangleUV?.v || 0;
          }
        }
      }

      return { positions, rotations, colors, scales, shapeUVs, count };
    };

    // Prepare body parts data for GPU
    const prepareBodyPartsData = (boids: Boid[]) => {
      if (!bodyPartsAtlas) return null;

      const { config } = runtimeStore.store.getState();

      // Collect all body parts from all boids
      const parts: Array<{
        boidPos: [number, number];
        boidRotation: number;
        boidColor: [number, number, number];
        boidScale: number;
        partUV: [number, number];
        partOffset: [number, number];
        partRotation: number;
        partScale: number;
      }> = [];

      for (const boid of boids) {
        const speciesConfig = config.species[boid.typeId];
        const bodyParts = speciesConfig?.baseGenome?.visual?.bodyParts || [];

        if (bodyParts.length === 0) continue;

        // Boid properties
        const boidRotation = Math.atan2(-boid.velocity.y, boid.velocity.x);
        const [r, g, b] = toRgb(boid.phenotype.color);
        const boidColor: [number, number, number] = [r / 255, g / 255, b / 255];
        const sizeMultiplier = speciesConfig?.baseGenome?.traits?.size || 1.0;
        const baseSize = speciesConfig?.role === "predator" ? 12 : 8;
        const atlasScaleFactor = 2.5; // Must match boid rendering scale
        const boidScale =
          baseSize *
          sizeMultiplier *
          boid.phenotype.renderSize *
          atlasScaleFactor;

        // Add each body part
        for (const part of bodyParts) {
          const partType = typeof part === "string" ? part : part.type;

          // Skip glow (handled differently)
          if (partType === "glow") continue;

          // Get UV coordinates for this part type
          const partUV = bodyPartsAtlas.partUVMap.get(partType);
          if (!partUV) continue;

          // Part properties (from genome or defaults)
          const partData = typeof part === "object" ? part : null;
          const partSize = partData?.size || 1.0;
          const partPosX = partData?.position?.x || 0;
          const partPosY = partData?.position?.y || 0;
          const partRot = partData?.rotation
            ? (partData.rotation * Math.PI) / 180
            : 0;

          parts.push({
            boidPos: [boid.position.x, boid.position.y],
            boidRotation,
            boidColor,
            boidScale,
            partUV: [partUV.u, partUV.v],
            // Offset in boid-local space (before rotation by boid heading)
            // Genome uses: x = left/right, y = front/back (negative = front)
            // WebGL boid faces right (positive X), so we need to swap:
            // - genome.y (front/back) → offset.x (forward in boid space)
            // - genome.x (left/right) → offset.y (sideways in boid space)
            // Negate Y because genome uses negative-Y-is-front
            partOffset: [
              -partPosY * boidScale * 0.25,  // Front/back (reduced from 0.4)
              partPosX * boidScale * 0.25,   // Left/right (reduced from 0.4)
            ],
            partRotation: partRot,
            // Scale parts relative to boid body
            // Increased from 0.15 to 0.2 for better visibility
            partScale: partSize * boidScale * 0.2,
          });
        }
      }

      if (parts.length === 0) return null;

      // Convert to typed arrays
      const count = parts.length;
      const boidPositions = new Float32Array(count * 2);
      const boidRotations = new Float32Array(count);
      const boidColors = new Float32Array(count * 3);
      const boidScales = new Float32Array(count);
      const partUVs = new Float32Array(count * 2);
      const partOffsets = new Float32Array(count * 2);
      const partRotations = new Float32Array(count);
      const partScales = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const part = parts[i];

        boidPositions[i * 2] = part.boidPos[0];
        boidPositions[i * 2 + 1] = part.boidPos[1];
        boidRotations[i] = part.boidRotation;
        boidColors[i * 3] = part.boidColor[0];
        boidColors[i * 3 + 1] = part.boidColor[1];
        boidColors[i * 3 + 2] = part.boidColor[2];
        boidScales[i] = part.boidScale;
        partUVs[i * 2] = part.partUV[0];
        partUVs[i * 2 + 1] = part.partUV[1];
        partOffsets[i * 2] = part.partOffset[0];
        partOffsets[i * 2 + 1] = part.partOffset[1];
        partRotations[i] = part.partRotation;
        partScales[i] = part.partScale;
      }

      return {
        boidPositions,
        boidRotations,
        boidColors,
        boidScales,
        partUVs,
        partOffsets,
        partRotations,
        partScales,
        count,
      };
    };

    // Prepare food source data for GPU
    const prepareFoodData = (foodSources: FoodSource[]) => {
      const count = foodSources.length;
      const positions = new Float32Array(count * 2);
      const colors = new Float32Array(count * 3);
      const radii = new Float32Array(count);
      const alphas = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const food = foodSources[i];

        // Position
        positions[i * 2] = food.position.x;
        positions[i * 2 + 1] = food.position.y;

        // Color based on type (green for prey, red for predator)
        const color = food.sourceType === "prey" ? "#4CAF50" : "#F44336";
        const [r, g, b] = toRgb(color);
        colors[i * 3] = r / 255;
        colors[i * 3 + 1] = g / 255;
        colors[i * 3 + 2] = b / 255;

        // Radius scales with energy (12-28px)
        const energyRatio = food.energy / food.maxEnergy;
        radii[i] = 12 + energyRatio * 16;

        // Alpha scales with energy (0.5-1.0)
        alphas[i] = Math.max(0.5, energyRatio);
      }

      return { positions, colors, radii, alphas, count };
    };

    // ============================================
    // TRAIL RENDERING SETUP
    // ============================================

    // Line geometry for trails (simple line segment)
    // Each segment has 2 vertices: start (0.0) and end (1.0)
    // This is a 1D attribute that controls interpolation between startPos and endPos
    const linePositions = [0.0, 1.0];

    // Create draw command for trails
    const drawTrails = regl({
      vert: trailVertShader,
      frag: trailFragShader,

      attributes: {
        // Shared line geometry
        position: linePositions,

        // Per-instance data (one per trail segment)
        startPos: {
          buffer: (regl.prop as (name: string) => unknown)("startPositions"),
          divisor: 1,
        },
        endPos: {
          buffer: (regl.prop as (name: string) => unknown)("endPositions"),
          divisor: 1,
        },
        color: {
          buffer: (regl.prop as (name: string) => unknown)("colors"),
          divisor: 1,
        },
        alpha: {
          buffer: (regl.prop as (name: string) => unknown)("alphas"),
          divisor: 1,
        },
      },

      uniforms: {
        transform: (regl.prop as unknown as (name: string) => number[])(
          "transform"
        ),
      },

      // Enable blending for transparency
      blend: {
        enable: true,
        func: {
          srcRGB: "src alpha",
          srcAlpha: 1,
          dstRGB: "one minus src alpha",
          dstAlpha: 1,
        },
      },

      // Line width (WebGL 1.0 only supports lineWidth = 1)
      // For thicker lines, we'd need to use quads, but 1px is fine for trails
      lineWidth: 1,

      primitive: "lines",
      count: 2, // 2 vertices per line
      instances: (regl.prop as unknown as (name: string) => number)("count"),
    });

    // Trail batch type
    type TrailBatch = {
      segments: Array<{ x1: number; y1: number; x2: number; y2: number }>;
      color: { r: number; g: number; b: number };
      alpha: number;
    };

    // Prepare trail data for GPU (batched by color/alpha)
    const prepareTrailData = (batch: TrailBatch) => {
      const count = batch.segments.length;
      const startPositions = new Float32Array(count * 2);
      const endPositions = new Float32Array(count * 2);
      const colors = new Float32Array(count * 3);
      const alphas = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const segment = batch.segments[i];

        // Start position
        startPositions[i * 2] = segment.x1;
        startPositions[i * 2 + 1] = segment.y1;

        // End position
        endPositions[i * 2] = segment.x2;
        endPositions[i * 2 + 1] = segment.y2;

        // Color (same for all segments in batch)
        colors[i * 3] = batch.color.r;
        colors[i * 3 + 1] = batch.color.g;
        colors[i * 3 + 2] = batch.color.b;

        // Alpha (same for all segments in batch)
        alphas[i] = batch.alpha;
      }

      return { startPositions, endPositions, colors, alphas, count };
    };

    // Collect trail segments from visible boids and batch them
    // This mirrors the Canvas 2D batching logic for performance
    const collectTrailBatches = (
      boids: Boid[],
      worldWidth: number,
      worldHeight: number
    ): TrailBatch[] => {
      const batches = new Map<string, TrailBatch>();
      const { config } = runtimeStore.store.getState();

      // Get species configs for trail settings
      const speciesConfigs = config.species;

      for (const boid of boids) {
        const speciesConfig = speciesConfigs[boid.typeId];
        if (!speciesConfig || boid.positionHistory.length <= 1) continue;

        // Check if this species should render trails
        const shouldRenderTrail = speciesConfig.visualConfig?.trail ?? true;
        if (!shouldRenderTrail) continue;

        // Calculate energy ratio for trail visibility
        const energyRatio = boid.energy / boid.phenotype.maxEnergy;
        // Increase base alpha for better visibility
        // Match Canvas 2D: 0.3-0.8 range
        const baseAlpha = 0.3 + energyRatio * 0.5;

        // Use custom trail color if specified, otherwise use individual genome color
        const color =
          speciesConfig.visualConfig.trailColor || boid.phenotype.color;
        const [r, g, b] = toRgb(color);

        // Collect segments for this boid
        for (let i = 0; i < boid.positionHistory.length - 1; i++) {
          const pos1 = boid.positionHistory[i];
          const pos2 = boid.positionHistory[i + 1];

          // Skip if toroidal wrap detected (large position jump)
          const dx = Math.abs(pos2.x - pos1.x);
          const dy = Math.abs(pos2.y - pos1.y);
          const maxJump = Math.min(worldWidth, worldHeight) / 2;

          if (dx > maxJump || dy > maxJump) {
            continue;
          }

          // Calculate alpha for this segment (older = more transparent)
          // Index 0 = oldest (most transparent), index length-1 = newest (most opaque)
          const segmentRatio = i / boid.positionHistory.length;
          // Boost alpha for visibility (multiply by 1.5, cap at 1.0)
          const alpha = Math.min(1.0, baseAlpha * segmentRatio * 1.5);

          // Quantize alpha to reduce number of batches (10 levels)
          const quantizedAlpha = Math.round(alpha * 10) / 10;

          // Create batch key (color + alpha)
          const batchKey = `${r},${g},${b}|${quantizedAlpha}`;

          // Get or create batch
          let batch = batches.get(batchKey);
          if (!batch) {
            batch = {
              segments: [],
              color: { r: r / 255, g: g / 255, b: b / 255 },
              alpha: quantizedAlpha,
            };
            batches.set(batchKey, batch);
          }

          // Add segment to batch
          batch.segments.push({
            x1: pos1.x,
            y1: pos1.y,
            x2: pos2.x,
            y2: pos2.y,
          });
        }
      }

      return Array.from(batches.values());
    };

    // ============================================
    // ENERGY BAR RENDERING SETUP
    // ============================================

    // Quad geometry for energy bars (unit square)
    const quadPositions = [
      [0, 0], // Bottom-left
      [1, 0], // Bottom-right
      [0, 1], // Top-left
      [1, 1], // Top-right
    ];

    // Create draw command for energy bars (background + fill)
    const drawEnergyBars = regl({
      vert: energyBarVertShader,
      frag: energyBarFragShader,

      attributes: {
        // Shared quad geometry
        position: quadPositions,

        // Per-instance data
        boidPos: {
          buffer: (regl.prop as (name: string) => unknown)("boidPositions"),
          divisor: 1,
        },
        energyPercent: {
          buffer: (regl.prop as (name: string) => unknown)("energyPercents"),
          divisor: 1,
        },
        barColor: {
          buffer: (regl.prop as (name: string) => unknown)("barColors"),
          divisor: 1,
        },
      },

      uniforms: {
        transform: (regl.prop as unknown as (name: string) => number[])(
          "transform"
        ),
        barWidth: 22,
        barHeight: 3,
        barOffsetY: 20,
        layerType: (regl.prop as unknown as (name: string) => number)(
          "layerType"
        ),
      },

      // CRITICAL: Disable depth testing for 2D overlays
      // Without this, depth buffer decides visibility instead of draw order
      depth: {
        enable: false,
      },

      // Enable blending for proper layering
      blend: {
        enable: true,
        func: {
          srcRGB: "src alpha",
          srcAlpha: 1,
          dstRGB: "one minus src alpha",
          dstAlpha: 1,
        },
      },

      primitive: "triangle strip",
      count: 4, // 4 vertices per quad
      instances: (regl.prop as unknown as (name: string) => number)("count"),
    });

    // Note: Border draw command removed - line loop with triangle strip vertices
    // causes diagonal lines. The bars look fine without borders.

    // Prepare energy bar data for GPU
    // We render 3 layers: background, fill, border (using line loop for border)
    const prepareEnergyBarData = (
      boids: Boid[],
      speciesConfigs: Record<string, SpeciesConfig>
    ) => {
      // Filter boids that should show energy bars
      const boidsWithBars = boids.filter((boid) => {
        const speciesConfig = speciesConfigs[boid.typeId];
        if (!speciesConfig) return false;

        // Always show for predators, toggleable for prey
        return (
          speciesConfig.role === "predator" ||
          runtimeStore.store.getState().ui.visualSettings.energyBarsEnabled
        );
      });

      const count = boidsWithBars.length;
      const boidPositions = new Float32Array(count * 2);
      const energyPercents = new Float32Array(count);
      const barColors = new Float32Array(count * 3);

      for (let i = 0; i < boidsWithBars.length; i++) {
        const boid = boidsWithBars[i];
        const speciesConfig = speciesConfigs[boid.typeId];
        const energyPercent = boid.energy / boid.phenotype.maxEnergy;

        // Determine bar color based on role
        const color =
          speciesConfig.role === "predator"
            ? { r: 1.0, g: 0.0, b: 0.0 } // Red for predators
            : { r: 0.0, g: 1.0, b: 0.53 }; // Green for prey (#00ff88)

        boidPositions[i * 2] = boid.position.x;
        boidPositions[i * 2 + 1] = boid.position.y;
        energyPercents[i] = energyPercent;
        barColors[i * 3] = color.r;
        barColors[i * 3 + 1] = color.g;
        barColors[i * 3 + 2] = color.b;
      }

      return { boidPositions, energyPercents, barColors, count };
    };

    // ============================================
    // HEALTH BAR RENDERING SETUP
    // ============================================

    // Create draw command for health bars (background + fill)
    const drawHealthBars = regl({
      vert: healthBarVertShader,
      frag: healthBarFragShader,

      attributes: {
        // Shared quad geometry
        position: quadPositions,

        // Per-instance data
        boidPos: {
          buffer: (regl.prop as (name: string) => unknown)("boidPositions"),
          divisor: 1,
        },
        healthPercent: {
          buffer: (regl.prop as (name: string) => unknown)("healthPercents"),
          divisor: 1,
        },
        barColor: {
          buffer: (regl.prop as (name: string) => unknown)("barColors"),
          divisor: 1,
        },
      },

      uniforms: {
        transform: (regl.prop as unknown as (name: string) => number[])(
          "transform"
        ),
        barWidth: 22,
        barHeight: 3,
        barOffsetY: 25, // Position above energy bar (5px higher)
        layerType: (regl.prop as unknown as (name: string) => number)(
          "layerType"
        ),
      },

      // CRITICAL: Disable depth testing for 2D overlays
      depth: {
        enable: false,
      },

      // Enable blending for proper layering
      blend: {
        enable: true,
        func: {
          srcRGB: "src alpha",
          srcAlpha: 1,
          dstRGB: "one minus src alpha",
          dstAlpha: 1,
        },
      },

      primitive: "triangle strip",
      count: 4, // 4 vertices per quad
      instances: (regl.prop as unknown as (name: string) => number)("count"),
    });

    // Note: Border draw command removed - line loop with triangle strip vertices
    // causes diagonal lines. The bars look fine without borders.

    // Prepare health bar data for GPU
    // Only render for damaged boids (health < 100%)
    const prepareHealthBarData = (boids: Boid[]) => {
      // Filter boids that should show health bars
      const { ui } = runtimeStore.store.getState();
      if (!ui.visualSettings.healthBarsEnabled) {
        return {
          boidPositions: new Float32Array(0),
          healthPercents: new Float32Array(0),
          barColors: new Float32Array(0),
          count: 0,
        };
      }

      const boidsWithBars = boids.filter((boid) => shouldShowHealthBar(boid));

      const count = boidsWithBars.length;
      const boidPositions = new Float32Array(count * 2);
      const healthPercents = new Float32Array(count);
      const barColors = new Float32Array(count * 3);

      for (let i = 0; i < boidsWithBars.length; i++) {
        const boid = boidsWithBars[i];
        const healthPercent = boid.health / boid.phenotype.maxHealth;

        // Determine bar color based on health percentage
        // Green (>70%), Yellow (40-70%), Red (<40%)
        let color: { r: number; g: number; b: number };
        if (healthPercent > 0.7) {
          color = { r: 0.0, g: 1.0, b: 0.0 }; // Green
        } else if (healthPercent > 0.4) {
          color = { r: 1.0, g: 1.0, b: 0.0 }; // Yellow
        } else {
          color = { r: 1.0, g: 0.0, b: 0.0 }; // Red
        }

        boidPositions[i * 2] = boid.position.x;
        boidPositions[i * 2 + 1] = boid.position.y;
        healthPercents[i] = healthPercent;
        barColors[i * 3] = color.r;
        barColors[i * 3 + 1] = color.g;
        barColors[i * 3 + 2] = color.b;
      }

      return { boidPositions, healthPercents, barColors, count };
    };

    // ============================================
    // SELECTION OVERLAY RENDERING SETUP
    // ============================================

    // Circle outline geometry (line loop)
    // Create a circle with 64 segments for smooth outline
    const outlineSegments = 64;
    const outlinePositions: number[][] = [];
    for (let i = 0; i < outlineSegments; i++) {
      const angle = (i / outlineSegments) * Math.PI * 2;
      outlinePositions.push([Math.cos(angle), Math.sin(angle)]);
    }

    // Create draw command for selection circles (picker + followed boid)
    const drawSelectionCircles = regl({
      vert: selectionVertShader,
      frag: selectionFragShader,

      attributes: {
        // Shared circle outline geometry
        position: outlinePositions,

        // Per-instance data
        center: {
          buffer: (regl.prop as (name: string) => unknown)("centers"),
          divisor: 1,
        },
        radius: {
          buffer: (regl.prop as (name: string) => unknown)("radii"),
          divisor: 1,
        },
        color: {
          buffer: (regl.prop as (name: string) => unknown)("colors"),
          divisor: 1,
        },
        alpha: {
          buffer: (regl.prop as (name: string) => unknown)("alphas"),
          divisor: 1,
        },
      },

      uniforms: {
        transform: (regl.prop as unknown as (name: string) => number[])(
          "transform"
        ),
      },

      // Enable blending for transparency
      blend: {
        enable: true,
        func: {
          srcRGB: "src alpha",
          srcAlpha: 1,
          dstRGB: "one minus src alpha",
          dstAlpha: 1,
        },
      },

      // Note: WebGL line width is limited to 1.0 on most systems
      // For thicker lines, we'd need to use triangle strips or instanced quads
      lineWidth: 1,

      primitive: "line loop",
      count: outlineSegments,
      instances: (regl.prop as unknown as (name: string) => number)("count"),
    });

    // ============================================
    // STANCE SYMBOL RENDERING SETUP
    // ============================================

    // Quad geometry for stance symbols (unit square)
    const symbolQuadPositions = [
      [0, 0], // Bottom-left
      [1, 0], // Bottom-right
      [0, 1], // Top-left
      [1, 1], // Top-right
    ];

    // Create draw command for stance symbols (textured quads)
    const drawStanceSymbols = emojiTexture
      ? regl({
          vert: stanceSymbolVertShader,
          frag: stanceSymbolFragShader,

          attributes: {
            // Shared quad geometry
            position: symbolQuadPositions,

            // Per-instance data
            boidPos: {
              buffer: (regl.prop as (name: string) => unknown)("boidPositions"),
              divisor: 1,
            },
            uvOffset: {
              buffer: (regl.prop as (name: string) => unknown)("uvOffsets"),
              divisor: 1,
            },
            alpha: {
              buffer: (regl.prop as (name: string) => unknown)("alphas"),
              divisor: 1,
            },
          },

          uniforms: {
            transform: (regl.prop as unknown as (name: string) => number[])(
              "transform"
            ),
            emojiTexture: emojiTexture,
            cellSize: emojiAtlas?.cellSize || 1.0,
            symbolSize: 20, // 20px symbols in world space
          },

          // Enable blending for transparency
          blend: {
            enable: true,
            func: {
              srcRGB: "src alpha",
              srcAlpha: 1,
              dstRGB: "one minus src alpha",
              dstAlpha: 1,
            },
          },

          // 2D overlay - use painter's algorithm, not depth testing
          depth: {
            enable: false,
          },

          primitive: "triangle strip",
          count: 4,
          instances: (regl.prop as unknown as (name: string) => number)(
            "count"
          ),
        })
      : null;

    // ============================================
    // TEXT RENDERING SETUP
    // ============================================

    // Quad geometry for text characters (unit square)
    const textQuadPositions = [
      [0, 0], // Bottom-left
      [1, 0], // Bottom-right
      [0, 1], // Top-left
      [1, 1], // Top-right
    ];

    // Create draw command for text rendering
    const drawText = fontTexture
      ? regl({
          vert: textVertShader,
          frag: textFragShader,

          attributes: {
            // Shared quad geometry
            position: textQuadPositions,

            // Per-instance data (per character)
            charPos: {
              buffer: (regl.prop as (name: string) => unknown)("charPositions"),
              divisor: 1,
            },
            uvOffset: {
              buffer: (regl.prop as (name: string) => unknown)("uvOffsets"),
              divisor: 1,
            },
            charSize: {
              buffer: (regl.prop as (name: string) => unknown)("charSizes"),
              divisor: 1,
            },
            color: {
              buffer: (regl.prop as (name: string) => unknown)("colors"),
              divisor: 1,
            },
            alpha: {
              buffer: (regl.prop as (name: string) => unknown)("alphas"),
              divisor: 1,
            },
          },

          uniforms: {
            fontTexture: fontTexture,
            resolution: (regl.prop as unknown as (name: string) => number[])(
              "resolution"
            ),
            cellSize: fontAtlas?.cellSize || 1.0,
          },

          // Enable blending for transparency
          blend: {
            enable: true,
            func: {
              srcRGB: "src alpha",
              srcAlpha: 1,
              dstRGB: "one minus src alpha",
              dstAlpha: 1,
            },
          },

          // 2D overlay - use painter's algorithm, not depth testing
          depth: {
            enable: false,
          },

          primitive: "triangle strip",
          count: 4,
          instances: (regl.prop as unknown as (name: string) => number)(
            "count"
          ),
        })
      : null;

    // Text layout engine - converts string to quads
    const layoutText = (
      text: string,
      x: number,
      y: number,
      r: number,
      g: number,
      b: number,
      alpha: number = 1.0
    ) => {
      if (!fontAtlas) return null;

      const charPositions: number[] = [];
      const uvOffsets: number[] = [];
      const charSizes: number[] = [];
      const colors: number[] = [];
      const alphas: number[] = [];

      let cursorX = x;
      const cursorY = y;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const charInfo = fontAtlas.charUVMap.get(char);

        if (!charInfo) {
          // Unknown character, skip or use space
          cursorX += fontAtlas.fontSize * 0.5;
          continue;
        }

        // Add character quad
        charPositions.push(cursorX, cursorY);
        uvOffsets.push(charInfo.u, charInfo.v);
        charSizes.push(fontAtlas.charSize, fontAtlas.charSize);
        colors.push(r, g, b);
        alphas.push(alpha);

        // Advance cursor by character width
        cursorX += charInfo.width;
      }

      if (charPositions.length === 0) return null;

      return {
        charPositions: new Float32Array(charPositions),
        uvOffsets: new Float32Array(uvOffsets),
        charSizes: new Float32Array(charSizes),
        colors: new Float32Array(colors),
        alphas: new Float32Array(alphas),
        count: charPositions.length / 2,
      };
    };

    // Prepare selection overlay data
    // Returns circles for picker mode and followed boid
    const prepareSelectionData = () => {
      const circles: Array<{
        centerX: number;
        centerY: number;
        radius: number;
        r: number;
        g: number;
        b: number;
        alpha: number;
      }> = [];

      // Picker mode: Show picker circle and target highlight
      if (camera.mode.type === "picker" && camera.mode.mouseInCanvas) {
        const { mouseWorldPos, targetBoidId } = camera.mode;

        // Picker circle (dashed circle around mouse - we'll use solid for now)
        // Convert screen-space radius (80px) to world-space radius
        const pickerRadiusWorld = 80 / camera.zoom;
        circles.push({
          centerX: mouseWorldPos.x,
          centerY: mouseWorldPos.y,
          radius: pickerRadiusWorld,
          r: 100 / 255,
          g: 200 / 255,
          b: 255 / 255,
          alpha: 0.6,
        });

        // Target boid highlight
        if (targetBoidId) {
          const targetBoid = engine.boids.find((b) => b.id === targetBoidId);
          if (targetBoid) {
            circles.push({
              centerX: targetBoid.position.x,
              centerY: targetBoid.position.y,
              radius: 15, // Fixed world-space radius
              r: 100 / 255,
              g: 200 / 255,
              b: 255 / 255,
              alpha: 0.8,
            });
          }
        }
      }

      // Following mode: Show pulsing ring around followed boid
      if (camera.mode.type === "following") {
        const followedBoid = engine.boids.find(
          (b) =>
            b.id ===
            (camera.mode as { type: "following"; boidId: string }).boidId
        );
        if (followedBoid) {
          // Pulsing effect based on time
          // Use performance.now() for animation (not simulation time, so it doesn't pause)
          const pulseSpeed = 0.5; // Hz
          const time = performance.now() / 1000;
          const pulsePhase = time * pulseSpeed * Math.PI * 2;
          const pulseScale = 0.8 + Math.sin(pulsePhase) * 0.2; // 0.6 to 1.0
          const radius = 20 * pulseScale;
          const alpha = 0.5 + Math.sin(pulsePhase) * 0.3; // 0.2 to 0.8

          circles.push({
            centerX: followedBoid.position.x,
            centerY: followedBoid.position.y,
            radius,
            r: 255 / 255,
            g: 200 / 255,
            b: 100 / 255,
            alpha,
          });
        }
      }

      // Convert to typed arrays
      const count = circles.length;
      const centers = new Float32Array(count * 2);
      const radii = new Float32Array(count);
      const colors = new Float32Array(count * 3);
      const alphas = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const circle = circles[i];
        centers[i * 2] = circle.centerX;
        centers[i * 2 + 1] = circle.centerY;
        radii[i] = circle.radius;
        colors[i * 3] = circle.r;
        colors[i * 3 + 1] = circle.g;
        colors[i * 3 + 2] = circle.b;
        alphas[i] = circle.alpha;
      }

      return { centers, radii, colors, alphas, count };
    };

    // Prepare stance symbol data
    // Returns textured quads for each boid with a recent stance change
    const prepareStanceSymbolData = () => {
      const { ui } = runtimeStore.store.getState();
      const { visualSettings } = ui;

      // Check if stance symbols are enabled
      if (
        !visualSettings.stanceSymbolsEnabled ||
        !emojiAtlas ||
        !drawStanceSymbols
      ) {
        return null;
      }

      const boidPositions: number[] = [];
      const uvOffsets: number[] = [];
      const alphas: number[] = [];

      // Get current simulation frame from time resource
      const timeState = time.getState();

      for (const boid of engine.boids) {
        // Check if stance changed recently (matches Canvas 2D logic from pipeline.ts)
        const framesSinceChange =
          timeState.simulationFrame - boid.stanceEnteredAt;
        const DISPLAY_DURATION = 90; // Show for 90 frames (~3 seconds at 30 FPS)
        const FADE_START = 60; // Start fading at 60 frames (~2 seconds)

        if (framesSinceChange > DISPLAY_DURATION) {
          continue; // Don't show old stances
        }

        // Get emoji for this stance
        const stanceInfo = stanceSymbols[boid.stance];
        if (!stanceInfo) continue;

        const uvCoords = emojiAtlas.emojiUVMap.get(stanceInfo.emoji);
        if (!uvCoords) continue;

        // Calculate fade-out alpha
        let alpha = 1.0;
        if (framesSinceChange > FADE_START) {
          const fadeProgress =
            (framesSinceChange - FADE_START) / (DISPLAY_DURATION - FADE_START);
          alpha = 1.0 - fadeProgress;
        }

        // Add instance data
        boidPositions.push(boid.position.x, boid.position.y);
        uvOffsets.push(uvCoords.u, uvCoords.v);
        alphas.push(alpha);
      }

      if (boidPositions.length === 0) {
        return null;
      }

      return {
        boidPositions: new Float32Array(boidPositions),
        uvOffsets: new Float32Array(uvOffsets),
        alphas: new Float32Array(alphas),
        count: boidPositions.length / 2,
      };
    };

    const render = () => {
      // CRITICAL: Tell regl to update its internal state (canvas size, viewport, etc.)
      // This ensures WebGL viewport matches canvas dimensions
      regl.poll();

      // Get runtime state
      const { ui, simulation, config } = runtimeStore.store.getState();
      const { visualSettings } = ui;

      // Clear screen with atmosphere background color
      const bgColor = toRgb(config.world.backgroundColor);
      regl.clear({
        color: [bgColor[0] / 255, bgColor[1] / 255, bgColor[2] / 255, 1.0],
        depth: 1,
      });

      // Get camera transform (shared by all layers)
      const transform = camera.getTransformMatrix();

      // Render in correct order (matches Canvas 2D pipeline):
      // 1. Food sources (background)
      // 2. Trails (behind boids)
      // 3. Boids (foreground)
      //
      // IMPORTANT: Render order determines layering
      // First drawn = background, Last drawn = foreground
      // (This is the standard WebGL behavior with alpha blending and no depth testing)

      // Layer 1: Food sources (render first, behind everything)
      if (
        visualSettings.foodSourcesEnabled &&
        simulation.foodSources.length > 0
      ) {
        const visibleFood = simulation.foodSources.filter((food: FoodSource) =>
          camera.isInViewport(food.position.x, food.position.y, 50)
        );

        if (visibleFood.length > 0) {
          const foodData = prepareFoodData(visibleFood);
          drawFood({
            ...foodData,
            transform,
          });
        }
      }

      // Get visible boids (used by both trails and boid rendering)
      const visibleBoids = engine.boids.filter((boid) =>
        camera.isInViewport(boid.position.x, boid.position.y, 100)
      );

      // Layer 2: Trails (render FIRST so they appear behind boids)
      // Note: In WebGL without depth testing, draw order determines layering
      // First drawn = background, last drawn = foreground
      if (visualSettings.trailsEnabled && visibleBoids.length > 0) {
        const { config } = runtimeStore.store.getState();
        const trailBatches = collectTrailBatches(
          visibleBoids,
          config.world.width,
          config.world.height
        );

        // Draw each batch (one draw call per unique color/alpha combination)
        for (const batch of trailBatches) {
          if (batch.segments.length > 0) {
            const trailData = prepareTrailData(batch);
            drawTrails({
              ...trailData,
              transform,
            });
          }
        }
      }

      // Layer 3: Boids (render third, on top of trails)
      if (visibleBoids.length > 0) {
        // Use shape-based rendering if available, otherwise fall back to triangle
        if (drawShapeBoids) {
          const boidData = prepareShapeBoidData(visibleBoids);
          drawShapeBoids({
            ...boidData,
            transform,
          });
        } else {
          const boidData = prepareBoidData(visibleBoids);
          drawBoids({
            ...boidData,
            transform,
          });
        }
      }

      // Layer 3.5: Body Parts (render after boids, before energy bars)
      if (drawBodyParts && visibleBoids.length > 0) {
        const bodyPartsData = prepareBodyPartsData(visibleBoids);
        if (bodyPartsData && bodyPartsData.count > 0) {
          drawBodyParts({
            ...bodyPartsData,
            transform,
          });
        }
      }

      // Layer 4: Energy Bars (render fourth, on top of boids)
      if (visibleBoids.length > 0) {
        const { config } = runtimeStore.store.getState();
        const energyBarData = prepareEnergyBarData(
          visibleBoids,
          config.species
        );

        if (energyBarData.count > 0) {
          // Background then fill (triangle strips)
          // Note: Border removed - line loop with triangle strip vertices causes diagonal lines
          drawEnergyBars({ ...energyBarData, transform, layerType: 0 });
          drawEnergyBars({ ...energyBarData, transform, layerType: 1 });
        }
      }

      // Layer 5: Health Bars (render fifth, above energy bars)
      if (visibleBoids.length > 0) {
        const healthBarData = prepareHealthBarData(visibleBoids);

        if (healthBarData.count > 0) {
          // Background then fill (triangle strips)
          // Note: Border removed - line loop with triangle strip vertices causes diagonal lines
          drawHealthBars({ ...healthBarData, transform, layerType: 0 });
          drawHealthBars({ ...healthBarData, transform, layerType: 1 });
        }
      }

      // Layer 6: Stance Symbols (render sixth, above health bars)
      // Shows emoji indicators for recent stance changes
      if (drawStanceSymbols) {
        const stanceSymbolData = prepareStanceSymbolData();
        if (stanceSymbolData && stanceSymbolData.count > 0) {
          drawStanceSymbols({
            ...stanceSymbolData,
            transform,
          });
        }
      }

      // Layer 7: Selection Overlay (render last, on top of everything)
      // Shows picker circle, target highlight, and followed boid ring
      const selectionData = prepareSelectionData();
      if (selectionData.count > 0) {
        drawSelectionCircles({
          ...selectionData,
          transform,
        });
      }

      // Layer 8: Stats Overlay (screen-space text)
      // Render stats in top-left corner (matches Canvas 2D)
      if (drawText && fontAtlas) {
        const { config } = runtimeStore.store.getState();

        // Calculate stats
        const predatorCount = engine.boids.filter((b) => {
          const speciesConfig = config.species[b.typeId];
          return speciesConfig && speciesConfig.role === "predator";
        }).length;
        const preyCount = engine.boids.length - predatorCount;

        // Get FPS from profiler or estimate
        const fps = 60; // TODO: Get actual FPS

        // Layout parameters (matches Canvas 2D)
        const isSmallScreen = webglCanvas.width < 600;
        const lineHeight = isSmallScreen ? 16 : 20;
        const startingX = isSmallScreen ? 10 : 25;
        const startingY = isSmallScreen ? 20 : 33;

        // Green color for most text
        const greenColor = [0, 1, 0.533]; // #00ff88
        const redColor = [1, 0, 0]; // #ff0000

        // Render each line of stats
        const lines = [
          { text: `FPS: ${Math.round(fps)}`, color: greenColor },
          { text: `Total: ${engine.boids.length}`, color: greenColor },
          { text: `Prey: ${preyCount}`, color: greenColor },
          { text: `Predators: ${predatorCount}`, color: redColor },
        ];

        lines.forEach((line, index) => {
          const textData = layoutText(
            line.text,
            startingX,
            startingY + lineHeight * index,
            line.color[0],
            line.color[1],
            line.color[2],
            1.0
          );

          if (textData && textData.count > 0) {
            drawText({
              ...textData,
              resolution: [webglCanvas.width, webglCanvas.height],
            });
          }
        });
      }
    };

    const resize = (width: number, height: number) => {
      // Update WebGL canvas size to match main canvas
      webglCanvas.width = width;
      webglCanvas.height = height;

      // Update regl's internal state after resize
      regl.poll();
    };

    const cleanup = () => {
      // Remove event listeners
      webglCanvas.removeEventListener("wheel", handleWheel);
      webglCanvas.removeEventListener("click", handleClick);
      webglCanvas.removeEventListener("mousemove", handleMouseMove);
      webglCanvas.removeEventListener("mouseenter", handleMouseEnter);
      webglCanvas.removeEventListener("mouseleave", handleMouseLeave);
    };

    return {
      render,
      resize,
      canvas: webglCanvas, // Expose canvas for mounting
      cleanup, // Expose cleanup for halt
    } satisfies WebGLRenderer & {
      canvas: HTMLCanvasElement;
      cleanup: () => void;
    };
  },
  halt: (
    resource: WebGLRenderer & {
      canvas?: HTMLCanvasElement;
      cleanup?: () => void;
    }
  ) => {
    // Clean up event listeners
    if (resource.cleanup) {
      resource.cleanup();
    }

    // Remove WebGL canvas from DOM
    if (resource.canvas?.parentNode) {
      resource.canvas.remove();
    }
  },
});
