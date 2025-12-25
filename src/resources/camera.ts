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

    // Pure functions for coordinate transforms
    // Note: Use canvas.width/height dynamically to handle viewport resizing
    const worldToScreen = (worldX: number, worldY: number) => ({
      x: (worldX - x) * zoom + canvas.width / 2,
      y: (worldY - y) * zoom + canvas.height / 2,
    });

    const screenToWorld = (screenX: number, screenY: number) => ({
      x: (screenX - canvas.width / 2) / zoom + x,
      y: (screenY - canvas.height / 2) / zoom + y,
    });

    const isInViewport = (worldX: number, worldY: number, buffer = 100) => {
      const halfWidth = canvas.width / zoom / 2 + buffer;
      const halfHeight = canvas.height / zoom / 2 + buffer;

      return (
        worldX >= x - halfWidth &&
        worldX <= x + halfWidth &&
        worldY >= y - halfHeight &&
        worldY <= y + halfHeight
      );
    };

    const getViewportBounds = () => {
      const halfWidth = canvas.width / zoom / 2;
      const halfHeight = canvas.height / zoom / 2;

      return {
        left: x - halfWidth,
        right: x + halfWidth,
        top: y - halfHeight,
        bottom: y + halfHeight,
      };
    };

    const panTo = (newX: number, newY: number) => {
      // Calculate viewport half-dimensions at current zoom
      const halfWidth = canvas.width / zoom / 2;
      const halfHeight = canvas.height / zoom / 2;

      // Clamp camera position to keep viewport within world bounds
      const worldWidth = config.world.canvasWidth;
      const worldHeight = config.world.canvasHeight;

      x = Math.max(halfWidth, Math.min(worldWidth - halfWidth, newX));
      y = Math.max(halfHeight, Math.min(worldHeight - halfHeight, newY));
    };

    const setZoom = (newZoom: number) => {
      zoom = Math.max(0.25, Math.min(2.5, newZoom)); // Clamp zoom (0.25x - 2.5x)
    };

    // Keyboard controls (WASD for pan)
    const handleKeyboard = (e: KeyboardEvent) => {
      const panSpeed = 50 / zoom; // Faster pan when zoomed out

      switch (e.key.toLowerCase()) {
        case "w":
          panTo(x, y - panSpeed);
          break;
        case "s":
          panTo(x, y + panSpeed);
          break;
        case "a":
          panTo(x - panSpeed, y);
          break;
        case "d":
          panTo(x + panSpeed, y);
          break;
      }
    };

    // Mouse wheel for zoom
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Get mouse position relative to canvas
      const rect = canvas.canvas.getBoundingClientRect();
      const mouseScreenX = e.clientX - rect.left;
      const mouseScreenY = e.clientY - rect.top;

      // Calculate world position under mouse BEFORE zoom
      const worldBeforeZoom = screenToWorld(mouseScreenX, mouseScreenY);

      // Apply zoom
      const zoomFactor = 1.03;
      const oldZoom = zoom;
      const newZoom = e.deltaY > 0 ? zoom / zoomFactor : zoom * zoomFactor;
      setZoom(newZoom);

      // If zoom actually changed (not clamped), adjust camera position
      // so the world point under the mouse stays in the same screen position
      if (zoom !== oldZoom) {
        // Calculate where that world point would NOW be on screen with new zoom
        const worldAfterZoom = screenToWorld(mouseScreenX, mouseScreenY);

        // The difference tells us how much the world "shifted" under the mouse
        // We need to move the camera in the OPPOSITE direction to compensate
        const dx = worldBeforeZoom.x - worldAfterZoom.x;
        const dy = worldBeforeZoom.y - worldAfterZoom.y;

        panTo(x + dx, y + dy);
      }
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
        panTo(x - dx / zoom, y - dy / zoom);

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
      get viewportWidth() {
        return canvas.width; // Dynamic - reads current canvas size
      },
      get viewportHeight() {
        return canvas.height; // Dynamic - reads current canvas size
      },
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
