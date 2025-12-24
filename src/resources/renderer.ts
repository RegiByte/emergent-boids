import { defineResource } from "braided";
import { eventKeywords } from "../boids/vocabulary/keywords";
import { CanvasAPI } from "./canvas";
import { BoidEngine } from "./engine";
import type { RuntimeController } from "./runtimeController";
import type { RuntimeStoreResource } from "./runtimeStore";
import type { Profiler } from "./profiler";
import { renderFrame, type RenderContext } from "./rendering/pipeline";

export type Renderer = {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
};

export const renderer = defineResource({
  dependencies: {
    required: ["canvas", "engine", "runtimeStore", "runtimeController"],
    optional: ["profiler"],
  },
  start: ({
    canvas,
    engine,
    runtimeStore,
    runtimeController,
    profiler,
  }: {
    canvas: CanvasAPI;
    engine: BoidEngine;
    runtimeStore: RuntimeStoreResource;
    runtimeController: RuntimeController;
    profiler: Profiler | undefined;
  }) => {
    let animationId: number | null = null;
    let isRunning = false;
    let lastFrameTime = performance.now();
    let fps = 60;

    // Fixed timestep configuration
    const FIXED_UPDATE_RATE = 60; // Updates per second (60 UPS)
    const FIXED_TIMESTEP = 1 / FIXED_UPDATE_RATE; // 0.01667 seconds (16.67ms)
    const MAX_ACCUMULATED_TIME = FIXED_TIMESTEP * 5; // Prevent spiral of death
    let accumulator = 0;

    // Keyboard shortcuts for visual toggles
    const handleKeyPress = (e: KeyboardEvent) => {
      const { ui } = runtimeStore.store.getState();
      const currentSettings = ui.visualSettings;

      switch (e.key.toLowerCase()) {
        case "t":
          // Toggle trails
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                trailsEnabled: !currentSettings.trailsEnabled,
              },
            },
          });
          console.log("Trails:", !currentSettings.trailsEnabled);
          break;
        case "e":
          // Toggle energy bars
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                energyBarsEnabled: !currentSettings.energyBarsEnabled,
              },
            },
          });
          console.log("Energy bars:", !currentSettings.energyBarsEnabled);
          break;
        case "h":
          // Toggle mating hearts
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                matingHeartsEnabled: !currentSettings.matingHeartsEnabled,
              },
            },
          });
          console.log("Mating hearts:", !currentSettings.matingHeartsEnabled);
          break;
        case "s":
          // Toggle stance symbols
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                stanceSymbolsEnabled: !currentSettings.stanceSymbolsEnabled,
              },
            },
          });
          console.log("Stance symbols:", !currentSettings.stanceSymbolsEnabled);
          break;
        case "d":
          // Toggle death markers
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                deathMarkersEnabled: !currentSettings.deathMarkersEnabled,
              },
            },
          });
          console.log("Death markers:", !currentSettings.deathMarkersEnabled);
          break;
        case "f":
          // Toggle food sources
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                foodSourcesEnabled: !currentSettings.foodSourcesEnabled,
              },
            },
          });
          console.log("Food sources:", !currentSettings.foodSourcesEnabled);
          break;
        case " ":
          // Toggle pause (space bar)
          e.preventDefault();
          if (isRunning) {
            stop();
            console.log("Paused");
          } else {
            start();
            console.log("Resumed");
          }
          break;
        case "p":
          // Toggle profiler
          if (profiler?.isEnabled()) {
            profiler.printSummary();
            profiler.disable();
          } else {
            profiler?.reset();
            profiler?.enable();
          }
          break;
        case "r":
          // Reset profiler metrics
          if (profiler?.isEnabled()) {
            profiler.reset();
            console.log("Profiler metrics reset");
          }
          break;
        case "/":
        case "k":
          // Show help (/ or k)
          console.log(`
╔════════════════════════════════════════╗
║     EMERGENT BOIDS - KEYBOARD HELP     ║
╠════════════════════════════════════════╣
║ T - Toggle motion trails               ║
║ E - Toggle energy bars (prey)          ║
║ H - Toggle mating hearts               ║
║ S - Toggle stance symbols              ║
║ D - Toggle death markers               ║
║ F - Toggle food sources                ║
║ Space - Pause/Resume simulation        ║
║ P - Toggle performance profiler        ║
║ R - Reset profiler metrics             ║
║ K or / - Show this help                ║
╚════════════════════════════════════════╝
          `);
          break;
      }
    };

    // Register keyboard listener
    document.addEventListener("keydown", handleKeyPress);

    const draw = () => {
      const { ctx, width, height } = canvas;
      const { simulation, ui, config } = runtimeStore.store.getState();

      // Get atmosphere settings (active event overrides base)
      const { base, activeEvent } = ui.visualSettings.atmosphere;
      const atmosphereSettings = activeEvent?.settings || base;

      // Build render context
      const renderContext: RenderContext = {
        ctx,
        width,
        height,
        boids: engine.boids,
        obstacles: simulation.obstacles,
        deathMarkers: simulation.deathMarkers,
        foodSources: simulation.foodSources,
        speciesConfigs: config.species,
        visualSettings: {
          trailsEnabled: ui.visualSettings.trailsEnabled,
          energyBarsEnabled: ui.visualSettings.energyBarsEnabled,
          matingHeartsEnabled: ui.visualSettings.matingHeartsEnabled,
          stanceSymbolsEnabled: ui.visualSettings.stanceSymbolsEnabled,
          deathMarkersEnabled: ui.visualSettings.deathMarkersEnabled,
          foodSourcesEnabled: ui.visualSettings.foodSourcesEnabled,
          atmosphere: {
            trailAlpha: atmosphereSettings.trailAlpha,
          },
        },
        profiler,
      };

      // Execute rendering pipeline
      renderFrame(renderContext, fps, simulation.obstacles.length);
    };

    const animate = () => {
      profiler?.start("frame.total");

      // Calculate frame time
      const currentTime = performance.now();
      const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
      lastFrameTime = currentTime;

      // Smooth FPS calculation (exponential moving average) - for display only
      fps = fps * 0.9 + (1 / deltaTime) * 0.1;

      // Add frame time to accumulator
      accumulator += deltaTime;

      // Clamp accumulator to prevent spiral of death (if simulation can't keep up)
      if (accumulator > MAX_ACCUMULATED_TIME) {
        accumulator = MAX_ACCUMULATED_TIME;
      }

      // Update simulation at fixed rate (may run 0, 1, or multiple times per frame)
      profiler?.start("frame.update");
      while (accumulator >= FIXED_TIMESTEP) {
        engine.update(FIXED_TIMESTEP); // Always pass fixed 16.67ms timestep
        accumulator -= FIXED_TIMESTEP;
      }
      profiler?.end("frame.update");

      // Check for catches after all updates (once per render frame)
      profiler?.start("frame.catches");
      const catches = engine.checkCatches();
      for (const catchEvent of catches) {
        runtimeController.dispatch({
          type: eventKeywords.boids.caught,
          predatorId: catchEvent.predatorId,
          preyId: catchEvent.preyId,
          preyTypeId: catchEvent.preyTypeId, // Include prey type for death tracking
          preyEnergy: catchEvent.preyEnergy,
          preyPosition: catchEvent.preyPosition,
        });
      }
      profiler?.end("frame.catches");

      // Render at display rate (always once per frame)
      profiler?.start("frame.render");
      draw();
      profiler?.end("frame.render");

      profiler?.end("frame.total");

      // Record frame metrics
      const metrics = profiler?.getMetrics() || [];
      const frameTime =
        metrics.find((m) => m.name === "frame.total")?.lastTime || 0;
      const updateTime =
        metrics.find((m) => m.name === "frame.update")?.lastTime || 0;
      const renderTime =
        metrics.find((m) => m.name === "frame.render")?.lastTime || 0;
      profiler?.recordFrame(frameTime, fps, updateTime, renderTime);

      animationId = requestAnimationFrame(animate);
    };

    const start = () => {
      if (!isRunning) {
        isRunning = true;
        animate();
      }
    };

    const stop = () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      isRunning = false;
    };

    const cleanup = () => {
      document.removeEventListener("keydown", handleKeyPress);
    };

    return { start, stop, isRunning, cleanup } satisfies Renderer & {
      cleanup: () => void;
    };
  },
  halt: (renderer: Renderer & { cleanup?: () => void }) => {
    renderer.stop();
    if (renderer.cleanup) {
      renderer.cleanup();
    }
  },
});
