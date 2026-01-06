// ============================================
// Worker System Generation
// ============================================

import { defineResource, StartedResource } from "braided";
import type { EffectExecutorMap, EventHandlerMap } from "emergent";
import { emergentSystem } from "emergent";
import { ClientEvent, hasProgress, TaskRegistry, WorkerEvent } from "@/lib/workerTasks/core";
import { effectKeywords, eventKeywords } from "@/lib/workerTasks/vocabulary";
import { ZodSafeParseSuccess } from "zod";
import { createSubscription } from "@/lib/state";

/**
 * Worker effect types
 */
type WorkerEffect =
  | {
      type: typeof effectKeywords.worker.forwardToClient;
      event: WorkerEvent;
    }
  | {
      type: typeof effectKeywords.worker.log;
      message: string;
    }
  | {
      type: typeof effectKeywords.worker.executeTask;
      taskId: string;
      taskName: string;
      input: unknown;
    };

/**
 * Worker state (none needed)
 */
type WorkerState = Record<string, never>;

/**
 * Worker handler context
 */
type WorkerHandlerContext = Record<string, never>;

/**
 * Worker executor context
 */
type WorkerExecutorContext = {
  dispatchToClient: (event: WorkerEvent) => void;
  tasks: TaskRegistry;
};

const workerEventHandlers = (tasks: TaskRegistry) =>
  ({
    [eventKeywords.taskRequest]: (_state, event) => {
      // Validate task exists
      const task = tasks[event.taskName];
      if (!task) {
        return [
          {
            type: effectKeywords.worker.log,
            message: `Unknown task: ${event.taskName}`,
          },
          {
            type: effectKeywords.worker.forwardToClient,
            event: {
              type: eventKeywords.taskError,
              taskId: event.taskId,
              taskName: event.taskName,
              error: `Unknown task: ${event.taskName}`,
            },
          },
        ];
      }

      // Validate input against task schema
      const inputResult = task.parseIO
        ? task.input.safeParse(event.input)
        : ({ success: true, data: event.input } as ZodSafeParseSuccess<
            typeof event.input
          >);
      if (!inputResult.success) {
        return [
          {
            type: effectKeywords.worker.log,
            message: `Invalid input for task ${event.taskName}: ${inputResult.error}`,
          },
          {
            type: effectKeywords.worker.forwardToClient,
            event: {
              type: eventKeywords.taskError,
              taskId: event.taskId,
              taskName: event.taskName,
              error: `Invalid input: ${inputResult.error.message}`,
            },
          },
        ];
      }

      // Schedule task execution
      return [
        {
          type: effectKeywords.worker.log,
          message: `Executing task: ${event.taskName}`,
        },
        {
          type: effectKeywords.worker.executeTask,
          taskId: event.taskId,
          taskName: event.taskName,
          input: inputResult.data,
        },
      ];
    },
  }) satisfies EventHandlerMap<
    ClientEvent,
    WorkerEffect,
    WorkerState,
    WorkerHandlerContext
  >;

// ============================================
// Effect Executors
// ============================================

const workerExecutors: EffectExecutorMap<
  WorkerEffect,
  ClientEvent,
  WorkerExecutorContext
> = {
  [effectKeywords.worker.forwardToClient]: ({ event }, ctx) => {
    ctx.dispatchToClient(event);
  },

  [effectKeywords.worker.log]: ({ message }) => {
    console.log(`[Worker] ${message}`);
  },

  [effectKeywords.worker.executeTask]: async (
    { taskId, taskName, input },
    ctx,
  ) => {
    const task = ctx.tasks[taskName];
    if (!task) {
      // Should never happen (validated in handler)
      return;
    }

    try {
      // Create task context
      // reportProgress is typed as never for tasks without progress
      const taskContext = {
        reportProgress: hasProgress(task)
          ? async (progress: unknown) => {
              ctx.dispatchToClient({
                type: eventKeywords.taskProgress,
                taskId,
                taskName,
                progress,
              });
            }
          : (undefined as never), // Type as never for tasks without progress
      };

      // Execute task with context (all tasks receive context)
      const result = await task.execute(input, taskContext);

      // Validate output
      const outputResult = task.parseIO
        ? task.output.safeParse(result)
        : ({ success: true, data: result } as ZodSafeParseSuccess<
            typeof result
          >);
      if (!outputResult.success) {
        ctx.dispatchToClient({
          type: eventKeywords.taskError,
          taskId,
          taskName,
          error: `Invalid output: ${outputResult.error.message}`,
        });
        return;
      }

      // Send completion
      ctx.dispatchToClient({
        type: eventKeywords.taskComplete,
        taskId,
        taskName,
        output: outputResult.data,
      });
    } catch (error) {
      // Send error
      ctx.dispatchToClient({
        type: eventKeywords.taskError,
        taskId,
        taskName,
        error: String(error),
      });
    }
  },
};

const workerTransport = defineResource({
  start: () => {
    const transportListeners = createSubscription<ClientEvent>();

    const handleMessage = (event: MessageEvent<ClientEvent>) => {
      const clientEvent = event.data;
      transportListeners.notify(clientEvent);
    };

    const sendMessage = (event: WorkerEvent) => {
      self.postMessage(event);
    };

    const api = {
      notifyReady: () => {
        sendMessage({
          type: eventKeywords.workerReady,
          timestamp: Date.now(),
        });
      },
      addMessageListener: (listener: (event: ClientEvent) => void) => {
        return transportListeners.subscribe(listener);
      },
      sendMessage: (event: WorkerEvent) => {
        sendMessage(event);
      },
      setupWorkerListener: () => {
        self.addEventListener("message", handleMessage);
      },
      cleanupWorkerListener: () => {
        self.removeEventListener("message", handleMessage);
      },
      notifyError: (message: string, taskId: string, taskName: string) => {
        sendMessage({
          type: eventKeywords.taskError,
          taskId,
          taskName,
          error: message,
        });
      },
    };

    return api;
  },
  halt: (api) => {
    api.cleanupWorkerListener();
  },
});
type WorkerTransport = StartedResource<typeof workerTransport>;

/**
 * Create worker system configuration for a task registry
 */
export function createWorkerSystem<T extends TaskRegistry>(tasks: T) {
  const workerEventLoop = defineResource({
    dependencies: ["workerTransport"],
    start: ({ workerTransport }: { workerTransport: WorkerTransport }) => {
      console.log("[Worker] Starting task event loop...");

      const createWorkerLoop = emergentSystem<
        ClientEvent,
        WorkerEffect,
        WorkerState,
        WorkerHandlerContext,
        WorkerExecutorContext
      >();

      const loop = createWorkerLoop({
        getState: () => ({}),
        handlers: workerEventHandlers(tasks),
        executors: workerExecutors,
        handlerContext: {},
        executorContext: {
          dispatchToClient: (event: WorkerEvent) => {
            workerTransport.sendMessage(event);
          },
          tasks,
        },
      });

      console.log("[Worker] ✅ Task event loop started");

      return {
        dispatch: loop.dispatch,
        subscribe: loop.subscribe,
        dispose: loop.dispose,
      };
    },
    halt: (loop) => {
      console.log("[Worker] Halting task event loop...");
      loop.dispose();
    },
  });
  type WorkerLoop = StartedResource<typeof workerEventLoop>;

  // ============================================
  // Message Listener Resource
  // ============================================

  const messageListener = defineResource({
    dependencies: ["workerEventLoop", "workerTransport"],
    start: ({
      workerEventLoop,
      workerTransport,
    }: {
      workerEventLoop: WorkerLoop;
      workerTransport: WorkerTransport;
    }) => {
      console.log("[Worker] Starting message listener...");

      const handleMessage = (event: ClientEvent) => {
        console.log(`[Worker] Received event: ${event.type}`);

        // Dispatch to event loop
        workerEventLoop.dispatch(event);
      };

      // Attach listener
      const unsubscribe = workerTransport.addMessageListener(handleMessage);
      workerTransport.setupWorkerListener();

      console.log("[Worker] ✅ Message listener started");

      return {
        cleanup: () => {
          unsubscribe();
        },
      };
    },
    halt: (listener) => {
      console.log("[Worker] Halting message listener...");
      listener.cleanup();
    },
  });

  // system configuration
  return {
    workerTransport,
    workerEventLoop,
    messageListener,
  };
}

/**
 * Create worker system configuration from task definitions
 *
 * This should be used in the worker script.
 *
 * @param tasks - Task registry defining all available tasks
 * @returns Worker system config
 *
 * @example
 * ```typescript
 * // In worker script
 * import { startSystem } from "braided";
 * import { createWorkerSystemConfig } from "@/lib/workerTasks";
 * import { tasks } from "./myTasks";
 *
 * const workerSystemConfig = createWorkerSystemConfig(tasks);
 * startSystem(workerSystemConfig).then(() => {
 *   self.postMessage({ type: "worker/ready", timestamp: Date.now() });
 * });
 * ```
 */
export function createWorkerSystemConfig<T extends TaskRegistry>(tasks: T) {
  return createWorkerSystem(tasks);
}
