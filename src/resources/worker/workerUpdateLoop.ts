import { allEventSchema } from "@/boids/vocabulary/schemas/events";
import { createSubscription, SubscriptionCallback } from "@/lib/state";
import { defineResource, StartedResource } from "braided";
import z from "zod";
import { TimeAPI } from "../shared/time";
import { WorkerEngineResource } from "./workerEngine";
import { WorkerLifecycleManagerResource } from "./workerLifecycleManager";

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
 */
export const workerUpdateLoop = defineResource({
  dependencies: ["workerEngine", "workerTime", "workerLifecycleManager"],
  start: ({
    workerEngine,
    workerTime,
    workerLifecycleManager,
  }: {
    workerEngine: WorkerEngineResource;
    workerTime: TimeAPI;
    workerLifecycleManager: WorkerLifecycleManagerResource;
  }) => {
    let animationId: number | null = null;
    let isRunning = false;
    let isPaused = false;
    let lastFrameTime = performance.now();
    let targetFps = 60;
    let fps = targetFps;

    const FIXED_UPDATE_RATE = 30; // Updates per second (30 UPS)
    const FIXED_TIMESTEP = 1 / FIXED_UPDATE_RATE; // ~33ms
    const MAX_ACCUMULATED_TIME = FIXED_TIMESTEP * 5; // Prevent spiral of death
    const LIFECYCLE_UPDATE_RATE = 1; // 1 Hz (every 1 second)
    const LIFECYCLE_TIMESTEP = 1 / LIFECYCLE_UPDATE_RATE; // 1 second
    let engineAccumulator = 0;
    let lifecycleAccumulator = 0;

    const updateSubscription = createSubscription<WorkerLoopFrameUpdate>();

    const lifecycleSubscription = createSubscription<WorkerLoopEventUpdate>();

    const animate = (timestamp: number) => {
      if (!isRunning) return;

      const currentTime = timestamp;
      const realDeltaMs = currentTime - lastFrameTime;
      lastFrameTime = currentTime;

      const timeState = workerTime.getState();
      fps = fps * 0.9 + (1000 / realDeltaMs) * 0.1;

      if (!isPaused) {
        // Apply time scale
        const scaledDeltaSeconds = (realDeltaMs / 1000) * timeState.timeScale;
        engineAccumulator += scaledDeltaSeconds;

        // Clamp accumulator to prevent spiral of death
        if (engineAccumulator > MAX_ACCUMULATED_TIME) {
          engineAccumulator = MAX_ACCUMULATED_TIME;
        }

        // Update simulation at fixed rate (may run 0, 1, or multiple times per frame)
        while (engineAccumulator >= FIXED_TIMESTEP) {
          workerEngine.update(FIXED_TIMESTEP);
          workerTime.tick();
          updateSubscription.notify({
            type: "frame",
            frame: workerTime.getFrame(),
            fps: Math.round(fps),
            simulationTime: workerTime.getSimulationTime(),
          });
          engineAccumulator -= FIXED_TIMESTEP;
        }

        // Lifecycle updates
        lifecycleAccumulator += scaledDeltaSeconds;
        while (lifecycleAccumulator >= LIFECYCLE_TIMESTEP) {
          const events = workerLifecycleManager.update(LIFECYCLE_TIMESTEP);
          events.forEach((event) => {
            lifecycleSubscription.notify({
              type: "event",
              event,
            });
          });
          lifecycleAccumulator -= LIFECYCLE_TIMESTEP;
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    const start = (
      _targetFps: number,
      onUpdateEngine: SubscriptionCallback<typeof updateSubscription>,
      onUpdateLifecycle: SubscriptionCallback<typeof lifecycleSubscription>,
    ) => {
      targetFps = _targetFps;
      if (!isRunning) {
        isRunning = true;
        isPaused = false;
        lastFrameTime = performance.now();
        animationId = requestAnimationFrame(animate);
        console.log("[WorkerUpdateLoop] Started");
      }
      updateSubscription.subscribe(onUpdateEngine);
      lifecycleSubscription.subscribe(onUpdateLifecycle);
    };

    const stop = () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      isRunning = false;
      updateSubscription.clear();
      lifecycleSubscription.clear();
      console.log("[WorkerUpdateLoop] Stopped");
    };

    const pause = () => {
      isPaused = true;
      console.log("[WorkerUpdateLoop] Paused");
    };

    const resume = () => {
      isPaused = false;
      console.log("[WorkerUpdateLoop] Resumed");
    };

    const step = (deltaTime: number = FIXED_TIMESTEP) => {
      workerEngine.update(deltaTime);
    };

    return {
      start,
      stop,
      pause,
      resume,
      step,
      isRunning: () => isRunning,
      isPaused: () => isPaused,
    };
  },
  halt: ({ stop }) => {
    stop();
  },
});

export type WorkerUpdateLoopResource = StartedResource<typeof workerUpdateLoop>;
