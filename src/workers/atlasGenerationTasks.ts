/**
 * Atlas Generation Worker Tasks
 *
 * Worker tasks for generating texture atlases off the main thread.
 *
 * Strategy: Start with simple ImageData transfer, then explore OffscreenCanvas.
 *
 * Phase 1: ImageData Transfer (Simple)
 * - Generate atlas in worker using standard Canvas/OffscreenCanvas
 * - Extract ImageData (Uint8ClampedArray)
 * - Transfer back to main thread
 * - Reconstruct canvas on main thread
 *
 * Phase 2: OffscreenCanvas Transfer (Advanced - Future)
 * - Main thread calls canvas.transferControlToOffscreen()
 * - Transfer OffscreenCanvas to worker
 * - Worker owns canvas, renders directly
 * - Transfer back via ImageBitmap or Blob
 */

import { z } from "zod";
import { defineTask } from "@/lib/workerTasks/core";
import { createWorkerSystemConfig } from "@/lib/workerTasks/worker";
import { createWorkerClientResource } from "@/lib/workerTasks/client";

// ============================================
// Zod Schemas for Atlas Generation
// ============================================

/**
 * UV coordinate entry schema
 */
const uvEntrySchema = z.object({
  key: z.string(),
  u: z.number(),
  v: z.number(),
  width: z.number().optional(), // For font atlas character metrics
});

/**
 * Image data schema (for transfer back to main thread)
 * Note: Uint8ClampedArray will be transferred, reconstructed into canvas
 */
const imageDataSchema = z.object({
  data: z.instanceof(Uint8ClampedArray),
  width: z.number(),
  height: z.number(),
});

/**
 * Atlas result schema (what workers return)
 */
const atlasResultSchema = z.object({
  imageData: imageDataSchema,
  uvEntries: z.array(uvEntrySchema),
  gridSize: z.number(),
  cellSize: z.number(), // UV size of each cell (1.0 / gridSize)
});

/**
 * Progress stage schema
 */
const progressSchema = z.object({
  stage: z.string(),
  current: z.number(),
  total: z.number(),
});

// ============================================
// Task Definitions
// ============================================

export const atlasGenerationTasks = {
  /**
   * Generate Font Atlas
   *
   * Creates a bitmap font texture atlas for text rendering.
   * Each character is rendered to a grid cell with UV coordinates and width metrics.
   */
  generateFontAtlas: defineTask({
    input: z.object({
      fontFamily: z.string(),
      fontSize: z.number(),
      chars: z.string(),
    }),
    output: atlasResultSchema.extend({
      charSize: z.number(), // Pixel size of each character cell
      fontSize: z.number(),
    }),
    progress: progressSchema,
    parseIO: false,
    execute: async (input, { reportProgress }) => {
      console.log("Executing generateFontAtlas task");
      await reportProgress({
        stage: "setup",
        current: 0,
        total: 3,
      });

      const { fontFamily, fontSize, chars } = input;
      const charSize = fontSize * 1.5; // Extra padding for descenders/ascenders
      const uniqueChars = Array.from(new Set(chars));

      // Calculate atlas dimensions (square grid)
      const gridSize = Math.ceil(Math.sqrt(uniqueChars.length));
      const atlasSize = gridSize * charSize;

      await reportProgress({
        stage: "creating_canvas",
        current: 1,
        total: 3,
      });

      // Create canvas (OffscreenCanvas if available, fallback to regular)
      let canvas: OffscreenCanvas | HTMLCanvasElement;
      let ctx:
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null;

      if (typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(atlasSize, atlasSize);
        ctx = canvas.getContext("2d");
      } else {
        // Fallback for older browsers (workers can create regular canvas in some environments)
        canvas = document.createElement("canvas");
        canvas.width = atlasSize;
        canvas.height = atlasSize;
        ctx = canvas.getContext("2d");
      }

      if (!ctx) {
        throw new Error("Failed to create canvas context in worker");
      }

      // Clear to transparent
      ctx.clearRect(0, 0, atlasSize, atlasSize);

      // Set font properties
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white"; // White text, we'll colorize in shader

      await reportProgress({
        stage: "rendering",
        current: 2,
        total: 3,
      });

      // Render each character and collect UV data
      const uvEntries: Array<{
        key: string;
        u: number;
        v: number;
        width: number;
      }> = [];

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
        uvEntries.push({
          key: char,
          u: col / gridSize,
          v: row / gridSize,
          width: charWidth,
        });
      });

      await reportProgress({
        stage: "extracting_data",
        current: 3,
        total: 3,
      });

      // Extract image data for transfer
      const imageData = ctx.getImageData(0, 0, atlasSize, atlasSize);

      // Return atlas data (ImageData will be transferred)
      return {
        imageData: {
          data: imageData.data,
          width: imageData.width,
          height: imageData.height,
        },
        uvEntries,
        gridSize,
        cellSize: 1.0 / gridSize,
        charSize,
        fontSize,
      };
    },
  }),

  /**
   * Generate Font Atlas with OffscreenCanvas
   *
   * Phase 2: Direct canvas transfer approach.
   * Main thread creates canvas and transfers control to worker.
   * Worker renders directly, returns as ImageBitmap for zero-copy transfer.
   */
  generateFontAtlasOffscreen: defineTask({
    input: z.object({
      offscreenCanvas: z.instanceof(OffscreenCanvas),
      fontFamily: z.string(),
      fontSize: z.number(),
      chars: z.string(),
      gridSize: z.number(),
      atlasSize: z.number(),
      charSize: z.number(),
    }),
    output: z.object({
      imageBitmap: z.instanceof(ImageBitmap),
      uvEntries: z.array(uvEntrySchema),
      gridSize: z.number(),
      cellSize: z.number(),
      charSize: z.number(),
      fontSize: z.number(),
    }),
    progress: progressSchema,
    parseIO: false, // Can't serialize OffscreenCanvas/ImageBitmap through Zod
    execute: async (input, { reportProgress }) => {
      console.log("Executing generateFontAtlasOffscreen task");
      await reportProgress({
        stage: "setup",
        current: 0,
        total: 3,
      });

      const { offscreenCanvas, fontFamily, fontSize, chars, gridSize, charSize } =
        input;

      // Get context from the transferred OffscreenCanvas
      const ctx = offscreenCanvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get OffscreenCanvas context in worker");
      }

      const uniqueChars = Array.from(new Set(chars));
      const atlasSize = offscreenCanvas.width;

      await reportProgress({
        stage: "rendering",
        current: 1,
        total: 3,
      });

      // Clear to transparent
      ctx.clearRect(0, 0, atlasSize, atlasSize);

      // Set font properties
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";

      // Render each character and collect UV data
      const uvEntries: Array<{
        key: string;
        u: number;
        v: number;
        width: number;
      }> = [];

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
        uvEntries.push({
          key: char,
          u: col / gridSize,
          v: row / gridSize,
          width: charWidth,
        });
      });

      await reportProgress({
        stage: "creating_bitmap",
        current: 2,
        total: 3,
      });

      // Convert to ImageBitmap for efficient transfer back
      const imageBitmap = offscreenCanvas.transferToImageBitmap();

      await reportProgress({
        stage: "complete",
        current: 3,
        total: 3,
      });

      // Return ImageBitmap (transferable!) + metadata
      return {
        imageBitmap,
        uvEntries,
        gridSize,
        cellSize: 1.0 / gridSize,
        charSize,
        fontSize,
      };
    },
  }),

  /**
   * Generate Shape Atlas
   *
   * TODO: Implement shape atlas generation in worker
   */
  // generateShapeAtlas: defineTask({ ... }),

  /**
   * Generate Emoji Atlas
   *
   * TODO: Implement emoji atlas generation in worker
   */
  // generateEmojiAtlas: defineTask({ ... }),

  /**
   * Generate Body Parts Atlas
   *
   * Heavy computation with Voronoi tessellation for shell (~100ms+).
   * This is where workers should truly shine!
   */
  generateBodyPartsAtlas: defineTask({
    input: z.object({
      // No input needed - uses default body parts
    }),
    output: atlasResultSchema,
    progress: progressSchema,
    parseIO: false,
    execute: async (_input, { reportProgress }) => {
      console.log("Executing generateBodyPartsAtlas task");
      
      // Import Voronoi functions (they're pure - perfect for workers!)
      const { generateRingSeeds, lloydRelaxation, drawVoronoi } = await import(
        "@/lib/voronoi"
      );
      
      // Import body part keywords
      const { bodyPartKeywords } = await import(
        "@/boids/vocabulary/keywords"
      );

      const parts = [
        bodyPartKeywords.eye,
        bodyPartKeywords.fin,
        bodyPartKeywords.spike,
        bodyPartKeywords.tail,
        bodyPartKeywords.antenna,
        bodyPartKeywords.glow,
        bodyPartKeywords.shell,
      ];

      await reportProgress({
        stage: "setup",
        current: 0,
        total: parts.length,
      });

      const cellSize = 256;
      const gridSize = Math.ceil(Math.sqrt(parts.length));
      const atlasSize = gridSize * cellSize;

      // Create OffscreenCanvas
      let canvas: OffscreenCanvas | HTMLCanvasElement;
      let ctx:
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null;

      if (typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(atlasSize, atlasSize);
        ctx = canvas.getContext("2d");
      } else {
        // Fallback (shouldn't happen in worker, but just in case)
        canvas = document.createElement("canvas");
        canvas.width = atlasSize;
        canvas.height = atlasSize;
        ctx = canvas.getContext("2d");
      }

      if (!ctx) {
        throw new Error("Failed to create canvas context in worker");
      }

      // Clear to transparent
      ctx.clearRect(0, 0, atlasSize, atlasSize);

      const uvEntries: Array<{ key: string; u: number; v: number }> = [];

      // Render each part
      for (let index = 0; index < parts.length; index++) {
        const partName = parts[index];
        await reportProgress({
          stage: `rendering_${partName}`,
          current: index + 1,
          total: parts.length,
        });

        const col = index % gridSize;
        const row = Math.floor(index / gridSize);
        const cellX = col * cellSize;
        const cellY = row * cellSize;
        const centerX = cellX + cellSize / 2;
        const centerY = cellY + cellSize / 2;

        const normalizedSize = cellSize * 0.8;

        // Save context and translate to cell center
        ctx.save();
        ctx.translate(centerX, centerY);

        // Default styles
        ctx.fillStyle = "white";
        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";

        // Render the part based on type
        if (partName === bodyPartKeywords.eye) {
          // Multi-color eye
          const eyeRadius = normalizedSize * 0.35;
          const irisRadius = eyeRadius * 0.65;
          const pupilRadius = eyeRadius * 0.4;

          ctx.fillStyle = "rgb(255, 0, 0)";
          ctx.beginPath();
          ctx.arc(0, 0, eyeRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgb(0, 255, 0)";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, irisRadius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = "rgb(0, 0, 255)";
          ctx.beginPath();
          ctx.arc(0, 0, pupilRadius, 0, Math.PI * 2);
          ctx.fill();
        } else if (partName === bodyPartKeywords.fin) {
          // Angular fin pointing right
          ctx.fillStyle = "white";
          const finLength = normalizedSize * 0.45;
          const finWidth = normalizedSize * 0.25;

          ctx.beginPath();
          ctx.moveTo(-finLength * 0.3, -finWidth);
          ctx.lineTo(finLength, 0);
          ctx.lineTo(-finLength * 0.3, finWidth);
          ctx.lineTo(-finLength * 0.15, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (partName === bodyPartKeywords.spike) {
          // Spike pointing right
          ctx.strokeStyle = "white";
          ctx.lineWidth = 4;
          ctx.lineCap = "round";

          const spikeLength = normalizedSize * 0.45;
          ctx.beginPath();
          ctx.moveTo(-spikeLength * 0.1, 0);
          ctx.lineTo(spikeLength, 0);
          ctx.stroke();

          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(-spikeLength * 0.1, 0);
          ctx.lineTo(spikeLength * 0.2, 0);
          ctx.stroke();
        } else if (partName === bodyPartKeywords.tail) {
          // V-shape tail pointing right
          ctx.fillStyle = "white";
          const tailLength = normalizedSize * 0.45;
          const tailHeight = normalizedSize * 0.3;

          ctx.beginPath();
          ctx.moveTo(-tailLength * 0.3, 0);
          ctx.lineTo(tailLength, -tailHeight);
          ctx.lineTo(tailLength * 0.8, 0);
          ctx.lineTo(tailLength, tailHeight);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (partName === bodyPartKeywords.antenna) {
          // Vertical antenna
          const antennaLength = normalizedSize * 0.45;

          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -antennaLength);
          ctx.lineTo(0, antennaLength);
          ctx.stroke();

          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(0, -antennaLength, normalizedSize * 0.1, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(0, antennaLength, normalizedSize * 0.04, 0, Math.PI * 2);
          ctx.fill();
        } else if (partName === bodyPartKeywords.glow) {
          // Glow effect
          ctx.strokeStyle = "white";
          ctx.lineWidth = 2;

          const glowRadius = normalizedSize * 0.15;
          for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, glowRadius * i, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(0, 0, glowRadius * 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (partName === bodyPartKeywords.shell) {
          // Shell with Voronoi tessellation (THE HEAVY ONE!)
          const radius = normalizedSize * 0.4;
          const ellipseRatio = 1.15;

          // Generate seeds
          let seeds = generateRingSeeds(radius, [5, 9], true);

          // Lloyd relaxation (3 iterations - this is the heavy part!)
          const relaxationSampleSize = Math.floor(radius * 2);
          for (let i = 0; i < 3; i++) {
            seeds = lloydRelaxation(seeds, radius, relaxationSampleSize);
          }

          // Draw Voronoi
          const voronoiSize = Math.floor(normalizedSize * 2);
          drawVoronoi(ctx as CanvasRenderingContext2D, voronoiSize, {
            seeds,
            radius: radius,
            ellipseRatio,
            edgeThickness:
              normalizedSize * 3 * (voronoiSize / (normalizedSize * 2)),
            borderColor: "rgb(255, 0, 0)",
            cellFillColor: "rgb(0, 255, 0)",
            edgeColor: "rgb(0, 0, 255)",
          });
        } else {
          // Fallback: small circle
          ctx.beginPath();
          ctx.arc(0, 0, normalizedSize * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Store UV coordinates
        uvEntries.push({
          key: partName,
          u: col / gridSize,
          v: row / gridSize,
        });
      }

      // Extract ImageData
      const imageData = ctx.getImageData(0, 0, atlasSize, atlasSize);

      return {
        imageData: {
          data: imageData.data,
          width: imageData.width,
          height: imageData.height,
        },
        uvEntries,
        gridSize,
        cellSize: 1.0 / gridSize,
      };
    },
  }),
};

// ============================================
// Create Worker System Config (for worker script)
// ============================================

export const workerSystemConfig =
  createWorkerSystemConfig(atlasGenerationTasks);

// ============================================
// Create Client Resource (for main thread)
// ============================================

export const atlasGenerationClientResource = createWorkerClientResource(
  () => import("@/workers/atlasGenerationWorker?worker"),
  atlasGenerationTasks
);
