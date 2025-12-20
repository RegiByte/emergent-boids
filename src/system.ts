import { createSystemHooks, createSystemManager } from "braided-react";
import { config } from "./resources/config";
import { runtimeStore } from "./resources/runtimeStore";
import { runtimeController } from "./resources/runtimeController";
import { canvas } from "./resources/canvas";
import { engine } from "./resources/engine";
import { renderer } from "./resources/renderer";

export const systemConfig = {
  config,
  runtimeStore,
  runtimeController,
  canvas,
  engine,
  renderer,
};

export const manager = createSystemManager(systemConfig);
export const { useResource, useSystem } = createSystemHooks(manager);
