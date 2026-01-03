import { localBoidStore } from "@/resources/browser/localBoidStore.ts";
import { frameRater } from "@/resources/shared/frameRater.ts";
import { sharedMemoryManager } from "@/resources/shared/sharedMemoryManager.ts";
import { createSystemHooks, createSystemManager } from "braided-react";
import { analytics } from "../resources/browser/analytics.ts";
import { analyticsStore } from "../resources/browser/analyticsStore.ts";
import { atlases } from "../resources/browser/atlases.ts";
import { atmosphere } from "../resources/browser/atmosphere.ts";
import { camera } from "../resources/browser/camera.ts";
import { canvas } from "../resources/browser/canvas.ts";
import { engine } from "../resources/browser/engine.ts";
import { lifecycleManager } from "../resources/browser/lifecycleManager.ts";
import { profileStore } from "../resources/browser/profileStore.ts";
import { renderer } from "../resources/browser/renderer.ts";
import { runtimeController } from "../resources/browser/runtimeController.ts";
import { runtimeStore } from "../resources/browser/runtimeStore.ts";
import { webglRenderer } from "../resources/browser/webglRenderer.ts";
import { profiler } from "../resources/shared/profiler.ts";
import { randomness } from "../resources/shared/randomness.ts";
import { time } from "../resources/shared/time.ts";
import { timer } from "../resources/shared/timer.ts";

export const systemConfig = {
  sharedMemoryManager,
  localBoidStore,
  time,
  frameRater,
  timer,
  atlases,
  runtimeStore,
  analyticsStore,
  profileStore,
  randomness,
  runtimeController,
  canvas,
  camera,
  engine,
  lifecycleManager,
  analytics,
  atmosphere,
  renderer,
  webglRenderer,
  profiler,
};

export const manager = createSystemManager(systemConfig);
export const { useResource, useSystem } = createSystemHooks(manager);
