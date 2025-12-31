/**
 * Transform Utilities
 * 
 * Camera and projection matrix calculations for WebGL rendering
 */

import type { CameraAPI } from "../../camera";

/**
 * Create projection matrix for 2D orthographic projection
 * Maps world coordinates to clip space (-1 to 1)
 */
export const createProjectionMatrix = (
  width: number,
  height: number,
  camera: CameraAPI
): number[] => {
  // Calculate visible world bounds with camera transform
  const halfWidth = width / (2 * camera.zoom);
  const halfHeight = height / (2 * camera.zoom);

  const left = camera.x - halfWidth;
  const right = camera.x + halfWidth;
  const bottom = camera.y + halfHeight; // Flip Y (screen Y increases downward)
  const top = camera.y - halfHeight;

  // Orthographic projection matrix (column-major for WebGL)
  return [
    2 / (right - left),
    0,
    0,
    0,
    0,
    2 / (top - bottom),
    0,
    0,
    0,
    0,
    -1,
    0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    0,
    1,
  ];
};

/**
 * Create view matrix for camera transform
 * (Alternative to projection matrix approach)
 */
export const createViewMatrix = (camera: CameraAPI): number[] => {
  // View matrix (column-major for WebGL)
  // Translation + scale
  return [
    camera.zoom,
    0,
    0,
    0,
    0,
    camera.zoom,
    0,
    0,
    0,
    0,
    1,
    0,
    -camera.x * camera.zoom,
    -camera.y * camera.zoom,
    0,
    1,
  ];
};

/**
 * Calculate screen-space resolution for shader uniforms
 */
export const getResolution = (width: number, height: number): [number, number] => {
  return [width, height];
};


