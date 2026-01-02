/**
 * WebGL Renderer - Main Entry Point
 *
 * NOTE: This file is being modularized! See src/resources/webgl/ for the new architecture.
 * The modular components are available in:
 * - webgl/atlases/ - Texture atlas generation
 * - webgl/drawCommands/ - REGL draw commands
 * - webgl/dataPreparation/ - Instance data preparation
 * - webgl/utils/ - Shared utilities
 *
 * This file currently contains the full implementation for backward compatibility.
 * Future work: Gradually migrate to use the modular components.
 */

import { defineResource } from "braided";
import REGL from "regl";
import type { Boid, FoodSource } from "../boids/vocabulary/schemas/entities";
import type { BoidEngine } from "./engine";
import type { CameraAPI } from "./camera";
import type { CanvasAPI } from "./canvas";
import type { RuntimeStoreResource } from "./runtimeStore";
import type { AtlasesResult } from "./atlases";
import { toRgb } from "../lib/colors";

// Import modular WebGL components
import {
  // Atlas texture creation (atlases themselves come from resource)
  createEmojiTexture,
  createFontTexture,
  createShapeTexture,
  logShapeAtlasDebugInfo,
  createBodyPartsTexture,
  logBodyPartsAtlasDebugInfo,
  // Data Preparation
  prepareShapeBoidData as prepareShapeBoidDataModular,
  prepareBodyPartsData as prepareBodyPartsDataModular,
  prepareTriangleBoidData,
  prepareFoodData,
  prepareTrailData,
  collectTrailBatches,
  prepareEnergyBarData,
  prepareHealthBarData,
  prepareSelectionData,
  prepareStanceSymbolData,
  layoutText,
  // Draw Commands
  createShapeBoidsDrawCommand,
  createBodyPartsDrawCommand,
  createTriangleBoidsDrawCommand,
  createFoodDrawCommand,
  createTrailsDrawCommand,
  createEnergyBarsDrawCommand,
  createHealthBarsDrawCommand,
  createSelectionCirclesDrawCommand,
  createStanceSymbolsDrawCommand,
  createTextDrawCommand,
  createDebugCollisionCirclesDrawCommand,
  prepareDebugCollisionCirclesData,
  // Event Handlers
  attachEventHandlers,
} from "./webgl";

// Shaders are now imported in the modular draw command modules

export type WebGLRenderer = {
  render: () => void;
  resize: (width: number, height: number) => void;
};

export const webglRenderer = defineResource({
  dependencies: {
    required: ["canvas", "engine", "camera", "runtimeStore", "time", "atlases"],
    optional: [],
  },
  start: ({
    canvas,
    engine,
    camera,
    runtimeStore,
    time,
    atlases,
  }: {
    canvas: CanvasAPI;
    engine: BoidEngine;
    camera: CameraAPI;
    runtimeStore: RuntimeStoreResource;
    time: { getState: () => { simulationFrame: number } };
    atlases: AtlasesResult;
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
      "translate-y-[-50%]",
    );
    webglCanvas.style.display = "none"; // Hidden by default (Canvas renderer is default)

    // Attach all event handlers (zoom, picker, click, etc.) using modular component
    const eventHandlerCleanup = attachEventHandlers(
      webglCanvas,
      camera,
      engine,
    );

    // Initialize regl
    // Session 101: Disable premultipliedAlpha for proper color rendering
    // Our blend function expects non-premultiplied alpha (standard blending)
    const regl = REGL({
      canvas: webglCanvas,
      extensions: ["ANGLE_instanced_arrays"],
      attributes: {
        alpha: true,
        premultipliedAlpha: false, // Match blend function expectations
      },
    });

    // ============================================
    // ATLASES - Use pre-generated atlases from resource
    // ============================================
    // Session 105: Atlases are now generated once by the atlases resource
    // and reused across the entire app (no more redundant generation!)
    
    const emojiAtlas = atlases.emoji;
    if (!emojiAtlas) {
      console.error("Failed to get emoji atlas from resource");
    }
    const emojiTexture = emojiAtlas
      ? createEmojiTexture(regl, emojiAtlas)
      : null;

    const fontAtlas = atlases.font;
    if (!fontAtlas) {
      console.error("Failed to get font atlas from resource");
    }
    const fontTexture = fontAtlas ? createFontTexture(regl, fontAtlas) : null;

    const shapeAtlas = atlases.shapes;
    if (!shapeAtlas) {
      console.error("Failed to get shape atlas from resource");
    } else {
      logShapeAtlasDebugInfo(shapeAtlas);
    }
    const shapeTexture = shapeAtlas
      ? createShapeTexture(regl, shapeAtlas)
      : null;

    const bodyPartsAtlas = atlases.bodyParts;
    if (!bodyPartsAtlas) {
      console.error("Failed to get body parts atlas from resource");
    } else {
      logBodyPartsAtlasDebugInfo(bodyPartsAtlas);
    }
    const bodyPartsTexture = bodyPartsAtlas
      ? createBodyPartsTexture(regl, bodyPartsAtlas)
      : null;

    // ============================================
    // DRAW COMMANDS (using modular components)
    // ============================================

    // Create draw command for shape-based boids
    const drawShapeBoids =
      shapeTexture && shapeAtlas
        ? createShapeBoidsDrawCommand(regl, shapeTexture, shapeAtlas)
        : null;

    // Create draw command for body parts
    const drawBodyParts =
      bodyPartsTexture && bodyPartsAtlas
        ? createBodyPartsDrawCommand(regl, bodyPartsTexture, bodyPartsAtlas)
        : null;

    // Create draw command for triangle-based boids (fallback)
    const drawBoids = createTriangleBoidsDrawCommand(regl);

    // Create draw command for food sources
    const drawFood = createFoodDrawCommand(regl);

    // Prepare triangle boid data for GPU (using modular component)
    const prepareBoidData = prepareTriangleBoidData;

    // Prepare shape-based boid data for GPU (using modular component)
    const prepareShapeBoidData = (boids: Boid[]) => {
      const { config } = runtimeStore.store.getState();
      return prepareShapeBoidDataModular(boids, config.species, shapeAtlas);
    };

    // Prepare body parts data for GPU (using modular component)
    const prepareBodyPartsData = (boids: Boid[]) => {
      const { config } = runtimeStore.store.getState();
      return prepareBodyPartsDataModular(boids, config.species, bodyPartsAtlas);
    };

    // Create draw command for trails
    const drawTrails = createTrailsDrawCommand(regl);

    // Create draw command for energy bars
    const drawEnergyBars = createEnergyBarsDrawCommand(regl);

    // Create draw command for health bars
    const drawHealthBars = createHealthBarsDrawCommand(regl);

    // Create draw command for selection circles (picker + followed boid)
    const drawSelectionCircles = createSelectionCirclesDrawCommand(regl);

    // Create draw command for stance symbols (textured quads)
    const drawStanceSymbols =
      emojiTexture && emojiAtlas
        ? createStanceSymbolsDrawCommand(
            regl,
            emojiTexture,
            emojiAtlas.cellSize,
          )
        : null;

    // Create draw command for text rendering
    const drawText =
      fontTexture && fontAtlas
        ? createTextDrawCommand(regl, fontTexture, fontAtlas.cellSize)
        : null;

    // Create draw command for debug collision circles (Session 96)
    const drawDebugCollisionCircles =
      createDebugCollisionCirclesDrawCommand(regl);

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
          camera.isInViewport(food.position.x, food.position.y, 50),
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
        camera.isInViewport(boid.position.x, boid.position.y, 100),
      );

      // Layer 2: Trails (render FIRST so they appear behind boids)
      // Note: In WebGL without depth testing, draw order determines layering
      // First drawn = background, last drawn = foreground
      if (visualSettings.trailsEnabled && visibleBoids.length > 0) {
        const { config } = runtimeStore.store.getState();
        const trailBatches = collectTrailBatches(
          visibleBoids,
          config.species,
          config.world.width,
          config.world.height,
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

      // DEBUG Layer: Collision radius circles (Session 96)
      // Visual verification that rendered size matches physics collision
      if (visibleBoids.length > 0) {
        const collisionData = prepareDebugCollisionCirclesData(visibleBoids);
        drawDebugCollisionCircles({
          ...collisionData,
          transform,
        });
      }

      // Layer 4: Energy Bars (render fourth, on top of boids)
      if (visibleBoids.length > 0) {
        const { config, ui } = runtimeStore.store.getState();
        const energyBarData = prepareEnergyBarData(
          visibleBoids,
          config.species,
          ui.visualSettings.energyBarsEnabled,
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
        const { ui } = runtimeStore.store.getState();
        const healthBarData = prepareHealthBarData(
          visibleBoids,
          ui.visualSettings.healthBarsEnabled,
        );

        if (healthBarData.count > 0) {
          // Background then fill (triangle strips)
          // Note: Border removed - line loop with triangle strip vertices causes diagonal lines
          drawHealthBars({ ...healthBarData, transform, layerType: 0 });
          drawHealthBars({ ...healthBarData, transform, layerType: 1 });
        }
      }

      // Layer 6: Stance Symbols (render sixth, above health bars)
      // Shows emoji indicators for recent stance changes
      if (drawStanceSymbols && emojiAtlas) {
        const { ui } = runtimeStore.store.getState();
        const timeState = time.getState();
        const stanceSymbolData = prepareStanceSymbolData(
          engine.boids,
          emojiAtlas,
          timeState.simulationFrame,
          ui.visualSettings.stanceSymbolsEnabled,
        );
        if (stanceSymbolData && stanceSymbolData.count > 0) {
          drawStanceSymbols({
            ...stanceSymbolData,
            transform,
          });
        }
      }

      // Layer 7: Selection Overlay (render last, on top of everything)
      // Shows picker circle, target highlight, and followed boid ring
      const selectionData = prepareSelectionData(camera, engine.boids);
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
          if (!fontAtlas) return;
          const textData = layoutText(
            line.text,
            startingX,
            startingY + lineHeight * index,
            line.color[0],
            line.color[1],
            line.color[2],
            1.0,
            fontAtlas,
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
      // Remove event listeners using cleanup function from attachEventHandlers
      eventHandlerCleanup();
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
    },
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
