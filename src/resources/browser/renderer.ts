import { findBoidWhere, iterateBoids } from "@/boids/iterators.ts";
import { Boid, BoidsById } from "@/boids/vocabulary/schemas/entities.ts";
import { stanceKeywords } from "@/boids/vocabulary/keywords.ts";
import { BoidStance } from "@/boids/vocabulary/schemas/primitives.ts";
import { getActivePositions, getActiveVelocities, getActiveEnergy, getActiveHealth, getActiveStanceFlags, getActiveStanceEnteredAtFrame, unpackStanceFlags, SharedBoidViews } from "@/lib/sharedMemory.ts";
import { createUpdateLoop } from "@/lib/updateLoop.ts";
import { sharedMemoryKeywords } from "@/lib/workerTasks/vocabulary.ts";
import {
  renderFrame,
  type RenderContext,
} from "@/resources/browser/rendering/pipeline.ts";
import { defineResource, StartedResource } from "braided";
import { profilerKeywords } from "../../boids/vocabulary/keywords.ts";
import { SystemConfigResource } from "../shared/config.ts";
import { FrameRaterAPI } from "../shared/frameRater.ts";
import type { Profiler } from "../shared/profiler.ts";
import {
  BoidsPhysicsMemory,
  SharedMemoryManager,
} from "../shared/sharedMemoryManager.ts";
import type { TimeResource } from "../shared/time.ts";
import type { AtlasesResult } from "./atlases.ts";
import { CameraAPI } from "./camera.ts";
import { CanvasAPI } from "./canvas.ts";
import { getBoidPhysics, LocalBoidStoreResource } from "./localBoidStore.ts";
import type { RuntimeStoreResource } from "./runtimeStore.ts";

export type Renderer = {
  drawFrame: (realDeltaMs: number, fps?: number) => void;
  cleanup: () => void;
};

const createRenderFrameContext = ({
  canvas,
  camera,
  runtimeStore,
  time,
  profiler,
  boids,
  boidsPhysicsMemory,
  atlases,
  usesSharedMemory,
}: {
  canvas: CanvasAPI;
  camera: CameraAPI;
  runtimeStore: RuntimeStoreResource;
  time: TimeResource;
  profiler: Profiler | undefined;
  boids: BoidsById;
  boidsPhysicsMemory: BoidsPhysicsMemory;
  atlases: AtlasesResult;
  usesSharedMemory: boolean;
}) => {
  const { ctx, width, height } = canvas;
  const { simulation, ui, config } = runtimeStore.store.getState();
  const timeState = time.getState();
  const speciesConfigs = config.species;

  // Get atmosphere settings (active event overrides base)
  const { base, activeEvent } = ui.visualSettings.atmosphere;
  const atmosphereSettings = activeEvent?.settings || base;

  const frameBoids = {} as BoidsById;
  const allBoidsWithFreshData = {} as BoidsById;  // Session 129: Track all boids for stance symbols
  const framePhysics = boidsPhysicsMemory.views as unknown as SharedBoidViews;
  const physicsToIndex = {} as Record<string, number>;
  const activePositions = usesSharedMemory
    ? getActivePositions(framePhysics)
    : null;
  const activeVelocities = usesSharedMemory
    ? getActiveVelocities(framePhysics)
    : null;
  // Session 125: Read observer state from SharedArrayBuffer
  const activeEnergy = usesSharedMemory
    ? getActiveEnergy(framePhysics)
    : null;
  const activeHealth = usesSharedMemory
    ? getActiveHealth(framePhysics)
    : null;
  const activeStanceFlags = usesSharedMemory
    ? getActiveStanceFlags(framePhysics)
    : null;
  // Session 130: Read stanceEnteredAtFrame from SharedArrayBuffer
  const activeStanceEnteredAtFrame = usesSharedMemory
    ? getActiveStanceEnteredAtFrame(framePhysics)
    : null;

  // Stance number to string mapping (Session 125)
  const numberToStance: Record<number, BoidStance> = {
    0: stanceKeywords.flocking,
    1: stanceKeywords.fleeing,
    2: stanceKeywords.hunting,
    3: stanceKeywords.eating,
    4: stanceKeywords.mating,
    5: stanceKeywords.seeking_mate,
    6: stanceKeywords.idle,
  };

  for (const boid of iterateBoids(boids)) {
    const index = boid.index;
    const position = {
      x: boid.position.x,
      y: boid.position.y,
    };
    const velocity = {
      x: boid.velocity.x,
      y: boid.velocity.y,
    };

    // Read from consistent buffer (no more buffer index checks!)
    if (usesSharedMemory && activePositions && activeVelocities) {
      position.x = activePositions[index * 2 + 0];
      position.y = activePositions[index * 2 + 1];
      velocity.x = activeVelocities[index * 2 + 0];
      velocity.y = activeVelocities[index * 2 + 1];
    }
    
    // Session 125: Read observer state (energy, health, stance, seekingMate)
    let energy = boid.energy;
    let health = boid.health;
    let stance = boid.stance;
    let seekingMate = boid.seekingMate;
    let stanceEnteredAtFrame = boid.stanceEnteredAtFrame;
    
    if (usesSharedMemory && activeEnergy && activeHealth && activeStanceFlags && activeStanceEnteredAtFrame) {
      energy = activeEnergy[index];
      health = activeHealth[index];
      const flags = unpackStanceFlags(activeStanceFlags[index]);
      stance = numberToStance[flags.stance] ?? boid.stance;
      seekingMate = flags.seekingMate;
      
      // Session 130: Read stanceEnteredAtFrame directly from SharedArrayBuffer
      // Worker sets this value when stance changes in applyBehaviorDecision()
      // No more unreliable comparison logic - single source of truth!
      stanceEnteredAtFrame = activeStanceEnteredAtFrame[index];
    }
    
    // Session 129: Store ALL boids with updated stance data (for WebGL stance symbols)
    allBoidsWithFreshData[boid.id] = {
      ...boid,
      position,
      velocity,
      energy,
      health,
      stance,
      seekingMate,
      stanceEnteredAtFrame,
    };
    
    // Only store visible boids in frameBoids (for rendering)
    if (camera.isInViewport(position.x, position.y, 100)) {
      frameBoids[boid.id] = allBoidsWithFreshData[boid.id];
      physicsToIndex[boid.id] = boid.index;
    }
  }

  return {
    ctx,
    width,
    height,
    backgroundColor: config.world.backgroundColor,
    boids: frameBoids,
    allBoids: allBoidsWithFreshData,  // Session 129: Use boids with updated stanceEnteredAtFrame
    obstacles: simulation.obstacles,
    deathMarkers: simulation.deathMarkers,
    foodSources: simulation.foodSources,
    visualSettings: {
      trailsEnabled: ui.visualSettings.trailsEnabled,
      energyBarsEnabled: ui.visualSettings.energyBarsEnabled,
      matingHeartsEnabled: ui.visualSettings.matingHeartsEnabled,
      stanceSymbolsEnabled: ui.visualSettings.stanceSymbolsEnabled,
      deathMarkersEnabled: ui.visualSettings.deathMarkersEnabled,
      headerCollapsed: ui.headerCollapsed,
      foodSourcesEnabled: ui.visualSettings.foodSourcesEnabled,
      healthBarsEnabled: ui.visualSettings.healthBarsEnabled,
      atmosphere: {
        trailAlpha: atmosphereSettings.trailAlpha,
      },
    },
    timeState,
    simulationTick: Math.floor(timeState.simulationElapsedSeconds),
    simulationFrame: timeState.simulationFrame,
    profiler,
    camera,
    atlases,
    bufferViews: framePhysics,
    speciesConfigs,
  } satisfies RenderContext;
};

export const renderer = defineResource({
  dependencies: {
    required: [
      "canvas",
      "camera",
      "runtimeStore",
      "time",
      "webglRenderer",
      "atlases",
      "localBoidStore",
      "sharedMemoryManager",
      "frameRater",
      "config",
    ],
    optional: ["profiler"],
  },
  start: ({
    canvas,
    camera,
    runtimeStore,
    time,
    webglRenderer,
    profiler,
    atlases,
    localBoidStore,
    sharedMemoryManager,
    frameRater,
    config,
  }: {
    canvas: CanvasAPI;
    camera: CameraAPI;
    runtimeStore: RuntimeStoreResource;
    time: TimeResource;
    webglRenderer: { render: (context?: RenderContext) => void; canvas: HTMLCanvasElement };
    profiler: Profiler | undefined;
    atlases: AtlasesResult; // Session 105: Pre-generated atlases
    localBoidStore: LocalBoidStoreResource;
    sharedMemoryManager: SharedMemoryManager;
    frameRater: FrameRaterAPI;
    config: SystemConfigResource;
  }) => {
    // let animationId: number | null = null;
    // const isRunning = false;
    // let lastFrameTime = performance.now();
    // const fps = 0

    const renderExecutor = frameRater.variable("render", {
      targetFPS: 30,
      smoothingWindow: 10,
      maxDeltaMs: 100,
    });

    const updateLoop = createUpdateLoop({
      onUpdate: (_deltaMs, _scaledDeltaMs, clockDeltaMs) => {
        drawFrame(clockDeltaMs, Math.round(renderExecutor.getMetrics().fps));
        renderExecutor.recordFrame(clockDeltaMs);
      },
      onStart: () => {
        console.log("[RenderLoop] started");
      },
      onStop: () => {
        console.log("[RenderLoop] stopped");
      },
      onPause: () => {
        console.log("[RenderLoop] paused");
      },
      getDefaultTimestep: () => {
        return 60 / 1000;
      },
      getTimeScale: () => {
        return time.getState().timeScale;
      },
      onStep: (_deltaTime, _scaledDeltaMs) => {
        console.log("[Renderer] Stepping", _deltaTime, _scaledDeltaMs);
      },
    });

    const boidsPhysicsMemory = sharedMemoryManager.get(
      sharedMemoryKeywords.boidsPhysics
    );
    const boidStore = localBoidStore.store;
    // const simulationExecutor = frameRater.fixed("simulation", {
    //   targetFPS: 30,
    //   maxUpdatesPerFrame: 2,
    //   maxAccumulatedTime: 100,
    // });
    // const lifecycleExecutor = frameRater.throttled("lifecycle", {
    //   intervalMs: 1000, // 1Hz
    // });
    // const catchesExecutor = frameRater.throttled("catches", {
    //   intervalMs: 100, // 10Hz
    // });
    const cameraFollowExecutor = frameRater.throttled("cameraFollow", {
      intervalMs: 1000 / 50, // 30Hz
    });
    const usesSharedMemory = config.getConfig().usesSharedMemory;

    //     // Keyboard shortcuts for visual toggles
    //     const handleKeyPress = (e: KeyboardEvent) => {
    //       const { ui } = runtimeStore.store.getState();
    //       const currentSettings = ui.visualSettings;

    //       switch (e.key.toLowerCase()) {
    //         case "t":
    //           // Toggle trails
    //           runtimeStore.store.setState({
    //             ui: {
    //               ...ui,
    //               visualSettings: {
    //                 ...currentSettings,
    //                 trailsEnabled: !currentSettings.trailsEnabled,
    //               },
    //             },
    //           });
    //           console.log("Trails:", !currentSettings.trailsEnabled);
    //           break;
    //         case "e":
    //           // Toggle energy bars
    //           runtimeStore.store.setState({
    //             ui: {
    //               ...ui,
    //               visualSettings: {
    //                 ...currentSettings,
    //                 energyBarsEnabled: !currentSettings.energyBarsEnabled,
    //               },
    //             },
    //           });
    //           console.log("Energy bars:", !currentSettings.energyBarsEnabled);
    //           break;
    //         case "h":
    //           // Toggle mating hearts
    //           runtimeStore.store.setState({
    //             ui: {
    //               ...ui,
    //               visualSettings: {
    //                 ...currentSettings,
    //                 matingHeartsEnabled: !currentSettings.matingHeartsEnabled,
    //               },
    //             },
    //           });
    //           console.log("Mating hearts:", !currentSettings.matingHeartsEnabled);
    //           break;
    //         case "s":
    //           // Toggle stance symbols
    //           runtimeStore.store.setState({
    //             ui: {
    //               ...ui,
    //               visualSettings: {
    //                 ...currentSettings,
    //                 stanceSymbolsEnabled: !currentSettings.stanceSymbolsEnabled,
    //               },
    //             },
    //           });
    //           console.log("Stance symbols:", !currentSettings.stanceSymbolsEnabled);
    //           break;
    //         case "d":
    //           // Toggle death markers
    //           runtimeStore.store.setState({
    //             ui: {
    //               ...ui,
    //               visualSettings: {
    //                 ...currentSettings,
    //                 deathMarkersEnabled: !currentSettings.deathMarkersEnabled,
    //               },
    //             },
    //           });
    //           console.log("Death markers:", !currentSettings.deathMarkersEnabled);
    //           break;
    //         case "f":
    //           // Toggle food sources
    //           runtimeStore.store.setState({
    //             ui: {
    //               ...ui,
    //               visualSettings: {
    //                 ...currentSettings,
    //                 foodSourcesEnabled: !currentSettings.foodSourcesEnabled,
    //               },
    //             },
    //           });
    //           console.log("Food sources:", !currentSettings.foodSourcesEnabled);
    //           break;
    //         case "g": {
    //           // Toggle renderer (Canvas vs WebGL)
    //           const newMode = ui.rendererMode === "canvas" ? "webgl" : "canvas";
    //           runtimeStore.store.setState({
    //             ui: {
    //               ...ui,
    //               rendererMode: newMode,
    //             },
    //           });

    //           // Show/hide appropriate canvas
    //           if (newMode === "webgl") {
    //             canvas.canvas.style.display = "none";
    //             webglRenderer.canvas.style.display = "block";
    //           } else {
    //             canvas.canvas.style.display = "block";
    //             webglRenderer.canvas.style.display = "none";
    //           }

    //           console.log(
    //             `🎮 Renderer: ${newMode.toUpperCase()} ${newMode === "webgl" ? "⚡" : "🖌️"}`
    //           );
    //           break;
    //         }
    //         case " ": {
    //           // Toggle pause (space bar)
    //           e.preventDefault();
    //           const timeState = time.getState();
    //           if (timeState.isPaused) {
    //             time.resume();
    //             console.log("▶️ Resumed");
    //           } else {
    //             time.pause();
    //             console.log("⏸️ Paused");
    //           }
    //           break;
    //         }
    //         case "arrowright":
    //           // Step forward one tick (when paused)
    //           e.preventDefault();
    //           time.step();
    //           console.log("⏭️ Step forward");
    //           break;
    //         case "1":
    //           // 0.25x speed
    //           time.setTimeScale(0.25);
    //           console.log("⏩ Speed: 0.25x");
    //           break;
    //         case "2":
    //           // 0.5x speed
    //           time.setTimeScale(0.5);
    //           console.log("⏩ Speed: 0.5x");
    //           break;
    //         case "3":
    //           // 1x speed (normal)
    //           time.setTimeScale(1.0);
    //           console.log("⏩ Speed: 1x");
    //           break;
    //         case "4":
    //           // 2x speed
    //           time.setTimeScale(2.0);
    //           console.log("⏩ Speed: 2x");
    //           break;
    //         case "5":
    //           // 4x speed
    //           time.setTimeScale(4.0);
    //           console.log("⏩ Speed: 4x");
    //           break;
    //         case "p":
    //           // Toggle profiler
    //           if (profiler?.isEnabled()) {
    //             if (profiler?.isCumulativeEnabled()) {
    //               profiler?.printCumulativeSummary();
    //             } else {
    //               profiler?.printSummary();
    //             }
    //             profiler?.disable();
    //           } else {
    //             profiler?.startSession(60);
    //           }
    //           break;
    //         case "/":
    //         case "k":
    //           // Show help (/ or k)
    //           console.log(`
    // ╔════════════════════════════════════════╗
    // ║     EMERGENT BOIDS - KEYBOARD HELP     ║
    // ╠════════════════════════════════════════╣
    // ║ VISUAL TOGGLES:                        ║
    // ║ T - Toggle motion trails               ║
    // ║ E - Toggle energy bars (prey)          ║
    // ║ H - Toggle mating hearts               ║
    // ║ S - Toggle stance symbols              ║
    // ║ D - Toggle death markers               ║
    // ║ F - Toggle food sources                ║
    // ║ G - Toggle renderer (Canvas/WebGL)     ║
    // ║                                        ║
    // ║ TIME CONTROL:                          ║
    // ║ Space - Pause/Resume simulation        ║
    // ║ → - Step forward (when paused)         ║
    // ║ 1 - Speed 0.25x (slow motion)          ║
    // ║ 2 - Speed 0.5x                         ║
    // ║ 3 - Speed 1x (normal)                  ║
    // ║ 4 - Speed 2x                           ║
    // ║ 5 - Speed 4x (fast forward)            ║
    // ║                                        ║
    // ║ PROFILER:                              ║
    // ║ P - Toggle performance profiler        ║
    // ║ R - Reset profiler metrics             ║
    // ║                                        ║
    // ║ K or / - Show this help                ║
    // ╚════════════════════════════════════════╝
    //           `);
    //           break;
    //       }
    //     };

    let cachedFollowedBoid: { id: string; boid: Boid } | null = null;

    // Register keyboard listener
    // document.addEventListener("keydown", handleKeyPress);

    // Set initial canvas visibility based on renderer mode
    const initialMode = runtimeStore.store.getState().ui.rendererMode;
    if (initialMode === "webgl") {
      canvas.canvas.style.display = "none";
      webglRenderer.canvas.style.display = "block";
    } else {
      canvas.canvas.style.display = "block";
      webglRenderer.canvas.style.display = "none";
    }

    const prepareRenderContext = () => {
      profiler?.start(profilerKeywords.renderer.createRenderContext);
      const renderContext = createRenderFrameContext({
        canvas,
        camera,
        runtimeStore,
        time,
        profiler,
        boids: boidStore.boids,
        boidsPhysicsMemory,
        atlases,
        usesSharedMemory: config.getConfig().usesSharedMemory,
      });
      profiler?.end(profilerKeywords.renderer.createRenderContext);
      return renderContext;
    };

    const drawFrame = (realDeltaMs: number, fps = 0) => {
      // console.log("drawFrame", realDeltaMs, fps);
      const timeState = time.getState();
      const renderContext = prepareRenderContext();
      profiler?.start(profilerKeywords.renderer.draw);
      const { ui } = runtimeStore.store.getState();
      // Choose renderer based on UI setting
      if (ui.rendererMode === "webgl") {
        // Session 129: Pass render context to WebGL (contains fresh SharedArrayBuffer data)
        webglRenderer.render(renderContext);
      } else {
        // TODO: pass fps from updateLoop
        renderFrame(renderContext, fps);
      }
      // Execute rendering pipeline
      profiler?.end(profilerKeywords.renderer.draw);

      if (
        !timeState.isPaused &&
        cameraFollowExecutor.shouldExecute(realDeltaMs)
      ) {
        updateCamera();
        cameraFollowExecutor.recordExecution();
      }
    };

    // const recordFrameMetrics = (_value: number) => {
    //   // Record frame metrics
    //   const metrics = profiler?.getMetrics() || [];
    //   const frameTime =
    //     metrics.find((m) => m.name === profilerKeywords.updateLoop.frameTotal)
    //       ?.lastTime || 0;
    //   const updateTime =
    //     metrics.find(
    //       (m) => m.name === profilerKeywords.updateLoop.frameUpdateTime
    //     )?.lastTime || 0;
    //   const renderTime =
    //     metrics.find((m) => m.name === profilerKeywords.renderer.draw)
    //       ?.lastTime || 0;
    //   profiler?.recordFrame(frameTime, 0, updateTime, renderTime);

    //   // Also record cumulative frame if enabled
    //   profiler?.recordCumulativeFrame();
    // };

    const updateCamera = () => {
      if (camera.mode.type === "following") {
        const followedBoidId = camera.mode.boidId;
        
        // Refresh cache if following a different boid
        if (!cachedFollowedBoid || cachedFollowedBoid.id !== followedBoidId) {
          const followedBoid = findBoidWhere(
            boidStore.boids,
            (boid) => boid.id === followedBoidId
          );
          if (followedBoid) {
            cachedFollowedBoid = { id: followedBoidId, boid: followedBoid };
          } else {
            cachedFollowedBoid = null;
          }
        }
        
        if (cachedFollowedBoid) {
          // Session 127: localBoidStore is now synced periodically (every 30 frames)
          // For sub-frame accuracy at 60 FPS, read fresh position from SharedArrayBuffer
          let position = cachedFollowedBoid.boid.position;
          
          if (usesSharedMemory) {
            const boidPhysics = getBoidPhysics(
              cachedFollowedBoid.boid.index,
              boidsPhysicsMemory.views as unknown as SharedBoidViews
            );
            if (boidPhysics) {
              position = boidPhysics.position;
            }
          }
          
          camera.updateFollowPosition(position.x, position.y);
        } else {
          // Boid died or disappeared - exit follow mode
          camera.stopFollowing();
          cachedFollowedBoid = null;
        }
      } else {
        // Clean cache when not following
        cachedFollowedBoid = null;
      }
    };

    // const animate = () => {
    //   profiler?.start(profilerKeywords.updateLoop.update);

    //   // Calculate real-world frame time
    //   // TODO: take this from the updateLoop
    //   // const currentTime = performance.now();
    //   // const realDeltaMs = currentTime - lastFrameTime;
    //   // lastFrameTime = currentTime;

    //   // Update time resource (handles pause/scale internally)
    //   // time.update(realDeltaMs);

    //   // Record render frame (for FPS calculation)
    //   // renderExecutor.recordFrame(realDeltaMs);

    //   // Get time state
    //   const timeState = time.getState();
    //   // const scaledDeltaMs = realDeltaMs * timeState.timeScale;

    //   // Smooth FPS calculation (exponential moving average) - for display only
    //   // fps = fps * 0.9 + (1000 / realDeltaMs) * 0.1;

    //   // Build render context
    //   // profiler?.start(profilerKeywords.renderer.createRenderContext);
    //   // const renderContext = createRenderFrameContext({
    //   //   canvas,
    //   //   camera,
    //   //   runtimeStore,
    //   //   time,
    //   //   profiler,
    //   //   boids: boidStore.boids,
    //   //   boidsPhysicsMemory,
    //   //   atlases,
    //   //   usesSharedMemory: config.getConfig().usesSharedMemory,
    //   // });
    //   // profiler?.end(profilerKeywords.renderer.createRenderContext);
    //   // Only update simulation if not paused
    //   if (!timeState.isPaused) {
    //     // Update simulation at fixed rate (may run 0, 1, or multiple times per frame)
    //     // profiler?.start(profilerKeywords.updateLoop.frameUpdateTime);
    //     // const { updates, timestep, droppedFrames } =
    //     //   simulationExecutor.shouldUpdate(scaledDeltaMs);
    //     // for (let i = 0; i < updates; i++) {
    //     //   engine.update(timestep);
    //     //   time.tick();
    //     // }
    //     // simulationExecutor.recordExecution(updates, droppedFrames);
    //     // profiler?.end(profilerKeywords.updateLoop.frameUpdateTime);
    //     // Check for lifecycle tick (dispatch time.passed every second of simulation time)
    //     // profiler?.start(profilerKeywords.updateLoop.frameTimePassed);
    //     // if (lifecycleExecutor.shouldExecute(realDeltaMs)) {
    //     //   runtimeController.dispatch({
    //     //     type: eventKeywords.time.passed,
    //     //     deltaMs: 1000,
    //     //   });
    //     //   lifecycleExecutor.recordExecution();
    //     // }
    //     // profiler?.end(profilerKeywords.updateLoop.frameTimePassed);
    //     // Check for catches after all updates (once per render frame)
    //     // profiler?.start(profilerKeywords.updateLoop.frameCatches);
    //     // if (catchesExecutor.shouldExecute(realDeltaMs)) {
    //     //   const catches = engine.checkCatches();
    //     //   for (const catchEvent of catches) {
    //     //     runtimeController.dispatch({
    //     //       type: eventKeywords.boids.caught,
    //     //       predatorId: catchEvent.predatorId,
    //     //       preyId: catchEvent.preyId,
    //     //       preyTypeId: catchEvent.preyTypeId, // Include prey type for death tracking
    //     //       preyEnergy: catchEvent.preyEnergy,
    //     //       preyPosition: catchEvent.preyPosition,
    //     //     });
    //     //   }
    //     //   catchesExecutor.recordExecution();
    //     // }
    //     // profiler?.end(profilerKeywords.updateLoop.frameCatches);
    //   }

    //   // Handle step mode (when paused)
    //   // if (timeState.isPaused && timeState.stepRequested) {
    //   //   profiler?.start(profilerKeywords.updateLoop.frameStep);

    //   //   // Run one fixed timestep update
    //   //   const fixedTimeStep = simulationExecutor.getTimestep();
    //   //   const { timestep } = simulationExecutor.shouldUpdate(fixedTimeStep);

    //   //   // Run one simulation update
    //   //   engine.update(timestep);
    //   //   time.tick();
    //   //   simulationExecutor.recordExecution(1, 0);

    //   //   // Check for lifecycle tick (same as normal update)
    //   //   if (lifecycleExecutor.shouldExecute(realDeltaMs)) {
    //   //     runtimeController.dispatch({
    //   //       type: eventKeywords.time.passed,
    //   //       deltaMs: 1000,
    //   //     });
    //   //     lifecycleExecutor.recordExecution();
    //   //   }

    //   //   // Check for catches after step
    //   //   if (catchesExecutor.shouldExecute(realDeltaMs)) {
    //   //     const catches = engine.checkCatches();
    //   //     for (const catchEvent of catches) {
    //   //       runtimeController.dispatch({
    //   //         type: eventKeywords.boids.caught,
    //   //         predatorId: catchEvent.predatorId,
    //   //         preyId: catchEvent.preyId,
    //   //         preyTypeId: catchEvent.preyTypeId,
    //   //         preyEnergy: catchEvent.preyEnergy,
    //   //         preyPosition: catchEvent.preyPosition,
    //   //       });
    //   //     }
    //   //     catchesExecutor.recordExecution();
    //   //   }

    //   //   // Clear step request
    //   //   time.clearStepRequest();

    //   //   profiler?.end(profilerKeywords.updateLoop.frameStep);
    //   // }

    //   // Update camera if in follow mode
    //   // if (
    //   //   !timeState.isPaused &&
    //   //   cameraFollowExecutor.shouldExecute(realDeltaMs)
    //   // ) {
    //   //   updateCamera();
    //   //   cameraFollowExecutor.recordExecution();
    //   // }

    //   drawFrame(0, 0);

    //   profiler?.end(profilerKeywords.updateLoop.update);
    //   // queueFrameReccording(0);

    //   // if (isRunning) {
    //   //   animationId = requestAnimationFrame(animate);
    //   // }
    // };

    // const start = () => {
    //   if (!isRunning) {
    //     isRunning = true;
    //     animate();
    //   }
    // };

    // const stop = () => {
    //   if (animationId !== null) {
    //     cancelAnimationFrame(animationId);
    //     animationId = null;
    //   }
    //   isRunning = false;
    // };

    const cleanup = () => {
      // document.removeEventListener("keydown", handleKeyPress);
    };

    const setRendererMode = (mode: "canvas" | "webgl") => {
      if (mode === "webgl") {
        canvas.canvas.style.display = "none";
        webglRenderer.canvas.style.display = "block";
      } else {
        canvas.canvas.style.display = "block";
        webglRenderer.canvas.style.display = "none";
      }
    };

    const api = {
      start: () => updateLoop.start(),
      stop: () => updateLoop.stop(),
      isRunning: () => updateLoop.isRunning(),
      drawFrame,
      cleanup,
      setRendererMode,
    };

    return api;
  },
  halt: (renderer: Renderer & { cleanup?: () => void }) => {
    // renderer.stop();
    if (renderer.cleanup) {
      renderer.cleanup();
    }
  },
});

export type RendererResource = StartedResource<typeof renderer>;
