import { allEventSchema } from "@/boids/vocabulary/schemas/events";
import { createSubscription, SubscriptionCallback } from "@/lib/state";
import { defineResource, StartedResource } from "braided";
import z from "zod";
import { TimeAPI } from "../shared/time";
import { FrameRaterAPI } from "../shared/frameRater";
import { WorkerEngineResource } from "./workerEngine";
import { WorkerLifecycleManagerResource } from "./workerLifecycleManager";
import { createUpdateLoop } from "@/lib/updateLoop";

export const workerLoopUpdateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("frame"),
    frame: z.number(),
    fps: z.number(),
    simulationTime: z.number(),
  }),
  z.object({
    type: z.literal("event"),
    event: allEventSchema,
  }),
]);

export type WorkerLoopUpdate = z.infer<typeof workerLoopUpdateSchema>;
export type WorkerLoopFrameUpdate = Extract<
  WorkerLoopUpdate,
  { type: "frame" }
>;
export type WorkerLoopEventUpdate = Extract<
  WorkerLoopUpdate,
  { type: "event" }
>;

/**
 * Worker Update Loop Resource
 *
 * Equivalent to renderer.ts on main thread.
 * Manages the RAF animation loop and delegates to workerEngine.
 *
 * Uses frameRater for timing:
 * - Fixed timestep for simulation (30 UPS, deterministic)
 * - Throttled executor for lifecycle (1 Hz, periodic)
 */
export const workerUpdateLoop = defineResource({
  dependencies: [
    "workerEngine",
    "workerTime",
    "workerLifecycleManager",
    "workerFrameRater",
  ],
  start: ({
    workerEngine,
    workerTime,
    workerLifecycleManager,
    workerFrameRater,
  }: {
    workerEngine: WorkerEngineResource;
    workerTime: TimeAPI;
    workerLifecycleManager: WorkerLifecycleManagerResource;
    workerFrameRater: FrameRaterAPI;
  }) => {
    // let animationId: number | null = null;
    // let isRunning = false;
    // let isPaused = false;
    // let lastFrameTime = performance.now();

    // Create executors using frameRater factory
    const simulationRater = workerFrameRater.fixed("simulation", {
      targetFPS: 30, // 30 UPS for deterministic physics
      maxUpdatesPerFrame: 3, // Max 3 catch-up frames
      maxAccumulatedTime: 167, // 5 frames worth (167ms) prevents spiral of death
    });

    const updateLoop = createUpdateLoop({
      onStart: () => {
        console.log("[WorkerUpdateLoop] Started");
      },
      onStop: () => {
        console.log("[WorkerUpdateLoop] Stopped");
      },
      onUpdate: (_deltaMs, scaledDeltaMs, clockDeltaMs) => {
        animate(scaledDeltaMs, clockDeltaMs);
      },
      onPause: () => {
        console.log("[WorkerUpdateLoop] Paused");
      },
      getDefaultTimestep: () => {
        return simulationRater.getTimestep() / 1000;
      },
      getTimeScale: () => {
        return workerTime.getState().timeScale;
      },
    });

    const lifecycleRater = workerFrameRater.throttled("lifecycle", {
      intervalMs: 1000, // 1 Hz (every 1 second)
    });

    const catchesRater = workerFrameRater.throttled("catches", {
      intervalMs: 100, // 10 Hz
    });

    const updateSubscription = createSubscription<WorkerLoopFrameUpdate>();
    const lifecycleSubscription = createSubscription<WorkerLoopEventUpdate>();

    const animate = (scaledDeltaMs: number, _clockDeltaMs: number) => {
      // if (!isRunning) return;

      // const currentTime = timestamp;
      // const realDeltaMs = currentTime - lastFrameTime;
      // lastFrameTime = currentTime;

      // if (!isPaused) {
      // Apply time scale
      // const timeState = workerTime.getState();
      // const scaledDeltaMs = realDeltaMs * timeState.timeScale;

      // Fixed timestep simulation (deterministic)
      const { updates, timestep, droppedFrames } =
        simulationRater.shouldUpdate(scaledDeltaMs);

      for (let i = 0; i < updates; i++) {
        workerEngine.update(timestep); // timestep already in seconds!
        workerTime.tick();

        updateSubscription.notify({
          type: "frame",
          frame: workerTime.getFrame(),
          fps: Math.round(simulationRater.getMetrics().fps),
          simulationTime: workerTime.getSimulationTime(),
        });
      }

      // Record execution for metrics
      simulationRater.recordExecution(updates, droppedFrames);

      // Throttled lifecycle updates (1 Hz)
      if (lifecycleRater.shouldExecute(scaledDeltaMs)) {
        const events = workerLifecycleManager.update(1.0); // 1 second per tick
        events.forEach((event) => {
          lifecycleSubscription.notify({
            type: "event",
            event,
          });
        });
        lifecycleRater.recordExecution();
      }

      if (catchesRater.shouldExecute(scaledDeltaMs)) {
        const events = workerEngine.checkCatches();
        events.forEach((event) => {
          lifecycleSubscription.notify({
            type: "event",
            event,
          });
        });
      }
      // }

      // animationId = requestAnimationFrame(animate);
    };

    const start = (
      _targetFps: number,
      onUpdateEngine: SubscriptionCallback<typeof updateSubscription>,
      onUpdateLifecycle: SubscriptionCallback<typeof lifecycleSubscription>
    ) => {
      // Update simulation target FPS (affects timing calculations)
      simulationRater.setConfig({ targetFPS: _targetFps });
      updateLoop.start();

      // if (!isRunning) {
      //   isRunning = true;
      //   isPaused = false;
      //   lastFrameTime = performance.now();
      //   animationId = requestAnimationFrame(animate);
      //   console.log(
      //     `[WorkerUpdateLoop] Started (Simulation: ${_targetFps} FPS, Lifecycle: 1 Hz)`
      //   );
      // }
      updateSubscription.subscribe(onUpdateEngine);
      lifecycleSubscription.subscribe(onUpdateLifecycle);
    };

    const stop = () => {
      // if (animationId !== null) {
      //   cancelAnimationFrame(animationId);
      //   animationId = null;
      // }
      // isRunning = false;
      updateSubscription.clear();
      lifecycleSubscription.clear();

      // Reset executors for clean restart
      simulationRater.reset();
      lifecycleRater.reset();

      console.log("[WorkerUpdateLoop] Stopped");
    };

    const pause = () => {
      // isPaused = true;
      updateLoop.pause();
      console.log("[WorkerUpdateLoop] Paused");
    };

    const resume = () => {
      // isPaused = false;
      updateLoop.start();
      console.log("[WorkerUpdateLoop] Resumed");
    };

    const step = (deltaTime?: number) => {
      // Use configured timestep if not provided
      // const timestep = deltaTime ?? simulationRater.getTimestep() / 1000;
      // workerEngine.update(timestep);
      // workerTime.tick();
      updateLoop.step(deltaTime);
    };

    const api = {
      start,
      stop,
      pause,
      resume,
      step,
      isRunning: () => updateLoop.isRunning(),
      isPaused: () => updateLoop.isPaused(),
      getMetrics: () => ({
        simulation: simulationRater.getMetrics(),
        lifecycle: lifecycleRater.getMetrics(),
      }),
    };

    return api;
  },
  halt: ({ stop }) => {
    stop();
  },
});

export type WorkerUpdateLoopResource = StartedResource<typeof workerUpdateLoop>;
