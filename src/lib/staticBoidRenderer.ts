/**
 * Static Boid Renderer
 *
 * Utilities for rendering individual boids in controlled environments
 * without the full simulation system. Supports both Canvas 2D and WebGL.
 *
 * Use cases:
 * - Visual testing and comparison
 * - Atlas/texture debugging
 * - Documentation/screenshots
 * - Side-by-side renderer comparison
 */

import type { Boid } from "@/boids/vocabulary/schemas/entities";
import type { SpeciesConfig } from "@/boids/vocabulary/schemas/species";
import type { Genome } from "@/boids/vocabulary/schemas/genetics";
import type { AtlasesResult } from "@/resources/browser/atlases.ts";
import type { BodyPartType } from "@/lib/coordinates";
import { shapeSizeParamFromBaseSize } from "@/lib/shapeSizing";
import { computePhenotype } from "@/boids/genetics/phenotype";
import { defaultWorldPhysics } from "@/boids/defaultPhysics.ts";
import {
  getShapeRenderer,
  getBodyPartRenderer,
} from "@/resources/browser/rendering/shapes";
import { Vector2 } from "@/boids/vocabulary/schemas/primitives";

/**
 * Create a minimal boid object for static rendering
 *
 * @param genome - The boid's genetic information
 * @param typeId - Species/type identifier (e.g., "explorer", "predator")
 * @param position - World position (default: origin)
 * @param rotation - Rotation in radians (default: 0, facing right)
 */
export function createStaticBoid(
  genome: Genome,
  typeId: string,
  index: number,
  position: Vector2 = { x: 0, y: 0 },
  rotation: number = 0
): Boid {
  const phenotype = computePhenotype(genome, defaultWorldPhysics);

  // Create velocity vector pointing in rotation direction
  const velocity = {
    x: Math.cos(rotation),
    y: Math.sin(rotation),
  };

  return {
    id: `static-${Math.random().toString(36).substr(2, 9)}`,
    index,
    isDead: false,
    position,
    velocity,
    acceleration: { x: 0, y: 0 },
    typeId,
    genome,
    phenotype,
    energy: phenotype.maxEnergy,
    health: phenotype.maxHealth,
    age: 0,
    reproductionCooldown: 0,
    seekingMate: false,
    mateId: null,
    matingBuildupFrames: 0,
    eatingCooldownFrames: 0,
    attackCooldownFrames: 0,
    stance: "idle" as const,
    previousStance: null,
    positionHistory: [],
    targetId: null,
    targetLockFrame: 0,
    targetLockStrength: 0,
    mateCommitmentFrames: 0,
    stanceEnteredAtFrame: 0,
    substate: null,
    knockbackVelocity: null,
    knockbackFramesRemaining: 0,
  };
}

/**
 * Render a boid using Canvas 2D
 *
 * This uses the same rendering logic as the main simulation's Canvas 2D fallback.
 * The context should already be translated/scaled to the desired position.
 * Session 105: Now requires atlases parameter
 *
 * @param ctx - Canvas 2D rendering context
 * @param boid - The boid to render
 * @param scale - Additional scale multiplier (default: 1)
 * @param speciesConfig - Optional species configuration (for shape rendering)
 * @param atlases - Pre-generated atlases from resource
 */
export function renderBoidCanvas2D(
  ctx: CanvasRenderingContext2D,
  boid: Boid,
  scale: number = 1,
  speciesConfig?: SpeciesConfig,
  atlases?: AtlasesResult
): void {
  const { velocity, genome } = boid;

  // Session 96: Single source of truth for sizing comes from phenotype
  const baseSize = boid.phenotype.baseSize; // == collisionRadius
  const shapeName = speciesConfig?.visualConfig?.shape || "triangle";
  const shapeSize = shapeSizeParamFromBaseSize(shapeName, baseSize) * scale;
  const bodySize = baseSize * scale;

  // Calculate rotation from velocity
  const angle = Math.atan2(velocity.y, velocity.x);

  ctx.save();

  // Rotate to face direction of travel
  ctx.rotate(angle);

  // Use color from genome if available, otherwise default
  const color = genome.visual?.color || "#4ecdc4";
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  // Draw body shape using shape renderer
  // Session 99: Renderer now handles complete drawing (fill + stroke)
  // Session 105: Requires atlases parameter (optional for backward compat)
  if (atlases) {
    const shapeRenderer = getShapeRenderer(shapeName, atlases);
    shapeRenderer(ctx, shapeSize); // Renderer handles fill/stroke internally
  } else {
    // Fallback: draw a simple circle if no atlases provided
    ctx.beginPath();
    ctx.arc(0, 0, shapeSize * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // DEBUG: Draw collision radius circle (Session 96-97)
  // Shows the actual physics collision boundary for comparison
  ctx.save();
  ctx.strokeStyle = "rgba(255, 0, 0, 0.5)"; // Red semi-transparent
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]); // Dashed line
  // Collision radius from phenotype (should match visual size!)
  // Session 97: Apply scale parameter to match the scaled boid rendering
  const collisionRadius = boid.phenotype.collisionRadius * scale;
  ctx.beginPath();
  ctx.arc(0, 0, collisionRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash
  ctx.restore();

  // Draw body parts (eyes, fins, spikes, etc.)
  // GENOME-DRIVEN RENDERING (Session 92): Pass body part data to renderers
  if (genome.visual?.bodyParts && genome.visual.bodyParts.length > 0) {
    // Group body parts by type
    const partsByType = new Map<string, typeof genome.visual.bodyParts>();
    for (const part of genome.visual.bodyParts) {
      const existing = partsByType.get(part.type) || [];
      existing.push(part);
      partsByType.set(part.type, existing);
    }

    // Get tail color from species config (can be different from body color)
    const tailColor = speciesConfig?.visualConfig?.tailColor || color;

    for (const [partType, parts] of partsByType.entries()) {
      // Skip glow (it's handled via shadow effects)
      if (partType === "glow") continue;

      // Session 105: Requires atlases parameter (skip if not provided)
      if (!atlases) {
        continue; // Skip body parts if no atlases
      }

      const partRenderer = getBodyPartRenderer(partType as BodyPartType);
      if (partRenderer) {
        // Use tailColor for tails, body color for everything else
        const partColor = partType === "tail" ? tailColor : color;
        // Body parts scale/offset should be relative to collision radius (baseSize),
        // not the shape renderer's internal size parameter.
        partRenderer({
          ctx,
          atlas: atlases.bodyParts,
          boidSize: bodySize,
          color: partColor,
          bodyParts: parts,
        });
      }
    }
  }

  ctx.restore();
}

/**
 * Camera-like transform for static rendering
 * Provides world-to-screen coordinate transformation
 */
export interface StaticCamera {
  position: { x: number; y: number };
  zoom: number;
}

/**
 * Apply camera transform to canvas context
 */
export function applyCameraTransform(
  ctx: CanvasRenderingContext2D,
  camera: StaticCamera,
  canvasWidth: number,
  canvasHeight: number
): void {
  // Center the canvas
  ctx.translate(canvasWidth / 2, canvasHeight / 2);

  // Apply zoom
  ctx.scale(camera.zoom, camera.zoom);

  // Apply camera position (inverted for world-to-screen)
  ctx.translate(-camera.position.x, -camera.position.y);
}

/**
 * Render multiple boids to a canvas
 * Useful for grid layouts or comparison views
 */
export function renderBoidsCanvas2D(
  ctx: CanvasRenderingContext2D,
  boids: Boid[],
  options?: {
    camera?: StaticCamera;
    scale?: number;
    clearCanvas?: boolean;
    speciesConfig?: SpeciesConfig;
  }
): void {
  const {
    camera = { position: { x: 0, y: 0 }, zoom: 1 },
    scale = 1,
    clearCanvas = true,
    speciesConfig,
  } = options ?? {};

  if (clearCanvas) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  ctx.save();

  // Apply camera transform
  applyCameraTransform(ctx, camera, ctx.canvas.width, ctx.canvas.height);

  // Render each boid
  for (const boid of boids) {
    ctx.save();
    ctx.translate(boid.position.x, boid.position.y);
    renderBoidCanvas2D(ctx, boid, scale, speciesConfig);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * WebGL instance data for a single boid
 * This matches the format expected by the WebGL renderer
 */
export interface BoidInstanceData {
  position: [number, number];
  rotation: number;
  scale: number;
  color: [number, number, number, number];
  // Add more fields as needed for WebGL rendering
}

/**
 * Prepare boid data for WebGL rendering
 *
 * This extracts the necessary data from a boid and formats it
 * for the WebGL renderer's instance data format.
 *
 * @param boid - The boid to prepare
 * @returns Instance data for WebGL rendering
 */
export function prepareBoidWebGL(boid: Boid): BoidInstanceData {
  const { position, velocity, phenotype } = boid;

  // Calculate rotation from velocity
  const rotation = Math.atan2(velocity.y, velocity.x);

  // Get color from phenotype (RGB normalized to 0-1)
  const color: [number, number, number, number] = [0.31, 0.8, 0.77, 1.0]; // Default cyan

  return {
    position: [position.x, position.y],
    rotation,
    // Use baseSize (collisionRadius) as the render scale
    scale: phenotype.baseSize,
    color,
  };
}

/**
 * Prepare multiple boids for WebGL batch rendering
 */
export function prepareBoidsWebGL(boids: Boid[]): BoidInstanceData[] {
  return boids.map(prepareBoidWebGL);
}
