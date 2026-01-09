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
import { RandomnessResource } from "../shared/randomness";

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
    "randomness",
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
    randomness,
  }: {
    engine: BoidEngine;
    time: TimeAPI;
    updateLoop: UpdateLoopResource;
    renderer: RendererResource;
    camera: CameraAPI;
    runtimeStore: RuntimeStoreResource;
    canvas: CanvasAPI;
    webglRenderer: WebGLRendererResource;
    randomness: RandomnessResource;
  }) => {
    const channel = createChannel<SimulationCommand, SimulationEvent>();

    const commandHandlers = {
      [simulationKeywords.commands.addBoid]: (command) => {
        console.log("[BrowserSimulation] Adding boid:", command.boid);
        engine.addBoid(command.boid);
      },
      [simulationKeywords.commands.removeBoid]: (command) => {
        console.log("[BrowserSimulation] Removing boid:", command.boidId);
        engine.removeBoid(command.boidId);
      },
      [simulationKeywords.commands.followBoid]: (command) => {
        console.log("[BrowserSimulation] Following boid:", command.boidId);
        camera.startFollowing(command.boidId);
      },
      [simulationKeywords.commands.stopFollowingBoid]: (_command) => {
        console.log("[BrowserSimulation] Stopping following");
        camera.stopFollowing();
      },
      [simulationKeywords.commands.addObstacle]: (command) => {
        console.log("[BrowserSimulation] Adding obstacle:", command.obstacle);
        // engine.addObstacle(command.obstacle);
      },
      [simulationKeywords.commands.clearObstacle]: (command) => {
        console.log(
          "[BrowserSimulation] Clearing obstacle:",
          command.obstacleId
        );
        // engine.clearObstacle(command.obstacleId);
      },
      [simulationKeywords.commands.clearAllObstacles]: (_command) => {
        console.log("[BrowserSimulation] Clearing all obstacles");
        // engine.clearAllObstacles();
      },
      [simulationKeywords.commands.pause]: (_command) => {
        console.log("[BrowserSimulation] Pausing");
        updateLoop.pause();
      },
      [simulationKeywords.commands.resume]: (_command) => {
        console.log("[BrowserSimulation] Resuming");
        updateLoop.resume();
      },
      [simulationKeywords.commands.start]: (_command) => {
        if (!updateLoop.isRunning()) {
          console.log("[BrowserSimulation] Starting update loop");
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
              console.log("[BrowserSimulation] Lifecycle:", lifecycle);
            }
          );
        }

        if (!renderer.isRunning()) {
          console.log("[BrowserSimulation] Starting renderer");
          renderer.start();
        }
      },
      [simulationKeywords.commands.step]: (_command) => {
        console.log("[BrowserSimulation] Stepping");
        updateLoop.step();
      },
      [simulationKeywords.commands.setTimeScale]: (command) => {
        console.log(
          "[BrowserSimulation] Setting time scale:",
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
        console.log("[BrowserSimulation] Toggling trails");
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
        console.log("[BrowserSimulation] Toggling energy bar");
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
        console.log("[BrowserSimulation] Toggling mating hearts");
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
        console.log("[BrowserSimulation] Toggling stance symbols");
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
          "[BrowserSimulation] Setting renderer mode:",
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
        console.log("[BrowserSimulation] Spawning food:", command.position);
        // engine.spawnFood(command.position);
      },
      [simulationKeywords.commands.clearFood]: (_command) => {
        console.log("[BrowserSimulation] Clearing food");
        // engine.clearFood();
      },
      [simulationKeywords.commands.spawnObstacle]: (command) => {
        console.log("[BrowserSimulation] Spawning obstacle:", command.position);
        // engine.spawnObstacle(command.position);
      },
      [simulationKeywords.commands.spawnPredator]: (command) => {
        console.log("[BrowserSimulation] Spawning predator:", command.position);
        // engine.spawnPredator(command.position);
      },
      [simulationKeywords.commands.clearDeathMarkers]: (_command) => {
        console.log("[BrowserSimulation] Clearing death markers");
        // engine.clearDeathMarkers();
      },
      [simulationKeywords.commands.updateParameters]: (command) => {
        console.log("[BrowserSimulation] Updating parameters:", command.parameters);
        runtimeStore.store.setState((current) => ({
          ...current,
          config: {
            ...current.config,
            parameters: {
              ...current.config.parameters,
              ...command.parameters,
            },
          },
        }));
      },
    } satisfies CommandHandlers;

    const unsubscribeCallbacks = new Set<(...args: any[]) => void>();

    const wireChannels = () => {
      unsubscribeCallbacks.add(
        randomness.watch((event) => {
          console.log("[BrowserSimulation] Randomness event:", event);
          runtimeStore.store.setState(currentState => ({
            ...currentState,
            config: {
                ...currentState.config,
                randomSeed: String(event.newSeed),
              },
            })
          );
        }
      ));
    };

    const simulation = createSimulation(
      { simulationChannel: channel },
      {
        onInitialize: () => {
          console.log("[BrowserSimulation] Initialized");
          engine.initialize(channel);
          wireChannels();
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
            resolve({
              type: simulationKeywords.events.error,
              error: error instanceof Error ? error.message : "Unknown error",
              meta: error,
            });
          }
        },
        onCleanup: () => {
          console.log("[BrowserSimulation] Cleaned up");
          unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
        },
      }
    );

    simulation.initialize();

    const commands = {
      start: () => {
        console.log("[BrowserSimulation] Starting");
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
