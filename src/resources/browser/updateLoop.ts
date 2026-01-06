import { defineResource, StartedResource } from "braided";
import { FrameRaterAPI } from "../shared/frameRater";
import { createSubscription, SubscriptionCallback } from "@/lib/state";
import { BoidEngine } from "./engine";
import { TimeAPI } from "../shared/time";
import z from "zod";
import { allEventSchema } from "@/boids/vocabulary/schemas/events";
import { RuntimeController } from "./runtimeController";
import { eventKeywords } from "@/boids/vocabulary/keywords";
import { createUpdateLoop } from "@/lib/updateLoop";

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

export const updateLoopResource = defineResource({
  dependencies: ["frameRater", "engine", "time", "runtimeController"],
  start: ({
    frameRater,
    engine,
    time,
    runtimeController,
  }: {
    frameRater: FrameRaterAPI;
    engine: BoidEngine;
    time: TimeAPI;
    runtimeController: RuntimeController;
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

    const updateLoop = createUpdateLoop({
      onStart: () => {
        console.log("[UpdateLoop] Started");
        time.resume();
      },
      onStop: () => {
        console.log("[UpdateLoop] Stopped");
      },
      onUpdate: (_deltaMs, scaledDeltaMs, clockDeltaMs) => {
        animate(scaledDeltaMs, clockDeltaMs);
      },
      onStep: (deltaTime, scaledDeltaMs) => {
        console.log("[UpdateLoop] Stepping", deltaTime, scaledDeltaMs);
        time.step();
      },
      onPause: () => {
        console.log("[UpdateLoop] Paused");
        // Should be noop, update loop never stops
      },
      getDefaultTimestep: () => {
        return simulationRater.getTimestep();
      },
      getTimeScale: () => {
        // default to 1x
        return time.getState().timeScale;
      },
    });

    const lifecycleRater = frameRater.throttled("lifecycle", {
      intervalMs: 1000, // 1 Hz (every 1 second)
    });

    const catchesRater = frameRater.throttled("catches", {
      intervalMs: 100, // 10 Hz
    });

    const updateSubscription = createSubscription<UpdateLoopFrameUpdate>();
    const lifecycleSubscription = createSubscription<UpdateLoopEventUpdate>();
    const animate = (scaledDeltaMs: number, _clockDeltaMs: number) => {
      // console.log("animate", scaledDeltaMs, clockDeltaMs);
      // if (!isRunning) return;

      // const currentTime = timestamp;
      // const realDeltaMs = currentTime - lastFrameTime;
      // lastFrameTime = currentTime;

      if (!time.getState().isPaused) {
        // Apply time scale
        // const timeState = time.getState();
        // const scaledDeltaMs = realDeltaMs * timeState.timeScale;

        // Fixed timestep simulation (deterministic)
        const { updates, timestep, droppedFrames } =
          simulationRater.shouldUpdate(scaledDeltaMs);

        for (let i = 0; i < updates; i++) {
          engine.update(timestep); // timestep already in seconds!
          time.tick();

          updateSubscription.notify({
            type: "frame",
            frame: time.getFrame(),
            fps: Math.round(simulationRater.getMetrics().fps),
            simulationTime: time.getSimulationTime(),
          });
        }
        // Record execution for metrics
        simulationRater.recordExecution(updates, droppedFrames);

        // renderer.drawFrame(
        //   clockDeltaMs,
        //   Math.round(simulationRater.getMetrics().fps)
        // );

        if (lifecycleRater.shouldExecute(scaledDeltaMs)) {
          runtimeController.dispatch({
            type: eventKeywords.time.passed,
            deltaMs: 1000,
          });
          lifecycleRater.recordExecution();
        }

        if (catchesRater.shouldExecute(scaledDeltaMs)) {
          const events = engine.checkCatches();
          for (const event of events) {
            // TODO: move this somewhere else
            runtimeController.dispatch(event);
          }
          catchesRater.recordExecution();
        }

        // console.log("animated");
      }

      // Update 1 frame worth of time when step is requested
      if (time.getState().stepRequested) {
        const timestep = simulationRater.getTimestep() / 1000;
        console.log("[UpdateLoop] Stepping", timestep);
        engine.update(timestep); // timestep already in seconds!
        time.tick();

        updateSubscription.notify({
          type: "frame",
          frame: time.getFrame(),
          fps: Math.round(simulationRater.getMetrics().fps),
          simulationTime: time.getSimulationTime(),
        });
        // Record execution for metrics
        simulationRater.recordExecution(1, 0);
        time.clearStepRequest();
      }

      // renderer.drawFrame(
      //   clockDeltaMs,
      //   Math.round(simulationRater.getMetrics().fps)
      // );

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
      lifecycleRater.reset();

      console.log("[UpdateLoop] Stopped");
    };

    const pause = () => {
      // isPaused = true;
      // updateLoop.pause();
      time.pause();
      // console.log("[UpdateLoop] Paused");
    };

    const resume = () => {
      // isPaused = false;
      console.log("[UpdateLoop] Resuming");
      time.resume();
      // console.log("[UpdateLoop] Resumed");
    };

    const step = () => {
      // Use configured timestep if not provided
      // const timestep = deltaTime ?? simulationRater.getTimestep() / 1000;
      // engine.update(timestep);
      // time.tick();
      time.step();

      console.log("[UpdateLoop] Stepped");
    };

    const api = {
      start,
      stop,
      pause,
      resume,
      step,
      isRunning: () => updateLoop.isRunning(),
      isPaused: () => time.getState().isPaused,
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

export type UpdateLoopResource = StartedResource<typeof updateLoopResource>;
