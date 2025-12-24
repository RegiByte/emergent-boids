import { defineResource } from "braided";
import { eventKeywords } from "../boids/vocabulary/keywords";
import { CanvasAPI } from "./canvas";
import { BoidEngine } from "./engine";
import type { RuntimeController } from "./runtimeController";
import type { RuntimeStoreResource } from "./runtimeStore";
import type { Profiler } from "./profiler";
import type { TimeResource } from "./time";
import { renderFrame, type RenderContext } from "./rendering/pipeline";
import { CameraAPI } from "./camera";

export type Renderer = {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
};

export const renderer = defineResource({
  dependencies: {
    required: [
      "canvas",
      "camera",
      "engine",
      "runtimeStore",
      "runtimeController",
      "time",
    ],
    optional: ["profiler"],
  },
  start: ({
    canvas,
    camera,
    engine,
    runtimeStore,
    runtimeController,
    time,
    profiler,
  }: {
    canvas: CanvasAPI;
    camera: CameraAPI; // Will be typed properly
    engine: BoidEngine;
    runtimeStore: RuntimeStoreResource;
    runtimeController: RuntimeController;
    time: TimeResource;
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

    // Lifecycle tick tracking (dispatch time.passed every second of simulation time)
    let lastLifecycleTickTime = 0;
    const LIFECYCLE_TICK_INTERVAL = 1000; // 1 second in milliseconds

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
        case " ": {
          // Toggle pause (space bar)
          e.preventDefault();
          const timeState = time.getState();
          if (timeState.isPaused) {
            time.resume();
            console.log("▶️ Resumed");
          } else {
            time.pause();
            console.log("⏸️ Paused");
          }
          break;
        }
        case "arrowright":
          // Step forward one tick (when paused)
          e.preventDefault();
          time.step();
          console.log("⏭️ Step forward");
          break;
        case "1":
          // 0.25x speed
          time.setTimeScale(0.25);
          console.log("⏩ Speed: 0.25x");
          break;
        case "2":
          // 0.5x speed
          time.setTimeScale(0.5);
          console.log("⏩ Speed: 0.5x");
          break;
        case "3":
          // 1x speed (normal)
          time.setTimeScale(1.0);
          console.log("⏩ Speed: 1x");
          break;
        case "4":
          // 2x speed
          time.setTimeScale(2.0);
          console.log("⏩ Speed: 2x");
          break;
        case "5":
          // 4x speed
          time.setTimeScale(4.0);
          console.log("⏩ Speed: 4x");
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
║ VISUAL TOGGLES:                        ║
║ T - Toggle motion trails               ║
║ E - Toggle energy bars (prey)          ║
║ H - Toggle mating hearts               ║
║ S - Toggle stance symbols              ║
║ D - Toggle death markers               ║
║ F - Toggle food sources                ║
║                                        ║
║ TIME CONTROL:                          ║
║ Space - Pause/Resume simulation        ║
║ → - Step forward (when paused)         ║
║ 1 - Speed 0.25x (slow motion)          ║
║ 2 - Speed 0.5x                         ║
║ 3 - Speed 1x (normal)                  ║
║ 4 - Speed 2x                           ║
║ 5 - Speed 4x (fast forward)            ║
║                                        ║
║ PROFILER:                              ║
║ P - Toggle performance profiler        ║
║ R - Reset profiler metrics             ║
║                                        ║
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
      const timeState = time.getState();

      // Get atmosphere settings (active event overrides base)
      const { base, activeEvent } = ui.visualSettings.atmosphere;
      const atmosphereSettings = activeEvent?.settings || base;

      // Viewport culling: Only render boids visible in camera viewport
      profiler?.start("render.culling");
      const visibleBoids = engine.boids.filter((boid) =>
        camera.isInViewport(boid.position.x, boid.position.y, 100)
      );
      profiler?.end("render.culling");

      // Build render context
      const renderContext: RenderContext = {
        ctx,
        width,
        height,
        boids: visibleBoids, // Only visible boids!
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
        timeState, // NEW: Pass time state to renderer
        profiler,
        camera, // NEW: Pass camera to renderer for coordinate transforms
      };

      // Execute rendering pipeline
      renderFrame(renderContext, fps, simulation.obstacles.length);
    };

    const animate = () => {
      profiler?.start("frame.total");

      // Calculate real-world frame time
      const currentTime = performance.now();
      const realDeltaMs = currentTime - lastFrameTime;
      lastFrameTime = currentTime;

      // Update time resource (handles pause/scale internally)
      time.update(realDeltaMs);

      // Get time state
      const timeState = time.getState();

      // Smooth FPS calculation (exponential moving average) - for display only
      fps = fps * 0.9 + (1000 / realDeltaMs) * 0.1;

      // Only update simulation if not paused
      if (!timeState.isPaused) {
        // Apply time scale to delta
        const scaledDeltaSeconds = (realDeltaMs / 1000) * timeState.timeScale;
        accumulator += scaledDeltaSeconds;

        // Clamp accumulator to prevent spiral of death
        if (accumulator > MAX_ACCUMULATED_TIME) {
          accumulator = MAX_ACCUMULATED_TIME;
        }

        // Update simulation at fixed rate (may run 0, 1, or multiple times per frame)
        profiler?.start("frame.update");
        while (accumulator >= FIXED_TIMESTEP) {
          engine.update(FIXED_TIMESTEP); // Always pass fixed 16.67ms timestep
          time.tick(); // Increment tick counter
          accumulator -= FIXED_TIMESTEP;
        }
        profiler?.end("frame.update");

        // Check for lifecycle tick (dispatch time.passed every second of simulation time)
        const currentSimulationTime = timeState.simulationElapsedMs;
        if (
          currentSimulationTime - lastLifecycleTickTime >=
          LIFECYCLE_TICK_INTERVAL
        ) {
          profiler?.start("frame.lifecycle");
          runtimeController.dispatch({
            type: eventKeywords.time.passed,
            deltaMs: 1000,
          });
          lastLifecycleTickTime = currentSimulationTime;
          profiler?.end("frame.lifecycle");
        }

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
      }

      // Handle step mode (when paused)
      if (timeState.isPaused && timeState.stepRequested) {
        profiler?.start("frame.step");

        // Run one simulation update
        engine.update(FIXED_TIMESTEP);
        time.tick();

        // Check for lifecycle tick (same as normal update)
        const currentSimulationTime = timeState.simulationElapsedMs;
        if (
          currentSimulationTime - lastLifecycleTickTime >=
          LIFECYCLE_TICK_INTERVAL
        ) {
          runtimeController.dispatch({
            type: eventKeywords.time.passed,
            deltaMs: 1000,
          });
          lastLifecycleTickTime = currentSimulationTime;
        }

        // Check for catches after step
        const catches = engine.checkCatches();
        for (const catchEvent of catches) {
          runtimeController.dispatch({
            type: eventKeywords.boids.caught,
            predatorId: catchEvent.predatorId,
            preyId: catchEvent.preyId,
            preyTypeId: catchEvent.preyTypeId,
            preyEnergy: catchEvent.preyEnergy,
            preyPosition: catchEvent.preyPosition,
          });
        }

        // Clear step request
        time.clearStepRequest();

        profiler?.end("frame.step");
      }

      // Always render (even when paused)
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
