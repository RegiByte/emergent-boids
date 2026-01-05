import {
  SimulationCommand,
  SimulationEvent,
} from "@/boids/vocabulary/schemas/simulation";
import { Channel } from "@/lib/channels.ts";
import { SubscriptionCallback } from "@/lib/state";

/**
 * Higher-order simulation factory that creates a simulation instance from a set of dependencies and handlers.
 * This only does orchestration work, it doesn't do any work by itself.
 */

type SimulationDeps = {
  simulationChannel: Channel<SimulationCommand, SimulationEvent>;
};

type SimulationHandlers = {
  // basic function, called when initializing the simulation
  onInitialize: () => void;
  // called when a command is dispatched to the simulation
  onCommand: (
    command: SimulationCommand,
    resolve: (output: SimulationEvent | undefined) => void
  ) => SimulationEvent | undefined | void;
  // called when the simulation is cleaned up (termination)
  onCleanup: () => void;
};

export function createSimulation(
  deps: SimulationDeps,
  handlers: SimulationHandlers
) {
  const { simulationChannel: channel } = deps;
  const { onInitialize, onCommand } = handlers;
  let attachedWorkHandler: ReturnType<typeof channel.work> | null = null;

  const initialize = () => {
    onInitialize();
    attachedWorkHandler = channel.work(onCommand);
  };

  const dispatchImmediate = (command: SimulationCommand) => {
    channel.put(command);
  };

  const dispatch = (command: SimulationCommand) => {
    // Put the command into the channel asynchronously to avoid blocking the main thread
    // this job will be handled when the current frame is finished
    setTimeout(() => {
      dispatchImmediate(command);
    }, 0);
  };

  const cleanup = () => {
    channel.clear();
    if (attachedWorkHandler) {
      attachedWorkHandler();
    }
  };

  const watch = (callback: SubscriptionCallback<(typeof channel)["out"]>) => {
    return channel.watch(callback);
  };

  const api = {
    watch,
    cleanup,
    dispatch,
    initialize,
    dispatchImmediate,
  };

  return api;
}

export type CommandHandler<TCommand> = (
  command: Extract<SimulationCommand, { type: TCommand }>
) => void;

export type CommandHandlers = {
  [Key in SimulationCommand["type"]]: CommandHandler<Key>;
};

export type SimulationAPI = ReturnType<typeof createSimulation>;
