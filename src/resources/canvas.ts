import { defineResource } from "braided";
import type { StartedRuntimeStore } from "./runtimeStore";

export type CanvasResource = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  resize: (newWidth: number, newHeight: number) => void;
};

// Helper function to calculate canvas dimensions
function calculateCanvasDimensions() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Account for header (~80px) and use 75% of viewport width
  const availableWidth = viewportWidth * 0.75;
  const availableHeight = viewportHeight - 100; // Subtract header height

  // Calculate dimensions maintaining a reasonable aspect ratio
  // Use the smaller dimension to ensure canvas fits
  const canvasWidth = Math.floor(Math.min(availableWidth - 40, 1400)); // Max 1400px width
  const canvasHeight = Math.floor(Math.min(availableHeight - 40, 1000)); // Max 1000px height

  return { canvasWidth, canvasHeight };
}

export const canvas = defineResource({
  dependencies: ["runtimeStore"],
  start: ({ runtimeStore }: { runtimeStore: StartedRuntimeStore }) => {
    const store = runtimeStore.store;
    const state = store.getState();
    const canvasWidth = state.config.world.canvasWidth;
    const canvasHeight = state.config.world.canvasHeight;

    // Create canvas element
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.border = "2px solid #00ff88";
    canvas.style.display = "block";
    canvas.style.boxShadow = "0 0 20px rgba(0, 255, 136, 0.3)";

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
    };

    return resource satisfies CanvasResource;
  },
  halt: ({ canvas }: CanvasResource) => {
    // Remove canvas from DOM if it's attached
    canvas.remove();
  },
});

// Export the calculation function for use in App
export { calculateCanvasDimensions };
