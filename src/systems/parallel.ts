/**
 * Parallel System Configuration (Session 111)
 *
 * Alternative system configuration that uses SharedArrayBuffer + Worker
 * for parallel boid simulation.
 *
 * Drop-in replacement for system.ts - just swap the engine!
 * All other resources (renderer, lifecycle, analytics) work unchanged.
 */

import { createSystemHooks, createSystemManager } from "braided-react";
import { analytics } from "@/resources/browser/analytics.ts";
import { analyticsStore } from "@/resources/browser/analyticsStore.ts";
import { atmosphere } from "@/resources/browser/atmosphere.ts";
import { atlases } from "@/resources/browser/atlases.ts";
import { camera } from "@/resources/browser/camera.ts";
import { canvas } from "@/resources/browser/canvas.ts";
import { lifecycleManager } from "@/resources/browser/lifecycleManager.ts";
import { profiler } from "@/resources/shared/profiler.ts";
import { profileStore } from "@/resources/browser/profileStore.ts";
import { randomness } from "@/resources/shared/randomness.ts";
import { renderer } from "@/resources/browser/renderer.ts";
import { runtimeController } from "@/resources/browser/runtimeController.ts";
import { runtimeStore } from "@/resources/browser/runtimeStore.ts";
import { time } from "@/resources/shared/time.ts";
import { timer } from "@/resources/shared/timer.ts";
import { webglRenderer } from "@/resources/browser/webglRenderer.ts";

// NEW: Parallel simulation resources
import { engineTasksResource } from "@/resources/browser/sharedEngineTasks";
import { sharedEngine } from "@/resources/browser/sharedEngine.ts";
import { localBoidStore } from "@/resources/browser/localBoidStore";
import { sharedMemoryManager } from "@/resources/shared/sharedMemoryManager";

/**
 * Parallel system configuration
 *
 * Only difference from main system: engine → sharedEngine
 * Everything else is identical!
 */
export const parallelSystemConfig = {
  localBoidStore,
  time,
  timer,
  atlases,
  runtimeStore,
  analyticsStore,
  profileStore,
  randomness,
  runtimeController,
  canvas,
  camera,

  // NEW: Worker tasks resource (auto-creates worker)
  engineTasks: engineTasksResource,
  sharedMemoryManager,
  // REPLACED: Use shared engine instead of main-thread engine
  engine: sharedEngine,
  lifecycleManager,
  analytics,
  atmosphere,
  renderer,
  webglRenderer,
  profiler,
};

export const parallelManager = createSystemManager(parallelSystemConfig);
export const {
  useResource: useParallelResource,
  useSystem: useParallelSystem,
} = createSystemHooks(parallelManager);
