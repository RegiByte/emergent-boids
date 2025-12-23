import { createSystemHooks, createSystemManager } from "braided-react";
import { timer } from "./resources/timer";
import { runtimeStore } from "./resources/runtimeStore";
import { randomness } from "./resources/randomness";
import { runtimeController } from "./resources/runtimeController";
import { canvas } from "./resources/canvas";
import { engine } from "./resources/engine";
import { lifecycleManager } from "./resources/lifecycleManager";
import { analytics } from "./resources/analytics";
import { atmosphere } from "./resources/atmosphere";
import { renderer } from "./resources/renderer";
import { profiler } from "./resources/profiler";

export const systemConfig = {
  timer,
  runtimeStore,
  randomness,
  runtimeController,
  canvas,
  engine,
  lifecycleManager,
  analytics,
  atmosphere,
  renderer,
  profiler,
};

export const manager = createSystemManager(systemConfig);
export const { useResource, useSystem } = createSystemHooks(manager);
