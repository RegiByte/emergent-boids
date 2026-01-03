import { defineResource } from "braided";

export type CanvasAPI = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  resize: (_newWidth: number, _newHeight: number) => void;
};

export const canvas = defineResource({
  dependencies: [],
  start: () => {
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
      "translate-y-[-50%]",
    );

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }

    // Create the resource object
    // Note: width/height are VIEWPORT dimensions (what we see on screen)
    // World dimensions (width/height) are stored in runtimeStore.config.world
    const resource = {
      canvas,
      ctx,
      width: canvas.width, // Viewport width (800)
      height: canvas.height, // Viewport height (600)
      resize: (newWidth: number, newHeight: number) => {
        // Update viewport (canvas element) dimensions
        canvas.width = newWidth;
        canvas.height = newHeight;
        resource.width = newWidth;
        resource.height = newHeight;

        // Note: We do NOT update world dimensions here
        // World stays 10K x 10K, only viewport changes
      },
    } satisfies CanvasAPI;

    return resource;
  },
  halt: ({ canvas }: CanvasAPI) => {
    // Remove canvas from DOM if it's attached
    // Check if canvas is actually in the DOM before removing
    // (prevents React StrictMode double-unmount issues)
    if (canvas.parentNode) {
      canvas.remove();
    }
  },
});
