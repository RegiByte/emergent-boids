/**
 * WebGL Data Preparation - Selection Overlay
 *
 * Prepares instance data for selection circle rendering.
 * Shows circles for picker mode and followed boid.
 */

import type { Boid } from "../../../boids/vocabulary/schemas/prelude";
import type { CameraAPI } from "../../camera";

/**
 * Instance data for selection circle rendering
 */
export type SelectionInstanceData = {
  centers: Float32Array;
  radii: Float32Array;
  colors: Float32Array;
  alphas: Float32Array;
  count: number;
};

/**
 * Selection circle configuration
 */
const SELECTION_CONFIG = {
  picker: {
    radiusScreenSpace: 60, // pixels
    color: { r: 100 / 255, g: 200 / 255, b: 255 / 255 },
    alpha: 0.6,
  },
  target: {
    radius: 15, // world space
    color: { r: 100 / 255, g: 200 / 255, b: 255 / 255 },
    alpha: 0.8,
  },
  following: {
    baseRadius: 20, // world space
    color: { r: 255 / 255, g: 200 / 255, b: 100 / 255 },
    pulseSpeed: 0.5, // Hz
    pulseScaleMin: 0.8,
    pulseScaleMax: 1.0,
    alphaMin: 0.5,
    alphaMax: 0.8,
  },
} as const;

/**
 * Prepares selection overlay instance data for GPU rendering
 *
 * @param camera - Camera API for mode and zoom information
 * @param boids - Array of all boids (to find target/followed boid)
 * @returns Instance data ready for GPU upload
 */
export const prepareSelectionData = (
  camera: CameraAPI,
  boids: Boid[]
): SelectionInstanceData => {
  const circles: Array<{
    centerX: number;
    centerY: number;
    radius: number;
    r: number;
    g: number;
    b: number;
    alpha: number;
  }> = [];

  // Picker mode: Show picker circle and target highlight
  if (camera.mode.type === "picker" && camera.mode.mouseInCanvas) {
    const { mouseWorldPos, targetBoidId } = camera.mode;

    // Picker circle (dashed circle around mouse - we'll use solid for now)
    // Convert screen-space radius (80px) to world-space radius
    const pickerRadiusWorld = SELECTION_CONFIG.picker.radiusScreenSpace / camera.zoom;
    circles.push({
      centerX: mouseWorldPos.x,
      centerY: mouseWorldPos.y,
      radius: pickerRadiusWorld,
      r: SELECTION_CONFIG.picker.color.r,
      g: SELECTION_CONFIG.picker.color.g,
      b: SELECTION_CONFIG.picker.color.b,
      alpha: SELECTION_CONFIG.picker.alpha,
    });

    // Target boid highlight
    if (targetBoidId) {
      const targetBoid = boids.find((b) => b.id === targetBoidId);
      if (targetBoid) {
        circles.push({
          centerX: targetBoid.position.x,
          centerY: targetBoid.position.y,
          radius: SELECTION_CONFIG.target.radius,
          r: SELECTION_CONFIG.target.color.r,
          g: SELECTION_CONFIG.target.color.g,
          b: SELECTION_CONFIG.target.color.b,
          alpha: SELECTION_CONFIG.target.alpha,
        });
      }
    }
  }

  // Following mode: Show pulsing ring around followed boid
  if (camera.mode.type === "following") {
    const followedBoid = boids.find(
      (b) =>
        b.id === (camera.mode as { type: "following"; boidId: string }).boidId
    );
    if (followedBoid) {
      // Pulsing effect based on time
      // Use performance.now() for animation (not simulation time, so it doesn't pause)
      const time = performance.now() / 1000;
      const pulsePhase = time * SELECTION_CONFIG.following.pulseSpeed * Math.PI * 2;
      const pulseScale =
        SELECTION_CONFIG.following.pulseScaleMin +
        (Math.sin(pulsePhase) + 1) *
          0.5 *
          (SELECTION_CONFIG.following.pulseScaleMax -
            SELECTION_CONFIG.following.pulseScaleMin);
      const radius = SELECTION_CONFIG.following.baseRadius * pulseScale;
      const alpha =
        SELECTION_CONFIG.following.alphaMin +
        (Math.sin(pulsePhase) + 1) *
          0.5 *
          (SELECTION_CONFIG.following.alphaMax -
            SELECTION_CONFIG.following.alphaMin);

      circles.push({
        centerX: followedBoid.position.x,
        centerY: followedBoid.position.y,
        radius,
        r: SELECTION_CONFIG.following.color.r,
        g: SELECTION_CONFIG.following.color.g,
        b: SELECTION_CONFIG.following.color.b,
        alpha,
      });
    }
  }

  // Convert to typed arrays
  const count = circles.length;
  const centers = new Float32Array(count * 2);
  const radii = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const alphas = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const circle = circles[i];
    centers[i * 2] = circle.centerX;
    centers[i * 2 + 1] = circle.centerY;
    radii[i] = circle.radius;
    colors[i * 3] = circle.r;
    colors[i * 3 + 1] = circle.g;
    colors[i * 3 + 2] = circle.b;
    alphas[i] = circle.alpha;
  }

  return { centers, radii, colors, alphas, count };
};

