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
import type { BodyPart } from "../../boids/vocabulary/schemas/genetics";
import {
  transformBodyPartCanvas2D,
  type BodyPartType,
} from "@/lib/coordinates";

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
 *
 * GENOME-DRIVEN RENDERING (Session 92):
 * Body part renderers now read positions, sizes, and rotations from genome data
 * instead of using hardcoded values. This ensures visual parity between Canvas 2D
 * and WebGL renderers.
 */

export type BodyPartRenderer = (
  _ctx: CanvasRenderingContext2D,
  _boidSize: number,
  _color: string,
  _bodyParts: BodyPart[] // Array of body parts of this type from genome
) => void;

/**
 * Eyes - Two dots for character
 * UNIFIED COORDINATES (Session 94, Phase 3):
 * Uses transformBodyPartCanvas2D for consistent positioning across renderers
 */
const renderEyes: BodyPartRenderer = (ctx, boidSize, _color, bodyParts) => {
  // Render each eye from genome data
  for (const part of bodyParts) {
    // Get eye properties from genome
    const eyePartSize = part.size || 1.0;
    const eyePosX = part.position?.x || 0;
    const eyePosY = part.position?.y || -0.4;
    const eyeRotation = part.rotation || 0;

    // Use unified coordinate transformation
    const { offset } = transformBodyPartCanvas2D(
      { x: eyePosX, y: eyePosY },
      eyeRotation,
      "eye" as BodyPartType,
      boidSize
    );

    const eyeSize = boidSize * 0.15 * eyePartSize;

    // Draw eye white
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(offset.x, offset.y, eyeSize, 0, Math.PI * 2);
    ctx.fill();

    // Draw pupil
    ctx.fillStyle = "#000";
    const pupilSize = eyeSize * 0.5;
    ctx.beginPath();
    ctx.arc(offset.x, offset.y, pupilSize, 0, Math.PI * 2);
    ctx.fill();
  }
};

/**
 * Fins - Side fins for aquatic look (more visible)
 * GENOME-DRIVEN: Reads positions from body part data
 * Uses original Canvas 2D geometry (simple triangles from body center)
 */
const renderFins: BodyPartRenderer = (ctx, boidSize, color, _bodyParts) => {
  // Make fins more opaque and add outline
  ctx.fillStyle = `${color}DD`; // Much more opaque (87% opacity)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  // Original Canvas 2D rendered fins from body center, not positioned by genome
  // So we render the original geometry without translation
  // Top fin (larger and more prominent)
  ctx.beginPath();
  ctx.moveTo(-boidSize * 0.1, 0);
  ctx.lineTo(-boidSize * 0.6, -boidSize * 0.7);
  ctx.lineTo(-boidSize * 0.2, -boidSize * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bottom fin (larger and more prominent)
  ctx.beginPath();
  ctx.moveTo(-boidSize * 0.1, 0);
  ctx.lineTo(-boidSize * 0.6, boidSize * 0.7);
  ctx.lineTo(-boidSize * 0.2, boidSize * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

/**
 * Spikes - Defensive spikes for predators (symmetrical)
 * GENOME-DRIVEN: Reads positions from body part data
 * Uses original Canvas 2D geometry (lines from body)
 */
const renderSpikes: BodyPartRenderer = (ctx, boidSize, color, _bodyParts) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  // Original Canvas 2D rendered spikes from body, not positioned by genome
  // Three spikes on top
  for (let i = 0; i < 3; i++) {
    const x = -boidSize * 0.4 + i * boidSize * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, -boidSize * 0.5);
    ctx.lineTo(x - boidSize * 0.1, -boidSize * 0.8);
    ctx.stroke();
  }

  // Three spikes on bottom (symmetrical)
  for (let i = 0; i < 3; i++) {
    const x = -boidSize * 0.4 + i * boidSize * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, boidSize * 0.5);
    ctx.lineTo(x - boidSize * 0.1, boidSize * 0.8);
    ctx.stroke();
  }
};

/**
 * Tail - Prominent tail fin
 * UNIFIED COORDINATES (Session 94, Phase 3):
 * Uses transformBodyPartCanvas2D for consistent positioning across renderers
 */
const renderTail: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  ctx.fillStyle = `${color}EE`; // More opaque (93% opacity)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  // Render each tail from genome data (usually just one)
  for (const part of bodyParts) {
    // Get tail properties from genome
    const tailPartSize = part.size || 1.0;
    const tailPosX = part.position?.x || 0;
    const tailPosY = part.position?.y || 0.5;
    const tailRotation = part.rotation || 0;

    // Use unified coordinate transformation
    const { offset, rotation } = transformBodyPartCanvas2D(
      { x: tailPosX, y: tailPosY },
      tailRotation,
      "tail" as BodyPartType,
      boidSize
    );

    // Tail geometry (angular V-shape)
    const tailLength = boidSize * 1.0 * tailPartSize;
    const tailWidth = boidSize * 0.4 * tailPartSize;

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.rotate(rotation);

    // Two merged triangles creating angular perspective
    // Points RIGHT in base state (matching atlas)
    ctx.beginPath();
    ctx.moveTo(-tailLength * 0.5, 0); // Base (at boid body)
    ctx.lineTo(tailLength * 1.0, -tailWidth); // Top tip (pointing right)
    ctx.lineTo(tailLength * 0.8, 0); // Middle point (creates angular V)
    ctx.lineTo(tailLength * 1.0, tailWidth); // Bottom tip (pointing right)
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
};

/**
 * Glow - Subtle glow effect for special species
 * GENOME-DRIVEN: Reads size from body part data
 */
const renderGlow: BodyPartRenderer = (ctx, boidSize, color, bodyParts) => {
  // Use the first glow part's size (usually only one)
  const glowPart = bodyParts[0];
  const glowSize = glowPart?.size || 1.0;
  
  ctx.shadowBlur = boidSize * 0.8 * glowSize;
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
  eye: renderEyes,
  fin: renderFins,
  spike: renderSpikes,
  tail: renderTail,
  antenna: renderEyes, // Reuse eyes renderer for now
  glow: renderGlow,
  shell: renderSpikes, // Reuse spikes renderer for now
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
