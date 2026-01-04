import { defineResource } from "braided";
import {
  ClientEffect,
  ClientEvent,
  ClientStatus,
  generateTaskId,
  InferInput,
  InferOutput,
  InferProgress,
  TaskRegistry,
  WorkerEvent,
  WorkerImportFn,
} from "./core";
import {
  clientStatusKeywords,
  effectKeywords,
  eventKeywords,
} from "./vocabulary";
import {
  AtomState,
  createAtom,
  createSubscription,
  Subscription,
  useRefState,
} from "../state";
import { EffectExecutorMap, emergentSystem, EventHandlerMap } from "emergent";
import { useCallback, useEffect, useRef } from "react";

type ClientState = {
  status: ClientStatus;
  messageQueue: ClientEvent[];
};

type ClientHandlerContext = {
  updateState: (updater: (state: ClientState) => ClientState) => void;
};

type ClientExecutorContext = {
  getWorker: () => Worker | null;
  getState: () => ClientState;
  getMessageQueue: () => ClientEvent[];
  externalSubscription: Subscription<WorkerEvent>;
};

const initialClientState: ClientState = {
  status: clientStatusKeywords.waitingForReady,
  messageQueue: [] as ClientEvent[],
};

const clientHandlers: EventHandlerMap<
  WorkerEvent,
  ClientEffect,
  ClientState,
  ClientHandlerContext
> = {
  [eventKeywords.workerReady]: (_state, _event, ctx) => {
    // Update state to ready
    ctx.updateState((state) => ({
      ...state,
      status: clientStatusKeywords.ready,
    }));

    return [
      {
        type: effectKeywords.client.log,
        message: "Worker is ready! Flushing queued messages...",
      },
      {
        type: effectKeywords.client.flushQueue,
      },
    ];
  },

  [eventKeywords.taskProgress]: (_state, _event) => {
    return [
      //   {
      //     type: effectKeywords.client.log,
      //     message: `Progress: ${event.taskName} [${event.taskId}]`,
      //   },
    ];
  },

  [eventKeywords.taskComplete]: (_state, event) => {
    return [
      {
        type: effectKeywords.client.log,
        message: `Complete: ${event.taskName} [${event.taskId}]`,
      },
    ];
  },

  [eventKeywords.taskError]: (_state, event) => {
    return [
      {
        type: effectKeywords.client.log,
        message: `Error: ${event.taskName} [${event.taskId}] - ${event.error}`,
      },
    ];
  },
};

// ============================================
// Client Effect Executors
// ============================================

const clientExecutors: EffectExecutorMap<
  ClientEffect,
  WorkerEvent,
  ClientExecutorContext
> = {
  [effectKeywords.client.forwardToWorker]: (effect, ctx) => {
    const { event } = effect as { event: ClientEvent };
    const worker = ctx.getWorker();
    const state = ctx.getState();
    const messageQueue = ctx.getMessageQueue();

    if (state.status === clientStatusKeywords.ready && worker) {
      console.log("[Client] Forwarding to worker:", event.type);
      worker.postMessage(event);
    } else if (
      state.status === clientStatusKeywords.initializing ||
      state.status === clientStatusKeywords.waitingForReady
    ) {
      console.log("[Client] Queueing message (worker not ready):", event.type);
      messageQueue.push(event);
    } else {
      console.error("[Client] Cannot forward - worker status:", state.status);
    }
  },

  [effectKeywords.client.log]: (effect) => {
    const { message } = effect as { message: string };
    console.log(`[Client] ${message}`);
  },

  [effectKeywords.client.flushQueue]: (_effect, ctx) => {
    const worker = ctx.getWorker();
    const messageQueue = ctx.getMessageQueue();
    const state = ctx.getState();

    if (
      state.status === clientStatusKeywords.ready &&
      worker &&
      messageQueue.length > 0
    ) {
      console.log(`[Client] Flushing ${messageQueue.length} queued messages`);
      messageQueue.forEach((event) => {
        // Extract transferables if present
        const { transferables, ...eventWithoutTransferables } = event;
        if (transferables && transferables.length > 0) {
          console.log(
            `[Client] Transferring ${transferables.length} queued object(s)`,
          );
          worker.postMessage(eventWithoutTransferables, transferables);
        } else {
          worker.postMessage(eventWithoutTransferables);
        }
      });
      messageQueue.length = 0;
    }
  },
};

type ClientTaskSubscription<TTasks, TName extends keyof TTasks> = {
  taskId: string;
  taskName: TName;
  onProgress: (
    callback: (progress: InferProgress<TTasks[TName]>) => void,
  ) => ClientTaskSubscription<TTasks, TName>;
  onComplete: (
    callback: (output: InferOutput<TTasks[TName]>) => void,
  ) => ClientTaskSubscription<TTasks, TName>;
  onError: (
    callback: (error: string) => void,
  ) => ClientTaskSubscription<TTasks, TName>;
  unsubscribe: () => void;
};

/**
 * Create client braided resource for worker tasks
 */
export function createClientResource<TTasks extends TaskRegistry>(
  workerImport: WorkerImportFn,
  _tasks: TTasks,
) {
  return defineResource({
    dependencies: [],
    start: () => {
      type TaskName = keyof TTasks;
      let worker: Worker | null = null;
      const workerSubscriptions = createSubscription<WorkerEvent>();
      const clientState = createAtom(initialClientState);

      // ============================================
      // Create Client Event Loop
      // ============================================

      const createClientLoop = emergentSystem<
        WorkerEvent,
        ClientEffect,
        ClientState,
        ClientHandlerContext,
        ClientExecutorContext
      >();

      const clientLoop = createClientLoop({
        getState: clientState.get,
        handlers: clientHandlers,
        executors: clientExecutors,
        handlerContext: {
          updateState: clientState.update,
        },
        executorContext: {
          getWorker: () => worker,
          getState: clientState.get,
          getMessageQueue: () => clientState.get().messageQueue,
          externalSubscription: workerSubscriptions,
        },
      });

      // ============================================
      // Worker Message Handler
      // ============================================

      const handleWorkerMessage = (event: MessageEvent<WorkerEvent>): void => {
        const workerEvent = event.data;
        // console.log("[Client] Received from worker:", workerEvent.type);

        // Dispatch to emergent loop
        clientLoop.dispatch(workerEvent);

        // Notify external subscribers
        workerSubscriptions.notify(workerEvent);
      };

      // ============================================
      // Initialize Worker
      // ============================================

      const init = async (): Promise<void> => {
        try {
          console.log("[Client] Initializing worker...");
          clientState.update((state) => ({
            ...state,
            status: clientStatusKeywords.initializing,
          }));

          // Use the provided worker import function
          const WorkerModule = await workerImport();
          worker = new WorkerModule.default();

          // Setup event handlers
          worker.onmessage = handleWorkerMessage;
          worker.onerror = (error: ErrorEvent) => {
            console.error("[Client] Worker error:", error.message);
            clientState.update((state) => ({
              ...state,
              status: clientStatusKeywords.error,
            }));
          };

          clientState.update((state) => ({
            ...state,
            status: clientStatusKeywords.waitingForReady,
          }));
          console.log(
            "[Client] ⏳ Worker created, waiting for ready signal...",
          );
        } catch (error) {
          console.error("[Client] Failed to initialize worker:", error);
          clientState.update((state) => ({
            ...state,
            status: clientStatusKeywords.error as ClientStatus,
          }));
        }
      };

      // ============================================
      // Public API
      // ============================================

      /**
       * Provides typed callbacks and automatic cleanup
       */
      type TaskSubscription<TName extends TaskName> = ClientTaskSubscription<
        TTasks,
        TName
      >;

      // Dispatch task request and return subscription object
      const dispatch = <TName extends TaskName>(
        taskName: TName,
        input: InferInput<TTasks[TName]>,
        transferables?: Transferable[],
      ): TaskSubscription<TName> => {
        const taskId = generateTaskId();
        const event: ClientEvent = {
          type: eventKeywords.taskRequest,
          taskId,
          taskName: taskName as string,
          input,
          transferables, // Store transferables with event
        };

        const state = clientState.get();
        if (state.status === clientStatusKeywords.ready && worker) {
          console.log("[Client] Dispatching task:", taskName, taskId);
          // Extract transferables for postMessage
          const { transferables: xfer, ...eventWithoutTransferables } = event;
          if (xfer && xfer.length > 0) {
            console.log(
              `[Client] Transferring ${xfer.length} object(s):`,
              xfer.map((t) => t.constructor.name),
            );
            worker.postMessage(eventWithoutTransferables, xfer);
          } else {
            worker.postMessage(eventWithoutTransferables);
          }
        } else if (
          state.status === clientStatusKeywords.initializing ||
          state.status === clientStatusKeywords.waitingForReady
        ) {
          console.log(
            "[Client] Queueing task (worker not ready):",
            taskName,
            taskId,
          );
          clientState.update((state) => ({
            ...state,
            messageQueue: [...state.messageQueue, event],
          }));
        } else {
          console.error(
            "[Client] Cannot dispatch - worker status:",
            state.status,
          );
        }

        // Track unsubscribe functions for cleanup
        // const unsubscribers: Array<() => void> = [];

        const dispatchSubscription = createSubscription<void>();

        // Track terminal event delivery (complete or error)
        // We need to know if a terminal event has been received
        let terminalEventReceived = false;
        const callbacksAtom = createAtom({
          pending: {
            complete: 0,
            error: 0,
          },
          fired: {
            complete: 0,
            error: 0,
          },
        });

        // Auto-cleanup helper: unsubscribe after all callbacks have fired
        const maybeAutoCleanup = (
          callbacks: AtomState<typeof callbacksAtom>,
        ) => {
          if (!terminalEventReceived) return;

          // Check if all complete callbacks have fired (if any were registered)
          const allCompleteFired =
            callbacks.pending.complete === 0 ||
            callbacks.fired.complete === callbacks.pending.complete;

          // Check if all error callbacks have fired (if any were registered)
          const allErrorFired =
            callbacks.pending.error === 0 ||
            callbacks.fired.error === callbacks.pending.error;

          // Only auto-cleanup if we've delivered to all registered callbacks of the terminal type
          if (allCompleteFired && allErrorFired) {
            console.log(
              "[Client] All callbacks fired, auto-cleaning up subscription",
            );
            subscription.unsubscribe();
          }
        };

        // Create subscription object
        const subscription: TaskSubscription<TName> = {
          taskId,
          taskName,

          onProgress: (callback) => {
            const unsubscribe = workerSubscriptions.subscribe((event) => {
              if (
                event.type === eventKeywords.taskProgress &&
                event.taskId === taskId
              ) {
                callback(event.progress as InferProgress<TTasks[TName]>);
              }
            });
            dispatchSubscription.subscribe(unsubscribe);
            return subscription;
          },

          onComplete: (callback) => {
            // Register this callback
            callbacksAtom.update((state) => ({
              ...state,
              pending: {
                ...state.pending,
                complete: state.pending.complete + 1,
              },
            }));

            const unsubscribe = workerSubscriptions.subscribe((event) => {
              if (
                event.type === eventKeywords.taskComplete &&
                event.taskId === taskId
              ) {
                terminalEventReceived = true;
                callback(event.output as InferOutput<TTasks[TName]>);

                // Mark this callback as fired
                callbacksAtom.update((state) => ({
                  ...state,
                  fired: {
                    ...state.fired,
                    complete: state.fired.complete + 1,
                  },
                }));

                // Maybe cleanup after ALL callbacks have fired
                maybeAutoCleanup(callbacksAtom.get());
              }
            });
            dispatchSubscription.subscribe(unsubscribe);
            return subscription;
          },

          onError: (callback) => {
            // Register this callback
            callbacksAtom.update((state) => ({
              ...state,
              pending: {
                ...state.pending,
                error: state.pending.error + 1,
              },
            }));

            const unsubscribe = workerSubscriptions.subscribe((event) => {
              if (
                event.type === eventKeywords.taskError &&
                event.taskId === taskId
              ) {
                terminalEventReceived = true;
                callback(event.error);

                // Mark this callback as fired
                callbacksAtom.update((state) => ({
                  ...state,
                  fired: {
                    ...state.fired,
                    error: state.fired.error + 1,
                  },
                }));

                // Maybe cleanup after ALL callbacks have fired
                maybeAutoCleanup(callbacksAtom.get());
              }
            });
            dispatchSubscription.subscribe(unsubscribe);
            return subscription;
          },

          unsubscribe: () => {
            dispatchSubscription.clear();
          },
        };

        return subscription;
      };

      // Terminate worker
      const terminate = (): void => {
        if (worker) {
          console.log("[Client] Terminating worker...");
          worker.terminate();
          worker = null;
          clientState.update((state) => ({
            ...state,
            status: clientStatusKeywords.terminated as ClientStatus,
            messageQueue: [],
          }));
          workerSubscriptions.clear();
          console.log("[Client] Worker terminated");
          clientLoop.dispose();
        }
      };

      type HookState<TName extends TaskName> = {
        progress: InferProgress<TTasks[TName]> | undefined;
        output: InferOutput<TTasks[TName]> | undefined;
        error: string | undefined;
        isLoading: boolean;
      };
      const initialState: HookState<any> = {
        progress: undefined,
        output: undefined,
        error: undefined,
        isLoading: false,
      };
      const useTaskDispatcher = <TName extends TaskName>(taskName: TName) => {
        const subscriptionRef = useRef<TaskSubscription<TName> | null>(null);
        const [state, setState, stateRef] =
          useRefState<HookState<TName>>(initialState);

        // Cleanup on unmount
        useEffect(() => {
          return () => {
            subscriptionRef.current?.unsubscribe();
          };
        }, []);

        const reset = useCallback(
          (loading = false) => {
            subscriptionRef.current?.unsubscribe();
            setState((state) => ({
              ...state,
              isLoading: loading,
            }));
          },
          [setState],
        );

        const dispatchTask = useCallback(
          (
            input: InferInput<TTasks[TName]>,
            transferables?: Transferable[],
          ) => {
            reset(true);

            // Create new subscription
            const sub = dispatch(taskName, input, transferables);
            subscriptionRef.current = sub;

            sub
              .onProgress((progress) => {
                stateRef.current.progress = progress;
                setState((state) => ({
                  ...state,
                  progress: progress,
                }));
              })
              .onComplete((output) => {
                console.log("received output through hook ", output);
                stateRef.current.output = output;
                stateRef.current.isLoading = false;
                setState((state) => ({
                  ...state,
                  output: output,
                  isLoading: false,
                }));
              })
              .onError((error) => {
                stateRef.current.error = error;
                stateRef.current.isLoading = false;
                setState((state) => ({
                  ...state,
                  error: error,
                  isLoading: false,
                }));
              });

            return sub;
          },
          [reset, setState, stateRef, taskName],
        );

        return {
          progress: state.progress,
          output: state.output,
          error: state.error,
          isLoading: state.isLoading,
          stateRef,
          dispatch: dispatchTask,
          reset,
        };
      };

      // Initialize immediately
      init();

      const api = {
        dispatch,
        subscribe: workerSubscriptions.subscribe,
        getStatus: () => clientState.get().status,
        terminate,
        useTaskDispatcher,
      };

      return api;
    },
    halt: (api) => {
      console.log("🛑 [Client Resource] Halting...");
      api.terminate();
    },
  });
}

/**
 * Create client resource for worker tasks
 *
 * This should be used in the client code.
 *
 * @param workerImport - Function that returns a promise of the worker module
 * @param tasks - Task registry (for type inference)
 * @returns Client resource
 *
 * @example
 * ```typescript
 * // In client code
 * import { createWorkerClientResource } from "@/lib/workerTasks";
 * import { tasks } from "./myTasks";
 *
 * export const myWorkerClient = createWorkerClientResource(
 *   () => import("@/workers/myWorker?worker"),
 *   tasks
 * );
 * ```
 */
export function createWorkerClientResource<T extends TaskRegistry>(
  workerImport: WorkerImportFn,
  tasks: T,
) {
  return createClientResource(workerImport, tasks);
}
