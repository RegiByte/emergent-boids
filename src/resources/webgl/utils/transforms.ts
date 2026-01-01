/**
 * Transform Utilities
 *
 * Session 96 Note: This module is DEPRECATED and should not be used.
 *
 * The functions here were created in an earlier session but were never
 * properly integrated. They return mat4 (16 elements) but our shaders
 * expect mat3 (9 elements).
 *
 * CORRECT APPROACH:
 * Use camera.getTransformMatrix() instead - it's already implemented,
 * tested, and returns the correct mat3 format for our shaders.
 *
 * See: src/resources/camera.ts line 325 (getTransformMatrix function)
 *
 * This file is kept for reference only and may be removed in the future.
 */

import type { CameraAPI } from "../../camera";

/**
 * @deprecated Use camera.getTransformMatrix() instead
 * This returns mat4 but shaders expect mat3
 */
export const createProjectionMatrix = (
  width: number,
  height: number,
  camera: CameraAPI,
): number[] => {
  // Calculate visible world bounds with camera transform
  const halfWidth = width / (2 * camera.zoom);
  const halfHeight = height / (2 * camera.zoom);

  const left = camera.x - halfWidth;
  const right = camera.x + halfWidth;
  const bottom = camera.y + halfHeight; // Flip Y (screen Y increases downward)
  const top = camera.y - halfHeight;

  // Orthographic projection matrix (column-major for WebGL)
  // WARNING: This is mat4 (4x4 = 16 elements) but our shaders use mat3!
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
 * @deprecated Use camera.getTransformMatrix() instead
 * This returns mat4 but shaders expect mat3
 */
export const createViewMatrix = (camera: CameraAPI): number[] => {
  // View matrix (column-major for WebGL)
  // Translation + scale
  // WARNING: This is mat4 (4x4 = 16 elements) but our shaders use mat3!
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
 * This one is fine to use
 */
export const getResolution = (
  width: number,
  height: number,
): [number, number] => {
  return [width, height];
};
