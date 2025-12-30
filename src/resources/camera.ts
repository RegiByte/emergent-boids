import { defineResource } from "braided";
import type { CanvasAPI } from "./canvas";
import type { RuntimeStoreResource } from "./runtimeStore";
import { create } from "zustand";

export type CameraMode =
  | { type: "free" }
  | {
      type: "picker";
      targetBoidId: string | null;
      mouseWorldPos: { x: number; y: number };
      mouseInCanvas: boolean;
    }
  | { type: "following"; boidId: string; lerpFactor: number };

// Zustand store for reactive camera mode state
type CameraModeStore = {
  mode: CameraMode;
  setMode: (mode: CameraMode) => void;
};

const useCameraModeStore = create<CameraModeStore>((set) => ({
  mode: { type: "free" },
  setMode: (mode) => set({ mode }),
}));

export type CameraAPI = {
  x: number;
  y: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  mode: CameraMode;
  isDragging: boolean;
  useModeStore: typeof useCameraModeStore;
  panTo: (x: number, y: number, isManualNavigation?: boolean) => void;
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
  getTransformMatrix: () => number[];
  enterPickerMode: () => void;
  updatePickerTarget: (
    boidId: string | null,
    mouseWorldPos: { x: number; y: number }
  ) => void;
  setMouseInCanvas: (inCanvas: boolean) => void;
  exitPickerMode: () => void;
  startFollowing: (boidId: string) => void;
  stopFollowing: () => void;
  updateFollowPosition: (targetX: number, targetY: number) => void;
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
    let x = config.world.width / 2;
    let y = config.world.height / 2;
    let zoom = 1.0; // 1.0 = see full viewport width in world units
    let mode: CameraMode = { type: "free" };

    // Sync initial mode to store
    useCameraModeStore.setState({ mode });

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

    const panTo = (newX: number, newY: number, isManualNavigation = false) => {
      // If user manually navigates while following, exit follow mode
      if (isManualNavigation && mode.type === "following") {
        mode = { type: "free" };
        useCameraModeStore.setState({ mode });
      }

      // Calculate viewport half-dimensions at current zoom
      const halfWidth = canvas.width / zoom / 2;
      const halfHeight = canvas.height / zoom / 2;

      // Clamp camera position to keep viewport within world bounds
      const worldWidth = config.world.width;
      const worldHeight = config.world.height;

      x = Math.max(halfWidth, Math.min(worldWidth - halfWidth, newX));
      y = Math.max(halfHeight, Math.min(worldHeight - halfHeight, newY));
    };

    const setZoom = (newZoom: number) => {
      // Calculate minimum zoom to prevent seeing beyond world borders
      // Zoom system: LOWER zoom = more zoomed OUT (see more world)
      // viewport shows: canvas.width / zoom world units horizontally
      // We want to stop zooming out when EITHER width OR height fits entirely
      // Therefore: use the LARGER of the two constraints (stops zooming out earlier)
      const worldWidth = config.world.width;
      const worldHeight = config.world.height;
      const maxZoomForWidth = canvas.width / worldWidth;
      const maxZoomForHeight = canvas.height / worldHeight;
      const minZoom = Math.max(maxZoomForWidth, maxZoomForHeight); // Stop when either dimension fits

      // Clamp zoom: minimum = fit whole world (largest constraint), maximum = 2.5x (most zoomed in)
      zoom = Math.max(minZoom, Math.min(2.5, newZoom));
    };

    // Keyboard controls (WASD for pan, Escape to exit modes)
    const handleKeyboard = (e: KeyboardEvent) => {
      // Exit picker/follow mode on Escape
      if (e.key === "Escape") {
        if (mode.type === "picker" || mode.type === "following") {
          mode = { type: "free" };
          useCameraModeStore.setState({ mode });
          return;
        }
      }

      const panSpeed = 50 / zoom; // Faster pan when zoomed out

      switch (e.key.toLowerCase()) {
        case "w":
          panTo(x, y - panSpeed, true); // Manual navigation
          break;
        case "s":
          panTo(x, y + panSpeed, true); // Manual navigation
          break;
        case "a":
          panTo(x - panSpeed, y, true); // Manual navigation
          break;
        case "d":
          panTo(x + panSpeed, y, true); // Manual navigation
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
      const zoomFactor = 1.01;
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
        e.preventDefault(); // Prevent text selection during drag
        e.stopPropagation(); // Stop other click handlers
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        // Pan camera (invert direction for natural feel)
        panTo(x - dx / zoom, y - dy / zoom, true); // Manual navigation

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        e.preventDefault(); // Prevent any default behavior while dragging
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging) {
        isDragging = false;
        e.preventDefault(); // Prevent click event after drag
        e.stopPropagation(); // Stop click from bubbling to canvas click handler
      }
    };

    // Prevent context menu on Ctrl+Click (panning gesture)
    const handleContextMenu = (e: MouseEvent) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Block "Save image as..." menu
      }
    };

    // Camera mode methods
    const enterPickerMode = () => {
      mode = {
        type: "picker",
        targetBoidId: null,
        mouseWorldPos: { x, y },
        mouseInCanvas: false,
      };
      useCameraModeStore.setState({ mode });
    };

    const updatePickerTarget = (
      boidId: string | null,
      mouseWorldPos: { x: number; y: number }
    ) => {
      if (mode.type === "picker") {
        mode = {
          type: "picker",
          targetBoidId: boidId,
          mouseWorldPos,
          mouseInCanvas: mode.mouseInCanvas,
        };
        useCameraModeStore.setState({ mode });
      }
    };

    const setMouseInCanvas = (inCanvas: boolean) => {
      if (mode.type === "picker") {
        mode = {
          type: "picker",
          targetBoidId: mode.targetBoidId,
          mouseWorldPos: mode.mouseWorldPos,
          mouseInCanvas: inCanvas,
        };
        useCameraModeStore.setState({ mode });
      }
    };

    const exitPickerMode = () => {
      mode = { type: "free" };
      useCameraModeStore.setState({ mode });
    };

    const startFollowing = (boidId: string) => {
      mode = { type: "following", boidId, lerpFactor: 0.5 };
      useCameraModeStore.setState({ mode });
    };

    const stopFollowing = () => {
      mode = { type: "free" };
      useCameraModeStore.setState({ mode });
    };

    const updateFollowPosition = (targetX: number, targetY: number) => {
      if (mode.type === "following") {
        // Smooth lerp to target position
        const lerpFactor = mode.lerpFactor;
        const newX = x + (targetX - x) * lerpFactor;
        const newY = y + (targetY - y) * lerpFactor;
        panTo(newX, newY);
      }
    };

    // WebGL matrix generation (mat3 for 2D transforms)
    // Single combined matrix: world -> NDC
    // Matches Canvas 2D: ctx.translate(w/2, h/2); ctx.scale(zoom, zoom); ctx.translate(-x, -y)
    // Then converts screen space to NDC: ndc = (screen / size) * 2 - 1
    const getTransformMatrix = (): number[] => {
      const w = canvas.width;
      const h = canvas.height;
      
      // Canvas 2D transform (applied right-to-left):
      // screen = ((world - camera) * zoom) + center
      // screen_x = (px - x) * zoom + w/2
      // screen_y = (py - y) * zoom + h/2
      //
      // Then to NDC:
      // ndc_x = (screen_x / w) * 2 - 1
      // ndc_y = -(screen_y / h) * 2 + 1  (flip Y for WebGL)
      //
      // Combined:
      // ndc_x = ((px - x) * zoom + w/2) / w * 2 - 1
      //       = px * (2*zoom/w) - x * (2*zoom/w) + 1 - 1
      //       = px * (2*zoom/w) + (-x*zoom + w/2) * (2/w) - 1
      //
      // ndc_y = -(((py - y) * zoom + h/2) / h * 2 - 1)
      //       = -py * (2*zoom/h) + y * (2*zoom/h) - 1 + 1
      //       = py * (-2*zoom/h) + (-y*zoom + h/2) * (-2/h) + 1
      
      const scaleX = (2 * zoom) / w;
      const scaleY = (-2 * zoom) / h;
      const translateX = ((-x * zoom + w / 2) * 2) / w - 1;
      const translateY = ((-y * zoom + h / 2) * (-2)) / h + 1;
      
      // Return in COLUMN-MAJOR order for WebGL (mat3 in GLSL)
      // Column 0 (x-axis), Column 1 (y-axis), Column 2 (translation)
      return [
        scaleX,     0,          0,      // Column 0: affects x
        0,          scaleY,     0,      // Column 1: affects y
        translateX, translateY, 1       // Column 2: translation + homogeneous
      ];
    };

    // Register event listeners
    document.addEventListener("keydown", handleKeyboard);
    canvas.canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.canvas.addEventListener("mousedown", handleMouseDown);
    canvas.canvas.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    const cleanup = () => {
      document.removeEventListener("keydown", handleKeyboard);
      canvas.canvas.removeEventListener("wheel", handleWheel);
      canvas.canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.canvas.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    const api = {
      get x() {
        return x;
      },
      get y() {
        return y;
      },
      get zoom() {
        return zoom;
      },
      get mode() {
        return mode;
      },
      get isDragging() {
        return isDragging;
      },
      useModeStore: useCameraModeStore,
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
      getTransformMatrix,
      enterPickerMode,
      updatePickerTarget,
      setMouseInCanvas,
      exitPickerMode,
      startFollowing,
      stopFollowing,
      updateFollowPosition,
      cleanup,
    } satisfies CameraAPI & { cleanup: () => void };

    return api;
  },
  halt: (camera: CameraAPI & { cleanup?: () => void }) => {
    if (camera.cleanup) {
      camera.cleanup();
    }
  },
});
