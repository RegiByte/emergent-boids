/**
 * Shape Rendering Functions - Geometric Shapes Edition
 *
 * Clean geometric shapes for high-performance boid rendering.
 * Direction is encoded via motion trails, not shape orientation.
 * Each shape is centered at (0, 0) and renderer handles rotation.
 *
 * Philosophy: Simple shapes + color + size + trails = instant species recognition
 */

import type {
  RenderBodyPartType,
  RenderShapeType,
} from "../../boids/vocabulary/schemas/prelude";

export type ShapeRenderer = (
  _ctx: CanvasRenderingContext2D,
  _size: number
) => void;

/**
 * Diamond - Rotated square, pointed and agile
 * Good for: Fast species (explorers, predators)
 */
const renderDiamond: ShapeRenderer = (ctx, size) => {
  ctx.beginPath();
  ctx.moveTo(size, 0); // Right point (forward)
  ctx.lineTo(0, size * 0.7); // Bottom point
  ctx.lineTo(-size * 0.6, 0); // Left point (back)
  ctx.lineTo(0, -size * 0.7); // Top point
  ctx.closePath();
};

/**
 * Circle - Smooth and social
 * Good for: Schooling species, social prey
 */
const renderCircle: ShapeRenderer = (ctx, size) => {
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
  ctx.closePath();
};

/**
 * Hexagon - Sturdy and grounded
 * Good for: Ground prey, herbivores, defensive species
 */
const renderHexagon: ShapeRenderer = (ctx, size) => {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6; // Rotate to point forward
    const x = size * 0.7 * Math.cos(angle);
    const y = size * 0.7 * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

/**
 * Square - Solid and stable
 * Good for: Tank-like species, slow but sturdy
 */
const renderSquare: ShapeRenderer = (ctx, size) => {
  const halfSize = size * 0.6;
  ctx.beginPath();
  ctx.rect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
  ctx.closePath();
};

/**
 * Triangle - Classic boid (backward compatible)
 * Good for: Generic species, fallback
 */
const renderTriangle: ShapeRenderer = (ctx, size) => {
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.5, size * 0.5);
  ctx.lineTo(-size * 0.5, -size * 0.5);
  ctx.closePath();
};

/**
 * Body Parts System - Composable visual elements
 * These are rendered AFTER the main body shape to add character
 */

export type BodyPartRenderer = (
  _ctx: CanvasRenderingContext2D,
  _size: number,
  _color: string
) => void;

/**
 * Eyes - Two dots for character
 */
const renderEyes: BodyPartRenderer = (ctx, size, _color) => {
  const eyeSize = size * 0.15;
  const eyeOffset = size * 0.3;

  ctx.fillStyle = "white";
  // Left eye
  ctx.beginPath();
  ctx.arc(eyeOffset, -eyeSize * 1.5, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  // Right eye
  ctx.beginPath();
  ctx.arc(eyeOffset, eyeSize * 1.5, eyeSize, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = "#000";
  const pupilSize = eyeSize * 0.5;
  ctx.beginPath();
  ctx.arc(eyeOffset, -eyeSize * 1.5, pupilSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeOffset, eyeSize * 1.5, pupilSize, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * Fins - Side fins for aquatic look (more visible)
 */
const renderFins: BodyPartRenderer = (ctx, size, color) => {
  // Make fins more opaque and add outline
  ctx.fillStyle = `${color}DD`; // Much more opaque (87% opacity)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  // Top fin (larger and more prominent)
  ctx.beginPath();
  ctx.moveTo(-size * 0.1, 0);
  ctx.lineTo(-size * 0.6, -size * 0.7);
  ctx.lineTo(-size * 0.2, -size * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bottom fin (larger and more prominent)
  ctx.beginPath();
  ctx.moveTo(-size * 0.1, 0);
  ctx.lineTo(-size * 0.6, size * 0.7);
  ctx.lineTo(-size * 0.2, size * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

/**
 * Spikes - Defensive spikes for predators (symmetrical)
 */
const renderSpikes: BodyPartRenderer = (ctx, size, color) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  // Three spikes on top
  for (let i = 0; i < 3; i++) {
    const x = -size * 0.4 + i * size * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, -size * 0.5);
    ctx.lineTo(x - size * 0.1, -size * 0.8);
    ctx.stroke();
  }

  // Three spikes on bottom (symmetrical)
  for (let i = 0; i < 3; i++) {
    const x = -size * 0.4 + i * size * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, size * 0.5);
    ctx.lineTo(x - size * 0.1, size * 0.8);
    ctx.stroke();
  }
};

/**
 * Tail - Prominent tail fin
 */
const renderTail: BodyPartRenderer = (ctx, size, color) => {
  ctx.fillStyle = `${color}EE`; // More opaque (93% opacity)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  // Tail fin (larger and more visible)
  ctx.beginPath();
  ctx.moveTo(-size * 0.5, 0);
  ctx.lineTo(-size * 1.0, -size * 0.4);
  ctx.lineTo(-size * 0.8, 0);
  ctx.lineTo(-size * 1.0, size * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

/**
 * Glow - Subtle glow effect for special species
 */
const renderGlow: BodyPartRenderer = (ctx, size, color) => {
  ctx.shadowBlur = size * 0.8;
  ctx.shadowColor = color;
  // The glow is applied to the main body, so we don't draw anything here
  // This is just a marker that tells the renderer to enable shadow
};

/**
 * Shape registry - Maps shape names to rendering functions
 */
export const shapeRenderers: Record<RenderShapeType, ShapeRenderer> = {
  diamond: renderDiamond,
  circle: renderCircle,
  hexagon: renderHexagon,
  square: renderSquare,
  triangle: renderTriangle,
};

/**
 * Body parts registry - Maps part names to rendering functions
 */
export const bodyPartRenderers: Record<RenderBodyPartType, BodyPartRenderer> = {
  eyes: renderEyes,
  fins: renderFins,
  spikes: renderSpikes,
  tail: renderTail,
  glow: renderGlow,
};

/**
 * Get shape renderer for a given shape type
 * Falls back to circle if shape not found
 */
export const getShapeRenderer = (shape: RenderShapeType): ShapeRenderer => {
  return shapeRenderers[shape] || renderCircle;
};

/**
 * Get body part renderer for a given part type
 */
export const getBodyPartRenderer = (
  part: RenderBodyPartType
): BodyPartRenderer | undefined => {
  return bodyPartRenderers[part];
};
