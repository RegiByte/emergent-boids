import { Vector2 } from "./vocabulary/schemas/prelude.ts";

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function multiply(v: Vector2, scalar: number): Vector2 {
  return { x: v.x * scalar, y: v.y * scalar };
}

export function divide(v: Vector2, scalar: number): Vector2 {
  if (scalar === 0) return { x: 0, y: 0 };
  return { x: v.x / scalar, y: v.y / scalar };
}

export function magnitude(v: Vector2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function normalize(v: Vector2): Vector2 {
  const mag = magnitude(v);
  if (mag === 0) return { x: 0, y: 0 };
  return divide(v, mag);
}

export function limit(v: Vector2, max: number): Vector2 {
  const mag = magnitude(v);
  if (mag > max) {
    return multiply(normalize(v), max);
  }
  return v;
}

export function distance(a: Vector2, b: Vector2): number {
  return magnitude(subtract(a, b));
}

export function setMagnitude(v: Vector2, mag: number): Vector2 {
  return multiply(normalize(v), mag);
}

/**
 * Calculate the shortest vector from a to b in toroidal space
 * Accounts for wrapping at edges
 */
export function toroidalSubtract(
  a: Vector2,
  b: Vector2,
  width: number,
  height: number
): Vector2 {
  let dx = a.x - b.x;
  let dy = a.y - b.y;

  // Find shortest path considering wrapping
  if (Math.abs(dx) > width / 2) {
    dx = dx > 0 ? dx - width : dx + width;
  }
  if (Math.abs(dy) > height / 2) {
    dy = dy > 0 ? dy - height : dy + height;
  }

  return { x: dx, y: dy };
}

/**
 * Calculate the shortest distance between two points in toroidal space
 */
export function toroidalDistance(
  a: Vector2,
  b: Vector2,
  width: number,
  height: number
): number {
  return magnitude(toroidalSubtract(a, b, width, height));
}
