import { createSystemHooks, createSystemManager } from "braided-react";
import { analytics } from "./resources/analytics";
import { analyticsStore } from "./resources/analyticsStore";
import { atmosphere } from "./resources/atmosphere";
import { atlases } from "./resources/atlases";
import { camera } from "./resources/camera";
import { canvas } from "./resources/canvas";
import { engine } from "./resources/engine";
import { lifecycleManager } from "./resources/lifecycleManager";
import { profiler } from "./resources/profiler";
import { profileStore } from "./resources/profileStore";
import { randomness } from "./resources/randomness";
import { renderer } from "./resources/renderer";
import { runtimeController } from "./resources/runtimeController";
import { runtimeStore } from "./resources/runtimeStore";
import { time } from "./resources/time";
import { timer } from "./resources/timer";
import { webglRenderer } from "./resources/webglRenderer";

export const systemConfig = {
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
