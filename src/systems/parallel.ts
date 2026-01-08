/**
 * Parallel System Configuration (Session 111)
 *
 * Alternative system configuration that uses SharedArrayBuffer + Worker
 * for parallel boid simulation.
 *
 * Drop-in replacement for system.ts - just swap the engine!
 * All other resources (renderer, lifecycle, analytics) work unchanged.
 */

import { analytics } from "@/resources/browser/analytics.ts";
import { analyticsStore } from "@/resources/browser/analyticsStore.ts";
import { atlases } from "@/resources/browser/atlases.ts";
import { atmosphere } from "@/resources/browser/atmosphere.ts";
import { camera } from "@/resources/browser/camera.ts";
import { canvas } from "@/resources/browser/canvas.ts";
import { profileStore } from "@/resources/browser/profileStore.ts";
import { renderer } from "@/resources/browser/renderer.ts";
import { simulationGateway } from "@/resources/browser/simulationController";
import { runtimeStore } from "@/resources/browser/runtimeStore.ts";
import { webglRenderer } from "@/resources/browser/webglRenderer.ts";
import { profiler } from "@/resources/shared/profiler.ts";
import { randomness } from "@/resources/shared/randomness.ts";
import { time } from "@/resources/shared/time.ts";
import { timer } from "@/resources/shared/timer.ts";
import { createSystemHooks, createSystemManager } from "braided-react";

// NEW: Parallel simulation resources
import { localBoidStore } from "@/resources/browser/localBoidStore";
import { sharedEngine } from "@/resources/browser/sharedEngine.ts";
import { sharedSimulation } from "@/resources/browser/sharedSimulation";
import { sharedUpdateLoop } from "@/resources/browser/sharedUpdateLoop";
import { shortcuts } from "@/resources/browser/shortcuts";
import { workerTasksResource } from "@/resources/browser/workerTasks";
import { createSystemConfigResource } from "@/resources/shared/config.ts";
import { frameRater } from "@/resources/shared/frameRater";
import { sharedMemoryManager } from "@/resources/shared/sharedMemoryManager";

/**
 * Parallel system configuration
 *
 * Only difference from main system: engine → sharedEngine
 * Everything else is identical!
 */
export const parallelSystemConfig = {
  config: createSystemConfigResource({
    renderMode: "canvas",
    usesSharedMemory: true,
  }),
  time,
  timer,
  canvas,
  camera,
  engine: sharedEngine,
  atlases,
  profiler,
  renderer,
  analytics,
  shortcuts,
  atmosphere,
  randomness,
  frameRater,
  updateLoop: sharedUpdateLoop,
  simulation: sharedSimulation,
  profileStore,
  runtimeStore,
  webglRenderer,
  analyticsStore,
  localBoidStore,
  runtimeController: simulationGateway,
  sharedMemoryManager,
  workerTasks: workerTasksResource,
};

export const parallelManager = createSystemManager(parallelSystemConfig);
export const {
  useResource: useParallelResource,
  useSystem: useParallelSystem,
} = createSystemHooks(parallelManager);
