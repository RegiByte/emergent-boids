import { simulationKeywords } from "@/boids/vocabulary/keywords";
import {
  SimulationCommand,
  SimulationEvent,
} from "@/boids/vocabulary/schemas/simulation";
import { createChannel } from "@/lib/channels";
import { RendererResource } from "@/resources/browser/renderer";
import {
  CommandHandlers,
  createSimulation,
} from "@/resources/shared/simulation/core";
import { TimeAPI } from "@/resources/shared/time";
import { defineResource, StartedResource } from "braided";
import { CameraAPI } from "./camera";
import { BoidEngine } from "./engine";
import { RuntimeStoreResource } from "./runtimeStore";
import { UpdateLoopResource } from "./updateLoop";
import { CanvasAPI } from "./canvas";
import { WebGLRendererResource } from "./webglRenderer";

export const browserSimulation = defineResource({
  dependencies: [
    "engine",
    "time",
    "updateLoop",
    "renderer",
    "camera",
    "runtimeStore",
    "canvas",
    "webglRenderer",
  ],
  start: ({
    engine,
    time,
    updateLoop,
    renderer,
    camera,
    runtimeStore,
    canvas,
    webglRenderer,
  }: {
    engine: BoidEngine;
    time: TimeAPI;
    updateLoop: UpdateLoopResource;
    renderer: RendererResource;
    camera: CameraAPI;
    runtimeStore: RuntimeStoreResource;
    canvas: CanvasAPI;
    webglRenderer: WebGLRendererResource;
  }) => {
    const channel = createChannel<SimulationCommand, SimulationEvent>();

    const commandHandlers = {
      [simulationKeywords.commands.addBoid]: (command) => {
        console.log("[simulationWorker] Adding boid:", command.boid);
        engine.addBoid(command.boid);
      },
      [simulationKeywords.commands.removeBoid]: (command) => {
        console.log("[simulationWorker] Removing boid:", command.boidId);
        engine.removeBoid(command.boidId);
      },
      [simulationKeywords.commands.followBoid]: (command) => {
        console.log("[simulationWorker] Following boid:", command.boidId);
        camera.startFollowing(command.boidId);
      },
      [simulationKeywords.commands.stopFollowingBoid]: (_command) => {
        console.log("[simulationWorker] Stopping following");
        camera.stopFollowing();
      },
      [simulationKeywords.commands.addObstacle]: (command) => {
        console.log("[simulationWorker] Adding obstacle:", command.obstacle);
        // engine.addObstacle(command.obstacle);
      },
      [simulationKeywords.commands.clearObstacle]: (command) => {
        console.log(
          "[simulationWorker] Clearing obstacle:",
          command.obstacleId
        );
        // engine.clearObstacle(command.obstacleId);
      },
      [simulationKeywords.commands.clearAllObstacles]: (_command) => {
        console.log("[simulationWorker] Clearing all obstacles");
        // engine.clearAllObstacles();
      },
      [simulationKeywords.commands.pause]: (_command) => {
        console.log("[simulationWorker] Pausing");
        updateLoop.pause();
      },
      [simulationKeywords.commands.resume]: (_command) => {
        console.log("[simulationWorker] Resuming");
        updateLoop.resume();
      },
      [simulationKeywords.commands.start]: (_command) => {
        if (!updateLoop.isRunning()) {
          console.log("[simulationWorker] Starting update loop");
          updateLoop.start(
            30,
            (update) => {
              channel.out.notify({
                type: simulationKeywords.events.updated,
                frame: update.frame,
                simulationTime: update.simulationTime,
              });
            },
            (lifecycle) => {
              console.log("[simulationWorker] Lifecycle:", lifecycle);
            }
          );
        }

        if (!renderer.isRunning()) {
          console.log("[simulationWorker] Starting renderer");
          renderer.start();
        }
      },
      [simulationKeywords.commands.step]: (_command) => {
        console.log("[simulationWorker] Stepping");
        updateLoop.step();
      },
      [simulationKeywords.commands.setTimeScale]: (command) => {
        console.log(
          "[simulationWorker] Setting time scale:",
          command.timeScale
        );
        time.setTimeScale(command.timeScale);
        channel.out.notify({
          type: simulationKeywords.events.timeScaleChanged,
          timeScale: command.timeScale,
        });
        // updateLoop.setTimeScale(command.timeScale);
      },
      [simulationKeywords.commands.toggleTrails]: (_command) => {
        console.log("[simulationWorker] Toggling trails");
        // renderer.toggleTrails();
        runtimeStore.store.setState((current) => ({
          ...current,
          ui: {
            ...current.ui,
            visualSettings: {
              ...current.ui.visualSettings,
              trailsEnabled: !current.ui.visualSettings.trailsEnabled,
            },
          },
        }));
      },
      [simulationKeywords.commands.toggleEnergyBar]: (_command) => {
        console.log("[simulationWorker] Toggling energy bar");
        runtimeStore.store.setState((current) => ({
          ...current,
          ui: {
            ...current.ui,
            visualSettings: {
              ...current.ui.visualSettings,
              energyBarsEnabled: !current.ui.visualSettings.energyBarsEnabled,
            },
          },
        }));
      },
      [simulationKeywords.commands.toggleMatingHearts]: (_command) => {
        console.log("[simulationWorker] Toggling mating hearts");
        runtimeStore.store.setState((current) => ({
          ...current,
          ui: {
            ...current.ui,
            visualSettings: {
              ...current.ui.visualSettings,
              matingHeartsEnabled:
                !current.ui.visualSettings.matingHeartsEnabled,
            },
          },
        }));
      },
      [simulationKeywords.commands.toggleStanceSymbols]: (_command) => {
        console.log("[simulationWorker] Toggling stance symbols");
        runtimeStore.store.setState((current) => ({
          ...current,
          ui: {
            ...current.ui,
            visualSettings: {
              ...current.ui.visualSettings,
              stanceSymbolsEnabled:
                !current.ui.visualSettings.stanceSymbolsEnabled,
            },
          },
        }));
      },
      [simulationKeywords.commands.setRendererMode]: (command) => {
        console.log(
          "[simulationWorker] Setting renderer mode:",
          command.rendererMode
        );
        runtimeStore.store.setState((current) => ({
          ...current,
          ui: {
            ...current.ui,
            rendererMode: command.rendererMode,
          },
        }));
        if (command.rendererMode === "webgl") {
          canvas.canvas.style.display = "none";
          webglRenderer.canvas.style.display = "block";
        } else {
          canvas.canvas.style.display = "block";
          webglRenderer.canvas.style.display = "none";
        }
        // renderer.setRendererMode(command.rendererMode);
      },
      [simulationKeywords.commands.spawnFood]: (command) => {
        console.log("[simulationWorker] Spawning food:", command.position);
        // engine.spawnFood(command.position);
      },
      [simulationKeywords.commands.clearFood]: (_command) => {
        console.log("[simulationWorker] Clearing food");
        // engine.clearFood();
      },
      [simulationKeywords.commands.spawnObstacle]: (command) => {
        console.log("[simulationWorker] Spawning obstacle:", command.position);
        // engine.spawnObstacle(command.position);
      },
      [simulationKeywords.commands.spawnPredator]: (command) => {
        console.log("[simulationWorker] Spawning predator:", command.position);
        // engine.spawnPredator(command.position);
      },
      [simulationKeywords.commands.clearDeathMarkers]: (_command) => {
        console.log("[simulationWorker] Clearing death markers");
        // engine.clearDeathMarkers();
      },
    } satisfies CommandHandlers;

    const simulation = createSimulation(
      { simulationChannel: channel },
      {
        onInitialize: () => {
          console.log("[BrowserSimulation] Initialized");
        },
        onCommand: (command, resolve) => {
          const handler = commandHandlers[command.type];
          if (!handler) {
            resolve({
              type: simulationKeywords.events.error,
              error: `No handler found for command: ${command.type}`,
              meta: command,
            });
            return;
          }
          try {
            handler(command as never);
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              error !== null &&
              "message" in error &&
              typeof error.message === "string"
            ) {
              resolve({
                type: simulationKeywords.events.error,
                error: error.message,
                meta: error,
              });
            } else {
              resolve({
                type: simulationKeywords.events.error,
                error: "Unknown error",
                meta: error,
              });
            }
          }
        },
        onCleanup: () => {
          console.log("[simulationWorker] Cleaned up");
        },
      }
    );

    simulation.initialize();

    const commands = {
      start: () => {
        console.log("[simulationWorker] Starting");
        simulation.dispatch({ type: simulationKeywords.commands.start });
      },
      pause: () => {
        simulation.dispatch({ type: simulationKeywords.commands.pause });
      },
      resume: () => {
        simulation.dispatch({ type: simulationKeywords.commands.resume });
      },
      step: () => {
        simulation.dispatch({ type: simulationKeywords.commands.step });
      },
    };

    const api = {
      commands,
      initialize: simulation.initialize,
      cleanup: simulation.cleanup,
      dispatchImmediate: simulation.dispatchImmediate,
      dispatch: simulation.dispatch,
      watch: channel.watch,
      isPaused: () => {
        return updateLoop.isPaused();
      },
    };

    return api;
  },
  halt: ({ cleanup }) => {
    cleanup();
  },
});

export type SimulationResource = StartedResource<typeof browserSimulation>;
