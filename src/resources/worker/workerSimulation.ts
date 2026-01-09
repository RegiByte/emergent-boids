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
import { defineResource, StartedResource } from "braided";
import { WorkerEngineResource } from "./workerEngine";
import { WorkerUpdateLoopResource } from "./workerUpdateLoop";
import { TimeAPI } from "../shared/time";
import { WorkerStoreResource } from "./workerStore";

export const workerSimulation = defineResource({
  dependencies: [
    "workerEngine",
    "workerTime",
    "workerUpdateLoop",
    "workerStore",
  ],
  start: ({
    workerEngine,
    workerTime,
    workerUpdateLoop,
    workerStore,
  }: {
    workerEngine: WorkerEngineResource;
    workerTime: TimeAPI;
    workerUpdateLoop: WorkerUpdateLoopResource;
    workerStore: WorkerStoreResource;
  }) => {
    const channel = createChannel<SimulationCommand, SimulationEvent>();

    const commandHandlers = {
      [simulationKeywords.commands.addBoid]: (command) => {
        console.log("[WorkerSimulation] Adding boid:", command.boid);
        workerEngine.addBoid(command.boid);
      },
      [simulationKeywords.commands.removeBoid]: (command) => {
        console.log("[WorkerSimulation] Removing boid:", command.boidId);
        workerEngine.removeBoid(command.boidId);
      },
      [simulationKeywords.commands.pause]: (_command) => {
        console.log("[WorkerSimulation] Pausing");
        workerUpdateLoop.pause();
      },
      [simulationKeywords.commands.resume]: (_command) => {
        console.log("[WorkerSimulation] Resuming");
        workerUpdateLoop.resume();
      },
      [simulationKeywords.commands.start]: (_command) => {
        if (!workerUpdateLoop.isRunning()) {
          console.log("[WorkerSimulation] Starting update loop");
          workerUpdateLoop.start(
            30, // 30 UPS
            (update) => {
              // Notify browser of frame updates
              channel.out.notify({
                type: simulationKeywords.events.updated,
                frame: update.frame,
                simulationTime: update.simulationTime,
              });
            },
            (lifecycle) => {
              // Forward lifecycle events to browser
              // These are already AllEvents from workerEngine
              // Just need to wrap them in simulation event format
              console.log("[WorkerSimulation] Lifecycle event:", lifecycle);
            }
          );
        }
      },
      [simulationKeywords.commands.step]: (_command) => {
        console.log("[WorkerSimulation] Stepping");
        workerUpdateLoop.step();
      },
      [simulationKeywords.commands.setTimeScale]: (command) => {
        console.log(
          "[WorkerSimulation] Setting time scale:",
          command.timeScale
        );
        workerTime.setTimeScale(command.timeScale);
        channel.out.notify({
          type: simulationKeywords.events.timeScaleChanged,
          timeScale: command.timeScale,
        });
      },
      [simulationKeywords.commands.updateParameters]: (command) => {
        console.log(
          "[WorkerSimulation] Updating parameters:",
          command.parameters
        );
        // Update workerStore config with new parameters
        const currentState = workerStore.getState();
        workerStore.setState({
          ...currentState,
          config: {
            ...currentState.config,
            parameters: {
              ...currentState.config.parameters,
              ...command.parameters,
            },
          },
        });
        console.log("[WorkerSimulation] Parameters updated successfully");
      },
      [simulationKeywords.commands.spawnFood]: (command) => {
        console.log("[WorkerSimulation] Spawning food:", command.position);
        // TODO: engine.spawnFood(command.position);
      },
      [simulationKeywords.commands.clearFood]: (_command) => {
        console.log("[WorkerSimulation] Clearing food");
        // TODO: engine.clearFood();
      },
      [simulationKeywords.commands.spawnObstacle]: (command) => {
        console.log("[WorkerSimulation] Spawning obstacle:", command.position);
        // Session 127: Call worker engine method
        workerEngine.spawnObstacle(command.position, command.radius);
      },
      [simulationKeywords.commands.spawnPredator]: (command) => {
        console.log("[WorkerSimulation] Spawning predator:", command.position);
        // Session 127: Call worker engine method
        workerEngine.spawnPredator(command.position);
      },
      [simulationKeywords.commands.clearDeathMarkers]: (_command) => {
        console.log("[WorkerSimulation] Clearing death markers");
        // engine.clearDeathMarkers();
      },
    } satisfies Partial<CommandHandlers>;

    const simulation = createSimulation(
      { simulationChannel: channel },
      {
        onInitialize: () => {
          console.log("[WorkerSimulation] Initialized");
          workerEngine.initialize(channel);
        },
        onCommand: (command, resolve) => {
          const handler = commandHandlers[command.type as keyof typeof commandHandlers];
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
          console.log("[WorkerSimulation] Cleaned up");
        },
      }
    );

    simulation.initialize();

    // Subscribe to worker engine events and forward to simulation channel
    // This bridges engine events (boids/died, boids/reproduced) to simulation events
    // workerEngine.eventSubscription.subscribe((event) => {
    //   console.log("[WorkerSimulation] Engine event:", event.type);
    //   // Forward all engine events through the simulation channel
    //   // These will be picked up by sharedEngine and forwarded to the browser
    //   channel.out.notify(event as unknown as SimulationEvent);
    // });

    return {
      ...simulation,
      initialize: () => {},
      // Expose channel for worker task integration
      channel,
    };
  },
  halt: ({ cleanup }) => {
    cleanup();
  },
});

export type WorkerSimulationResource = StartedResource<typeof workerSimulation>;