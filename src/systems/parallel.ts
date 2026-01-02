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
import { analytics } from "@/resources/analytics";
import { analyticsStore } from "@/resources/analyticsStore";
import { atmosphere } from "@/resources/atmosphere";
import { atlases } from "@/resources/atlases";
import { camera } from "@/resources/camera";
import { canvas } from "@/resources/canvas";
import { lifecycleManager } from "@/resources/lifecycleManager";
import { profiler } from "@/resources/profiler";
import { profileStore } from "@/resources/profileStore";
import { randomness } from "@/resources/randomness";
import { renderer } from "@/resources/renderer";
import { runtimeController } from "@/resources/runtimeController";
import { runtimeStore } from "@/resources/runtimeStore";
import { time } from "@/resources/time";
import { timer } from "@/resources/timer";
import { webglRenderer } from "@/resources/webglRenderer";

// NEW: Parallel simulation resources
import { sharedEngineTasksResource } from "@/resources/sharedEngineTasks";
import { sharedEngine } from "@/resources/sharedEngine";

/**
 * Parallel system configuration
 * 
 * Only difference from main system: engine → sharedEngine
 * Everything else is identical!
 */
export const parallelSystemConfig = {
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
  sharedEngineTasks: sharedEngineTasksResource,
  
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
export const { useResource: useParallelResource, useSystem: useParallelSystem } =
  createSystemHooks(parallelManager);

