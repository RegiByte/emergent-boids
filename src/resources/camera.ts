import { defineResource } from "braided";
import type { CanvasAPI } from "./canvas";
import type { RuntimeStoreResource } from "./runtimeStore";

export type CameraAPI = {
  x: number;
  y: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  panTo: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
  screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
  worldToScreen: (worldX: number, worldY: number) => { x: number; y: number };
  isInViewport: (worldX: number, worldY: number, buffer?: number) => boolean;
  getViewportBounds: () => {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

export const camera = defineResource({
  dependencies: ["canvas", "runtimeStore"],
  start: ({
    canvas,
    runtimeStore,
  }: {
    canvas: CanvasAPI;
    runtimeStore: RuntimeStoreResource;
  }) => {
    const { config } = runtimeStore.store.getState();

    // Start centered in world
    let x = config.world.canvasWidth / 2;
    let y = config.world.canvasHeight / 2;
    let zoom = 1.0; // 1.0 = see full viewport width in world units

    const viewportWidth = canvas.width;
    const viewportHeight = canvas.height;

    // Pure functions for coordinate transforms
    const worldToScreen = (worldX: number, worldY: number) => ({
      x: (worldX - x) * zoom + viewportWidth / 2,
      y: (worldY - y) * zoom + viewportHeight / 2,
    });

    const screenToWorld = (screenX: number, screenY: number) => ({
      x: (screenX - viewportWidth / 2) / zoom + x,
      y: (screenY - viewportHeight / 2) / zoom + y,
    });

    const isInViewport = (worldX: number, worldY: number, buffer = 100) => {
      const halfWidth = viewportWidth / zoom / 2 + buffer;
      const halfHeight = viewportHeight / zoom / 2 + buffer;

      return (
        worldX >= x - halfWidth &&
        worldX <= x + halfWidth &&
        worldY >= y - halfHeight &&
        worldY <= y + halfHeight
      );
    };

    const getViewportBounds = () => {
      const halfWidth = viewportWidth / zoom / 2;
      const halfHeight = viewportHeight / zoom / 2;

      return {
        left: x - halfWidth,
        right: x + halfWidth,
        top: y - halfHeight,
        bottom: y + halfHeight,
      };
    };

    const panTo = (newX: number, newY: number) => {
      x = newX;
      y = newY;
    };

    const setZoom = (newZoom: number) => {
      zoom = Math.max(0.1, Math.min(5.0, newZoom)); // Clamp zoom
    };

    // Keyboard controls (WASD for pan)
    const handleKeyboard = (e: KeyboardEvent) => {
      const panSpeed = 50 / zoom; // Faster pan when zoomed out

      switch (e.key.toLowerCase()) {
        case "w":
          y -= panSpeed;
          break;
        case "s":
          y += panSpeed;
          break;
        case "a":
          x -= panSpeed;
          break;
        case "d":
          x += panSpeed;
          break;
      }
    };

    // Mouse wheel for zoom
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.1;
      setZoom(zoom + (e.deltaY > 0 ? -zoomSpeed : zoomSpeed));
    };

    // Mouse drag for pan
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      // Middle mouse button or Ctrl+Left click
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        e.preventDefault();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        // Pan camera (invert direction for natural feel)
        x -= dx / zoom;
        y -= dy / zoom;

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    // Register event listeners
    document.addEventListener("keydown", handleKeyboard);
    canvas.canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.canvas.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    const cleanup = () => {
      document.removeEventListener("keydown", handleKeyboard);
      canvas.canvas.removeEventListener("wheel", handleWheel);
      canvas.canvas.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    return {
      get x() {
        return x;
      },
      get y() {
        return y;
      },
      get zoom() {
        return zoom;
      },
      viewportWidth,
      viewportHeight,
      panTo,
      setZoom,
      worldToScreen,
      screenToWorld,
      isInViewport,
      getViewportBounds,
      cleanup,
    } satisfies CameraAPI & { cleanup: () => void };
  },
  halt: (camera: CameraAPI & { cleanup?: () => void }) => {
    if (camera.cleanup) {
      camera.cleanup();
    }
  },
});
