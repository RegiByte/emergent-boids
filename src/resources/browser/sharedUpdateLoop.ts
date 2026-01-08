import { allEventSchema } from "@/boids/vocabulary/schemas/events";
import { createSubscription, SubscriptionCallback } from "@/lib/state";
import { createUpdateLoop } from "@/lib/updateLoop";
import { defineResource, StartedResource } from "braided";
import z from "zod";
import { FrameRaterAPI } from "../shared/frameRater";
import { TimeAPI } from "../shared/time";
import { SharedEngineResource } from "./sharedEngine";

export const updateLoopUpdateSchema = z.discriminatedUnion("type", [
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

export type UpdateLoopUpdate = z.infer<typeof updateLoopUpdateSchema>;
export type UpdateLoopFrameUpdate = Extract<
  UpdateLoopUpdate,
  { type: "frame" }
>;
export type UpdateLoopEventUpdate = Extract<
  UpdateLoopUpdate,
  { type: "event" }
>;

export const sharedUpdateLoop = defineResource({
  dependencies: ["frameRater", "engine", "time"],
  start: ({
    frameRater,
    engine: _engine,
    time,
  }: {
    frameRater: FrameRaterAPI;
    engine: SharedEngineResource;
    time: TimeAPI;
  }) => {
    // let animationId: number | null = null;
    // let isRunning = false;
    // let isPaused = false;
    // let lastFrameTime = performance.now();

    // Create executors using frameRater factory
    const simulationRater = frameRater.fixed("simulation", {
      targetFPS: 30, // 30 UPS for deterministic physics
      maxUpdatesPerFrame: 3, // Max 3 catch-up frames
      maxAccumulatedTime: 167, // 5 frames worth (167ms) prevents spiral of death
    });
    const lifecycleRater = frameRater.throttled("lifecycle", {
      intervalMs: 1000, // 1 Hz (every 1 second)
    });

    const updateLoop = createUpdateLoop({
      onStart: () => {
        console.log("[SharedUpdateLoop] Started");
      },
      onStop: () => {
        console.log("[SharedUpdateLoop] Stopped");
      },
      onUpdate: (_deltaMs, _scaledDeltaMs, clockDeltaMs) => {
        animate(clockDeltaMs);
      },
      onPause: () => {
        console.log("[SharedUpdateLoop] Paused");
      },
      getDefaultTimestep: () => {
        return simulationRater.getTimestep() / 1000;
      },
      getTimeScale: () => {
        return time.getState().timeScale;
      },
      onStep: (_deltaTime, _scaledDeltaMs) => {
        console.log("[SharedUpdateLoop] Stepping", _deltaTime, _scaledDeltaMs);
      },
    });

    const updateSubscription = createSubscription<UpdateLoopFrameUpdate>();
    const lifecycleSubscription = createSubscription<UpdateLoopEventUpdate>();

    // Subscribe to worker events and forward to runtime controller
    // const workerEventUnsubscribe = engine.watch(
    //   (event) => {
    //     // Forward all worker events to runtime controller
    //     runtimeController.dispatch(event);

    //     // Also notify our subscribers
    //     lifecycleSubscription.notify({
    //       type: "event",
    //       event,
    //     });
    //   }
    // );

    const animate = (_timestamp: number) => {
       // No-op for this update loop
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
      //     `[UpdateLoop] Started (Simulation: ${_targetFps} FPS, Lifecycle: 1 Hz)`
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
      updateLoop.stop();
      updateSubscription.clear();
      lifecycleSubscription.clear();

      // Reset executors for clean restart
      simulationRater.reset();

      // Unsubscribe from worker events
      // workerEventUnsubscribe();

      console.log("[SharedUpdateLoop] Stopped");
    };

    const pause = () => {
      // isPaused = true;
      updateLoop.pause();
      // console.log("[SharedUpdateLoop] Paused");
    };

    const resume = () => {
      // isPaused = false;
      updateLoop.start();
      // console.log("[SharedUpdateLoop] Resumed");
    };

    const step = (_deltaTime?: number) => {
      // Use configured timestep if not provided
      console.warn("[SharedUpdateLoop] Step not implemented");
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

export type SharedUpdateLoopResource = StartedResource<typeof sharedUpdateLoop>;
