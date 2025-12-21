import { createSystemHooks, createSystemManager } from "braided-react";
import { timer } from "./resources/timer";
import { runtimeStore } from "./resources/runtimeStore";
import { runtimeController } from "./resources/runtimeController";
import { canvas } from "./resources/canvas";
import { engine } from "./resources/engine";
import { lifecycleManager } from "./resources/lifecycleManager";
import { analytics } from "./resources/analytics";
import { renderer } from "./resources/renderer";

export const systemConfig = {
  timer,
  runtimeStore,
  runtimeController,
  canvas,
  engine,
  lifecycleManager,
  analytics,
  renderer,
};

export const manager = createSystemManager(systemConfig);
export const { useResource, useSystem } = createSystemHooks(manager);
