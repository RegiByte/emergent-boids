import { defineResource } from "braided";
import { BoidConfig } from "../boids/types";

export type CanvasResource = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
};

export const canvas = defineResource({
  dependencies: ["config"],
  start: ({ config }: { config: BoidConfig }) => {
    // Create canvas element
    const canvas = document.createElement("canvas");
    canvas.width = config.canvasWidth;
    canvas.height = config.canvasHeight;
    canvas.style.border = "1px solid #333";
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }

    return {
      canvas,
      ctx,
      width: config.canvasWidth,
      height: config.canvasHeight,
    } satisfies CanvasResource;
  },
  halt: ({ canvas }: CanvasResource) => {
    // Remove canvas from DOM if it's attached
    canvas.remove();
  },
});

