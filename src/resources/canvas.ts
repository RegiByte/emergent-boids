import { defineResource } from "braided";
import type { StartedRuntimeStore } from "./runtimeStore";

export type CanvasAPI = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  resize: (_newWidth: number, _newHeight: number) => void;
};

export const canvas = defineResource({
  dependencies: ["runtimeStore"],
  start: ({ runtimeStore }: { runtimeStore: StartedRuntimeStore }) => {
    const store = runtimeStore.store;
    const state = store.getState();
    const canvasWidth = state.config.world.canvasWidth;
    const canvasHeight = state.config.world.canvasHeight;

    // Create canvas element
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    canvas.classList.add(
      // "border-2",
      // "border-green-500",
      "absolute",
      "top-[50%]",
      "left-[50%]",
      "translate-x-[-50%]",
      "translate-y-[-50%]"
    );

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }

    // Create the resource object
    const resource = {
      canvas,
      ctx,
      width: canvasWidth,
      height: canvasHeight,
      resize: (newWidth: number, newHeight: number) => {
        // Update canvas dimensions
        canvas.width = newWidth;
        canvas.height = newHeight;
        resource.width = newWidth;
        resource.height = newHeight;

        // Update runtime store dimensions so boids know the new boundaries
        store.setState({
          config: {
            ...store.getState().config,
            world: {
              ...store.getState().config.world,
              canvasWidth: newWidth,
              canvasHeight: newHeight,
            },
          },
        });
      },
    } satisfies CanvasAPI;

    return resource;
  },
  halt: ({ canvas }: CanvasAPI) => {
    // Remove canvas from DOM if it's attached
    canvas.remove();
  },
});
