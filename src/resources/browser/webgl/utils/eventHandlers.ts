/**
 * Event Handlers for WebGL Canvas
 *
 * Mouse wheel zoom, mouse move for picker mode, click for follow mode
 */

import { iterateBoids } from "@/boids/iterators.ts";
import type { CameraAPI } from "../../camera.ts";
import { BoidsById } from "@/boids/vocabulary/schemas/entities.ts";

/**
 * Create mouse wheel handler for zoom (matches Canvas 2D behavior)
 */
export const createWheelHandler = (
  canvas: HTMLCanvasElement,
  camera: CameraAPI,
) => {
  return (e: WheelEvent) => {
    e.preventDefault();

    // Get mouse position relative to canvas
    const rect = canvas.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    // Calculate world position under mouse BEFORE zoom
    const worldBeforeZoom = camera.screenToWorld(mouseScreenX, mouseScreenY);

    // Apply zoom
    const zoomFactor = 1.02;
    const oldZoom = camera.zoom;
    const newZoom =
      e.deltaY > 0 ? camera.zoom / zoomFactor : camera.zoom * zoomFactor;
    camera.setZoom(newZoom);

    // If zoom actually changed (not clamped), adjust camera position
    // so the world point under the mouse stays in the same screen position
    if (camera.zoom !== oldZoom) {
      // Calculate where that world point would NOW be on screen with new zoom
      const worldAfterZoom = camera.screenToWorld(mouseScreenX, mouseScreenY);

      // The difference tells us how much the world "shifted" under the mouse
      // We need to move the camera in the OPPOSITE direction to compensate
      const dx = worldBeforeZoom.x - worldAfterZoom.x;
      const dy = worldBeforeZoom.y - worldAfterZoom.y;

      camera.panTo(camera.x + dx, camera.y + dy);
    }
  };
};

/**
 * Helper function to find closest boid to screen position
 * Optimized: Only search visible boids in viewport
 */
export const findClosestBoidToScreen = (
  boids: BoidsById,
  camera: CameraAPI,
  screenX: number,
  screenY: number,
  maxScreenDistance: number,
): string | null => {
  let closestBoid: string | null = null;
  let closestDistance = maxScreenDistance;

  // Convert screen position to world position for viewport check
  const worldPos = camera.screenToWorld(screenX, screenY);

  // Only search boids near the cursor (within picker radius in world space)
  const searchRadiusWorld = maxScreenDistance / camera.zoom;

  for (const boid of iterateBoids(boids)) {
    // Quick world-space distance check first (cheaper than screen transform)
    const worldDx = boid.position.x - worldPos.x;
    const worldDy = boid.position.y - worldPos.y;
    const worldDistSq = worldDx * worldDx + worldDy * worldDy;

    // Skip if too far in world space (early rejection)
    if (worldDistSq > searchRadiusWorld * searchRadiusWorld * 4) continue;

    // Now do accurate screen-space distance check
    const boidScreen = camera.worldToScreen(boid.position.x, boid.position.y);
    const dx = boidScreen.x - screenX;
    const dy = boidScreen.y - screenY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestBoid = boid.id;
    }
  }

  return closestBoid;
};

/**
 * Create mouse move handler for picker mode (matches Canvas 2D behavior)
 * Throttled to avoid performance issues
 */
export const createMouseMoveHandler = (
  canvas: HTMLCanvasElement,
  camera: CameraAPI,
  boids: BoidsById,
) => {
  let lastPickerUpdate = 0;
  const PICKER_UPDATE_INTERVAL = 16; // ~60 FPS (16ms)

  return (e: MouseEvent) => {
    if (camera.mode.type !== "picker") return;

    // Throttle updates to avoid excessive computation
    const now = performance.now();
    if (now - lastPickerUpdate < PICKER_UPDATE_INTERVAL) return;
    lastPickerUpdate = now;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = camera.screenToWorld(screenX, screenY);

    // Find closest boid within picker radius (80px screen space)
    const closestBoidId = findClosestBoidToScreen(
      boids,
      camera,
      screenX,
      screenY,
      80,
    );

    camera.updatePickerTarget(closestBoidId, worldPos);
  };
};

/**
 * Create mouse enter handler (tracks mouse in canvas for picker mode)
 */
export const createMouseEnterHandler = (camera: CameraAPI) => {
  return () => {
    camera.setMouseInCanvas(true);
  };
};

/**
 * Create mouse leave handler (tracks mouse in canvas for picker mode)
 */
export const createMouseLeaveHandler = (camera: CameraAPI) => {
  return () => {
    camera.setMouseInCanvas(false);
  };
};

/**
 * Create click handler for starting follow mode (matches Canvas 2D behavior)
 */
export const createClickHandler = (camera: CameraAPI) => {
  return (_e: MouseEvent) => {
    // Don't process clicks while panning
    if (camera.isDragging) {
      return;
    }

    // Handle picker mode - start following target boid
    if (camera.mode.type === "picker" && camera.mode.targetBoidId) {
      const targetId = camera.mode.targetBoidId;
      camera.startFollowing(targetId);
      console.log(`Following boid: ${targetId.slice(0, 8)}...`);
      return;
    }
  };
};

/**
 * Attach all event handlers to canvas
 */
export const attachEventHandlers = (
  canvas: HTMLCanvasElement,
  camera: CameraAPI,
  boids: BoidsById,
): (() => void) => {
  const wheelHandler = createWheelHandler(canvas, camera);
  const mouseMoveHandler = createMouseMoveHandler(canvas, camera, boids);
  const mouseEnterHandler = createMouseEnterHandler(camera);
  const mouseLeaveHandler = createMouseLeaveHandler(camera);
  const clickHandler = createClickHandler(camera);

  // Attach listeners
  canvas.addEventListener("wheel", wheelHandler, { passive: false });
  canvas.addEventListener("mousemove", mouseMoveHandler);
  canvas.addEventListener("mouseenter", mouseEnterHandler);
  canvas.addEventListener("mouseleave", mouseLeaveHandler);
  canvas.addEventListener("click", clickHandler);

  // Return cleanup function
  return () => {
    canvas.removeEventListener("wheel", wheelHandler);
    canvas.removeEventListener("mousemove", mouseMoveHandler);
    canvas.removeEventListener("mouseenter", mouseEnterHandler);
    canvas.removeEventListener("mouseleave", mouseLeaveHandler);
    canvas.removeEventListener("click", clickHandler);
  };
};
