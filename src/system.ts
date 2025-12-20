import { createSystemHooks, createSystemManager } from "braided-react";
import { config } from "./resources/config";
import { timer } from "./resources/timer";
import { runtimeStore } from "./resources/runtimeStore";
import { runtimeController } from "./resources/runtimeController";
import { canvas } from "./resources/canvas";
import { engine } from "./resources/engine";
import { energyManager } from "./resources/energyManager";
import { renderer } from "./resources/renderer";

export const systemConfig = {
  config,
  timer,
  runtimeStore,
  runtimeController,
  canvas,
  engine,
  energyManager,
  renderer,
};

export const manager = createSystemManager(systemConfig);
export const { useResource, useSystem } = createSystemHooks(manager);
