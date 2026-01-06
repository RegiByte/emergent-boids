import { simulationKeywords } from "@/boids/vocabulary/keywords";
import {
    SimulationCommand,
    SimulationEvent,
} from "@/boids/vocabulary/schemas/simulation";
import { createChannel } from "@/lib/channels";
import {
    CommandHandlers,
    createSimulation,
} from "@/resources/shared/simulation/core";
import { defineResource } from "braided";
import { TimeAPI } from "../shared/time";
import { CameraAPI } from "./camera";
import { RendererResource } from "./renderer";
import { RuntimeStoreResource } from "./runtimeStore";
import { SharedEngineResource } from "./sharedEngine";
import { WorkerTasksResource } from "./workerTasks";

/**
 * Shared Simulation Resource
 *
 * Mirrors browserSimulation but delegates physics commands to worker
 * Handles local UI/rendering commands directly
 */
export const sharedSimulation = defineResource({
  dependencies: [
    "engine", // sharedEngine
    "workerTasks",
    "camera",
    "runtimeStore",
    "runtimeController",
    "renderer",
    "time",
  ],
  start: ({
    engine,
    workerTasks,
    camera,
    runtimeStore,
    runtimeController,
    renderer,
    time,
  }: {
    engine: SharedEngineResource;
    workerTasks: WorkerTasksResource;
    camera: CameraAPI;
    runtimeStore: RuntimeStoreResource;
    runtimeController: any; // RuntimeController type
    renderer: RendererResource;
    time: TimeAPI;
  }) => {
    const channel = createChannel<SimulationCommand, SimulationEvent>();


    const commandHandlers = {
      // Physics commands → Forward to worker
      [simulationKeywords.commands.addBoid]: (command) => {
        engine.addBoid(command.boid);
      },
      [simulationKeywords.commands.removeBoid]: (command) => {
        engine.removeBoid(command.boidId);
      },
      [simulationKeywords.commands.pause]: (_command) => {
        workerTasks.dispatch("command", {
          command: { type: simulationKeywords.commands.pause },
        });
        time.pause();
      },
      [simulationKeywords.commands.resume]: (_command) => {
        workerTasks.dispatch("command", {
          command: { type: simulationKeywords.commands.resume },
        });
        time.resume();
      },
      [simulationKeywords.commands.step]: (_command) => {
        workerTasks.dispatch("command", {
          command: { type: simulationKeywords.commands.step },
        });
      },
      [simulationKeywords.commands.setTimeScale]: (command) => {
        workerTasks.dispatch("command", {
          command: {
            type: simulationKeywords.commands.setTimeScale,
            timeScale: command.timeScale,
          },
        });
      },

      // UI commands → Handle locally
      [simulationKeywords.commands.followBoid]: (command) => {
        camera.startFollowing(command.boidId);
      },
      [simulationKeywords.commands.stopFollowingBoid]: (_command) => {
        camera.stopFollowing();
      },
      [simulationKeywords.commands.toggleTrails]: (_command) => {
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

      [simulationKeywords.commands.start]: (_command) => {
        if (!renderer.isRunning()) {
          renderer.start();
        }
        // Worker loop is already started in sharedEngine
      },
    } satisfies Partial<CommandHandlers>;

    const simulation = createSimulation(
      { simulationChannel: channel },
      {
        onInitialize: () => {
          console.log("[SharedSimulation] Initialized");
          engine.initialize(channel);
        },
        onCommand: (command, resolve) => {
          const handler =
            commandHandlers[command.type as keyof typeof commandHandlers];
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
          console.log("[SharedSimulation] Cleaned up");
        },
      }
    );

    simulation.initialize();

    // Event Bridge: Watch simulation channel and forward events to runtimeController
    // This enables analytics and atmosphere to observe events from the worker
    // Worker is the source of truth - browser just mirrors the state
    channel.watch((event: any) => {
      // console.log("[SharedSimulation] Channel event:", event.type);

      // Forward all events to runtimeController for analytics/atmosphere
      runtimeController.dispatch(event);
    });

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
          return time.getState().isPaused;
        },
      }

      return api;
  },
  halt: ({ cleanup }) => {
    cleanup();
  },
});
