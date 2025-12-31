/**
 * Functional Rendering Pipeline
 *
 * Breaks down rendering into composable, pure-ish functions.
 * Each function takes a RenderContext and draws one aspect of the simulation.
 */

import type {
  Boid,
  DeathMarker,
  FoodSource,
  Obstacle,
  SpeciesConfig,
} from "../../boids/vocabulary/schemas/prelude";
import type { Profiler } from "../profiler";
import type { TimeState } from "../time";
import type { CameraAPI, CameraMode } from "../camera";
import type { BodyPartType } from "@/lib/coordinates";
import { shapeSizeParamFromBaseSize } from "@/lib/shapeSizing";
import { getBodyPartRenderer, getShapeRenderer } from "./shapes";
import { adjustColorBrightness, hexToRgba, toRgb } from "@/lib/colors";
import { shouldShowHealthBar, getWoundedTint } from "@/boids/lifecycle/health";

/**
 * Render Context - All data needed for rendering
 */
export type RenderContext = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  backgroundColor: string; // World background color from profile
  boids: Boid[]; // Visible boids (for rendering)
  allBoids: Boid[]; // All boids in world (for stats)
  obstacles: Obstacle[];
  deathMarkers: DeathMarker[];
  foodSources: FoodSource[];
  speciesConfigs: Record<string, SpeciesConfig>;
  visualSettings: {
    trailsEnabled: boolean;
    energyBarsEnabled: boolean;
    healthBarsEnabled: boolean; // NEW: Health bars toggle
    matingHeartsEnabled: boolean;
    stanceSymbolsEnabled: boolean;
    deathMarkersEnabled: boolean;
    headerCollapsed: boolean;
    foodSourcesEnabled: boolean;
    atmosphere: {
      trailAlpha: number;
    };
  };
  timeState: TimeState; // Time state for pause overlay and speed indicator
  simulationFrame: number; // NEW - Session 75: Current simulation frame (for stance indicators)
  camera: CameraAPI; // Camera for coordinate transforms
  simulationTick: number; // NEW - Session 75: Current lifecycle tick (for stance indicators)
  profiler?: Profiler;
};

/**
 * Level of Detail (LOD) Configuration
 * Session 72: Dynamic quality scaling based on boid count
 */
type LODConfig = {
  renderBodyParts: boolean; // Render eyes, fins, tails, etc.
  renderStanceSymbols: boolean; // Render stance emojis
  renderMatingHearts: boolean; // Render mating hearts
  trailSkipMod: number; // Modulo for trail updates (3 = every 3rd boid)
};

/**
 * Calculate LOD settings based on total boid count
 * Gracefully degrades visual quality to maintain performance
 *
 * Session 72B: Adjusted thresholds after physics slowdown (30 UPS)
 * Physics at 30 UPS provides much better performance, so we can keep
 * full quality at much higher boid counts before degrading visuals.
 */
const calculateLOD = (boidCount: number): LODConfig => {
  // High quality: < 2500 boids - all features enabled
  // With 30 UPS physics, we get 50 FPS at 1800 boids, so plenty of headroom
  if (boidCount < 2500) {
    return {
      renderBodyParts: true,
      renderStanceSymbols: true,
      renderMatingHearts: true,
      trailSkipMod: 1, // Render all trails - no blinking!
    };
  }

  // Medium quality: 2500-3500 boids - disable decorative elements
  if (boidCount < 3500) {
    return {
      renderBodyParts: false, // Disable body parts (eyes, fins, etc)
      renderStanceSymbols: false, // Disable stance emojis
      renderMatingHearts: false, // Disable mating hearts
      trailSkipMod: 1, // Still render all trails (no blinking)
    };
  }

  // Low quality: 3500+ boids - skip some trails if needed
  return {
    renderBodyParts: false,
    renderStanceSymbols: false,
    renderMatingHearts: false,
    trailSkipMod: 2, // Only skip trails at very high counts
  };
};

/**
 * Clear canvas with atmosphere-controlled background
 */
export const renderBackground = (rc: RenderContext): void => {
  rc.profiler?.start("render.clear");
  // Use background color from profile with trail alpha for motion blur effect
  rc.ctx.fillStyle = hexToRgba(
    rc.backgroundColor,
    rc.visualSettings.atmosphere.trailAlpha
  );
  rc.ctx.fillRect(0, 0, rc.width, rc.height);
  rc.profiler?.end("render.clear");
};

/**
 * Render obstacles with hazard pattern
 */
export const renderObstacles = (rc: RenderContext): void => {
  rc.profiler?.start("render.obstacles");
  for (const obstacle of rc.obstacles) {
    const { x, y } = obstacle.position;
    const radius = obstacle.radius;

    rc.ctx.save();

    // Create clipping region for the circle
    rc.ctx.beginPath();
    rc.ctx.arc(x, y, radius, 0, Math.PI * 2);
    rc.ctx.clip();

    // Draw hazard stripes (black and yellow diagonal pattern)
    const stripeWidth = 8;
    const numStripes = Math.ceil((radius * 2 + radius * 2) / stripeWidth);

    for (let i = -numStripes; i < numStripes; i++) {
      // Alternate between black and yellow
      rc.ctx.fillStyle = i % 2 === 0 ? "#000000" : "#FFD700";
      rc.ctx.fillRect(
        x - radius * 2 + i * stripeWidth,
        y - radius * 2,
        stripeWidth,
        radius * 4
      );
    }

    rc.ctx.restore();

    // Draw thick warning border
    rc.ctx.strokeStyle = "#FFD700"; // Yellow border
    rc.ctx.lineWidth = 3;
    rc.ctx.shadowColor = "#FFD700";
    rc.ctx.shadowBlur = 10;
    rc.ctx.beginPath();
    rc.ctx.arc(x, y, radius, 0, Math.PI * 2);
    rc.ctx.stroke();

    // Reset shadow
    rc.ctx.shadowBlur = 0;

    // Optional: Add warning symbol in center
    if (radius > 20) {
      rc.ctx.font = `${radius * 0.8}px Arial`;
      rc.ctx.textAlign = "center";
      rc.ctx.textBaseline = "middle";
      rc.ctx.fillStyle = "#FFD700";
      rc.ctx.strokeStyle = "#000000";
      rc.ctx.lineWidth = 2;
      rc.ctx.strokeText("⚠", x, y);
      rc.ctx.fillText("⚠", x, y);
    }
  }
  rc.profiler?.end("render.obstacles");
};

/**
 * Render death markers
 */
export const renderDeathMarkers = (rc: RenderContext): void => {
  rc.profiler?.start("render.deathMarkers");
  if (!rc.visualSettings.deathMarkersEnabled || rc.deathMarkers.length === 0) {
    rc.profiler?.end("render.deathMarkers");
    return;
  }

  for (const marker of rc.deathMarkers) {
    const speciesConfig = rc.speciesConfigs[marker.typeId];
    if (!speciesConfig) continue;

    // Calculate visual properties based on strength and remaining ticks
    const strengthRatio = marker.strength / 5.0; // Max strength is 5.0
    const tickRatio = marker.remainingTicks / marker.maxLifetimeTicks;

    // Opacity based on remaining ticks (fades as it expires)
    const opacity = Math.max(0.3, tickRatio);

    // Size based on strength (stronger = larger)
    const baseSize = 20;
    const fontSize = baseSize + strengthRatio * 10; // 20-30px
    const circleRadius = 12 + strengthRatio * 8; // 12-20px

    // Glow intensity based on strength
    const glowIntensity = 8 + strengthRatio * 12; // 8-20px blur

    rc.ctx.save();

    // Draw colored circle behind skull (intensity shows danger level)
    rc.ctx.globalAlpha = opacity * 0.4 * strengthRatio;
    rc.ctx.fillStyle = speciesConfig.baseGenome.visual.color;
    rc.ctx.shadowColor = speciesConfig.baseGenome.visual.color;
    rc.ctx.shadowBlur = glowIntensity;
    rc.ctx.beginPath();
    rc.ctx.arc(
      marker.position.x,
      marker.position.y,
      circleRadius,
      0,
      Math.PI * 2
    );
    rc.ctx.fill();

    // Draw skull emoji with strength-based size
    rc.ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    rc.ctx.shadowBlur = 8;
    rc.ctx.globalAlpha = opacity;
    rc.ctx.font = `${fontSize}px Arial`;
    rc.ctx.textAlign = "center";
    rc.ctx.textBaseline = "middle";
    rc.ctx.fillText("💀", marker.position.x, marker.position.y);

    rc.ctx.restore();
  }
  rc.profiler?.end("render.deathMarkers");
};

/**
 * Render food sources
 */
export const renderFoodSources = (rc: RenderContext): void => {
  rc.profiler?.start("render.foodSources");
  if (!rc.visualSettings.foodSourcesEnabled || rc.foodSources.length === 0) {
    rc.profiler?.end("render.foodSources");
    return;
  }

  for (const food of rc.foodSources) {
    if (food.energy <= 0) continue;

    const energyRatio = food.energy / food.maxEnergy; // 0.0 to 1.0

    // Size scales with energy (12-28px radius)
    const radius = 12 + energyRatio * 14;

    // Opacity scales with energy (50-100%)
    const opacity = Math.max(0.5, energyRatio);

    // Color based on type
    const color = food.sourceType === "prey" ? "#4CAF50" : "#F44336";

    rc.ctx.save();
    rc.ctx.globalAlpha = opacity;

    // Draw outline circle only (no fill)
    rc.ctx.strokeStyle = color;
    rc.ctx.lineWidth = 2.5;
    rc.ctx.shadowColor = color;
    rc.ctx.shadowBlur = 8;
    rc.ctx.beginPath();
    rc.ctx.arc(food.position.x, food.position.y, radius, 0, Math.PI * 2);
    rc.ctx.stroke();

    // Draw emoji (larger and more prominent)
    const emoji = food.sourceType === "prey" ? "🌿" : "🥩";
    const fontSize = 20 + energyRatio * 10; // 18-28px (larger)
    rc.ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    rc.ctx.shadowBlur = 6;
    rc.ctx.font = `${fontSize}px Arial`;
    rc.ctx.textAlign = "center";
    rc.ctx.textBaseline = "middle";
    rc.ctx.fillStyle = "#ffffff"; // White fill for better visibility
    rc.ctx.fillText(emoji, food.position.x, food.position.y);

    rc.ctx.restore();
  }
  rc.profiler?.end("render.foodSources");
};

// PERFORMANCE OPTIMIZATION (Session 71): Reusable trail batch map
// Reduces allocations from 1 Map + ~20-50 arrays per frame to 0 allocations
type TrailSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};
type TrailBatch = {
  segments: TrailSegment[];
  lineWidth: number;
};

let trailBatchCache: Map<string, TrailBatch> | null = null;

/**
 * Render boid trails (batched for performance)
 */
export const renderTrails = (rc: RenderContext): void => {
  if (!rc.visualSettings.trailsEnabled) {
    return;
  }

  rc.profiler?.start("render.trails.collect");

  // OPTIMIZATION: Reuse batch map from previous frame
  if (!trailBatchCache) {
    trailBatchCache = new Map();
  }

  // Clear segment arrays without deallocating batch objects
  for (const batch of trailBatchCache.values()) {
    batch.segments.length = 0; // Clear in-place
  }

  // Map key: "color|alpha|lineWidth"
  const trailBatches = trailBatchCache;

  // Session 72: Dynamic LOD based on boid count
  const lod = calculateLOD(rc.allBoids.length);

  for (let boidIdx = 0; boidIdx < rc.boids.length; boidIdx++) {
    const boid = rc.boids[boidIdx];

    // Session 72: Skip trails based on LOD (render every Nth boid's trail)
    if (boidIdx % lod.trailSkipMod !== 0) continue;

    const speciesConfig = rc.speciesConfigs[boid.typeId];
    if (!speciesConfig || boid.positionHistory.length <= 1) continue;

    // Check if this species should render trails
    const shouldRenderTrail = speciesConfig.visualConfig?.trail ?? true;
    if (!shouldRenderTrail) continue;

    // Calculate energy ratio for trail visibility
    const energyRatio = boid.energy / boid.phenotype.maxEnergy;
    const baseAlpha = 0.3 + energyRatio * 0.5;

    // Use custom trail color if specified, otherwise use individual genome color
    const color = speciesConfig.visualConfig.trailColor || boid.phenotype.color;
    const [r, g, b] = toRgb(color);
    const lineWidth = speciesConfig.role === "predator" ? 2 : 1.5;

    // Collect segments for this boid
    for (let i = 0; i < boid.positionHistory.length - 1; i++) {
      const pos1 = boid.positionHistory[i];
      const pos2 = boid.positionHistory[i + 1];

      // Skip if toroidal wrap detected
      const dx = Math.abs(pos2.x - pos1.x);
      const dy = Math.abs(pos2.y - pos1.y);
      const maxJump = Math.min(rc.width, rc.height) / 2;

      if (dx > maxJump || dy > maxJump) {
        continue;
      }

      // Calculate alpha for this segment
      const segmentRatio = i / boid.positionHistory.length;
      const alpha = baseAlpha * segmentRatio;

      // Quantize alpha to reduce number of batches (10 levels)
      const quantizedAlpha = Math.round(alpha * 10) / 10;

      // Create batch key
      const batchKey = `${r},${g},${b}|${quantizedAlpha}|${lineWidth}`;

      // Get or create batch
      let batch = trailBatches.get(batchKey);
      if (!batch) {
        batch = { segments: [], lineWidth };
        trailBatches.set(batchKey, batch);
      }

      // Add segment to batch
      batch.segments.push({
        x1: pos1.x,
        y1: pos1.y,
        x2: pos2.x,
        y2: pos2.y,
      });
    }
  }

  rc.profiler?.end("render.trails.collect");

  // Draw all batches
  rc.profiler?.start("render.trails.draw");

  rc.ctx.lineCap = "round";
  rc.ctx.lineJoin = "round";

  for (const [batchKey, batch] of trailBatches) {
    const [colorPart, alphaPart] = batchKey.split("|");
    const [r, g, b] = colorPart.split(",").map(Number);
    const alpha = parseFloat(alphaPart);

    rc.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    rc.ctx.lineWidth = batch.lineWidth;

    // Draw all segments in this batch with a single stroke call
    rc.ctx.beginPath();
    for (const seg of batch.segments) {
      rc.ctx.moveTo(seg.x1, seg.y1);
      rc.ctx.lineTo(seg.x2, seg.y2);
    }
    rc.ctx.stroke();
  }

  rc.profiler?.end("render.trails.draw");
};

/**
 * Render boid bodies with species-specific shapes and body parts
 */
export const renderBoidBodies = (rc: RenderContext): void => {
  rc.profiler?.start("render.boids");

  // Session 72: Dynamic LOD based on boid count
  const lod = calculateLOD(rc.allBoids.length);

  for (const boid of rc.boids) {
    const angle = Math.atan2(boid.velocity.y, boid.velocity.x);
    const speciesConfig = rc.speciesConfigs[boid.typeId];
    if (!speciesConfig) continue;

    rc.ctx.save();
    rc.ctx.translate(boid.position.x, boid.position.y);
    rc.ctx.rotate(angle);

    // Session 96: Single source of truth for sizing comes from phenotype
    const shape = speciesConfig.visualConfig?.shape || "circle";
    const baseSize = boid.phenotype.baseSize; // == collisionRadius
    // Shapes have different internal max extent factors, so we invert per-shape.
    const shapeSize = shapeSizeParamFromBaseSize(shape, baseSize);

    // Energy-based color brightness
    const energyRatio = boid.energy / boid.phenotype.maxEnergy;
    const dynamicColor = adjustColorBrightness(
      boid.phenotype.color, // Use individual genome color, not species color
      energyRatio
    );

    // Check if glow effect is requested (from genome body parts)
    const bodyParts = speciesConfig.baseGenome?.visual?.bodyParts || [];
    const hasGlow = bodyParts.some(
      (part: { type: string }) => part.type === "glow"
    );

    if (hasGlow) {
      rc.ctx.shadowBlur = baseSize * 0.8;
      rc.ctx.shadowColor = dynamicColor;
    }

    // Render main body shape
    rc.ctx.fillStyle = dynamicColor;
    const shapeRenderer = getShapeRenderer(shape);
    shapeRenderer(rc.ctx, shapeSize);
    rc.ctx.fill();

    // Add subtle outline for better visibility
    rc.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    rc.ctx.lineWidth = 1;
    rc.ctx.stroke();

    // Reset shadow after main body
    if (hasGlow) {
      rc.ctx.shadowBlur = 0;
    }

    // Render body parts (eyes, fins, spikes, tail)
    // Session 72: Skip body parts at high boid counts for performance
    // Session 92: GENOME-DRIVEN RENDERING - Pass body part data to renderers
    if (lod.renderBodyParts && bodyParts.length > 0) {
      // PERFORMANCE OPTIMIZATION (Session 71): Reduce function lookups
      // Pre-determine tail color once instead of per-part
      const tailColor =
        speciesConfig.visualConfig?.tailColor || boid.phenotype.color;

      // Group body parts by type for genome-driven rendering
      const partsByType = new Map<string, typeof bodyParts>();
      for (const part of bodyParts) {
        const partType = typeof part === "string" ? part : part.type;
        if (partType === "glow") continue; // Already handled above

        const existing = partsByType.get(partType) || [];
        existing.push(part);
        partsByType.set(partType, existing);
      }

      // Render each part type with its genome data
      for (const [partType, parts] of partsByType.entries()) {
        const partRenderer = getBodyPartRenderer(partType as BodyPartType);
        if (partRenderer) {
          const partColor =
            partType === "tail" ? tailColor : boid.phenotype.color;
          // Body parts scale/offset should be relative to collision radius (baseSize),
          // not the shape renderer's internal size parameter.
          partRenderer(rc.ctx, baseSize, partColor, parts);
        }
      }
    }

    // Apply wounded tint overlay if damaged
    const woundedTint = getWoundedTint(boid);
    if (woundedTint) {
      rc.ctx.fillStyle = woundedTint;
      shapeRenderer(rc.ctx, shapeSize);
      rc.ctx.fill();
    }

    // DEBUG: Draw collision radius circle (Session 96)
    // Shows the actual physics collision boundary for comparison
    rc.ctx.save();
    rc.ctx.strokeStyle = "rgba(255, 0, 0, 0.5)"; // Red semi-transparent
    rc.ctx.lineWidth = 1;
    rc.ctx.setLineDash([3, 3]); // Dashed line
    // Collision radius from phenotype (should match visual size!)
    const collisionRadius = boid.phenotype.collisionRadius;
    rc.ctx.beginPath();
    rc.ctx.arc(0, 0, collisionRadius, 0, Math.PI * 2);
    rc.ctx.stroke();
    rc.ctx.setLineDash([]); // Reset dash
    rc.ctx.restore();

    rc.ctx.restore();
  }

  rc.profiler?.end("render.boids");
};

/**
 * Render stance symbols above boids (Session 75: Temporary indicators with fade-out)
 *
 * Shows stance symbol for 3-4 seconds after stance change, then fades out.
 * This keeps the UI engaging without constant visual clutter.
 */
export const renderStanceSymbols = (rc: RenderContext): void => {
  if (!rc.visualSettings.stanceSymbolsEnabled) {
    return;
  }

  // Session 72: Skip stance symbols at high boid counts for performance
  const lod = calculateLOD(rc.allBoids.length);
  if (!lod.renderStanceSymbols) {
    return;
  }

  for (const boid of rc.boids) {
    const speciesConfig = rc.speciesConfigs[boid.typeId];
    if (!speciesConfig) continue;

    // Session 75: Only show symbol if stance changed recently
    const framesSinceChange = rc.simulationFrame - boid.stanceEnteredAt;
    const DISPLAY_DURATION = 90; // Show for 30 ticks (~1 second at 30 UPS)
    const FADE_START = 60; // Start fading at 20 ticks (~1 second)

    // Don't render if stance change was too long ago
    if (framesSinceChange > DISPLAY_DURATION) {
      continue;
    }

    const stance = boid.stance;
    let stanceSymbol = "";
    let stanceColor = "#fff";

    if (speciesConfig.role === "predator") {
      // Predator stance symbols
      switch (stance) {
        case "hunting":
          stanceSymbol = "😈";
          stanceColor = "#ff0000";
          break;
        case "seeking_mate":
          stanceSymbol = "💕";
          stanceColor = "#ff69b4";
          break;
        case "mating":
          stanceSymbol = "❤️";
          stanceColor = "#ff1493";
          break;
        case "idle":
          stanceSymbol = "💤";
          stanceColor = "#666";
          break;
        case "eating":
          stanceSymbol = "🍔";
          stanceColor = "#ff8800";
          break;
      }
    } else {
      // Prey stance symbols
      switch (stance) {
        case "flocking":
          stanceSymbol = "🐦";
          stanceColor = "#00aaff";
          break;
        case "seeking_mate":
          stanceSymbol = "💕";
          stanceColor = "#ff69b4";
          break;
        case "mating":
          stanceSymbol = "❤️";
          stanceColor = "#ff1493";
          break;
        case "fleeing":
          stanceSymbol = "😱";
          stanceColor = "#ffaa00";
          break;
        case "eating":
          stanceSymbol = "🌿";
          stanceColor = "#4CAF50";
          break;
      }
    }

    if (stanceSymbol) {
      // Calculate fade-out alpha (Session 75)
      let alpha = 1.0;
      if (framesSinceChange > FADE_START) {
        // Fade from 1.0 to 0.0 over the last (DISPLAY_DURATION - FADE_START) ticks
        const fadeProgress =
          (framesSinceChange - FADE_START) / (DISPLAY_DURATION - FADE_START);
        alpha = 1.0 - fadeProgress;
      }

      rc.ctx.save();
      rc.ctx.globalAlpha = alpha;
      rc.ctx.fillStyle = stanceColor;
      rc.ctx.font = "bold 12px monospace";
      rc.ctx.textAlign = "center";
      rc.ctx.textBaseline = "bottom";
      // Draw below the boid (offset by -12 for prey, -15 for predators)
      const yOffset = speciesConfig.role === "predator" ? -15 : -12;
      rc.ctx.fillText(stanceSymbol, boid.position.x, boid.position.y + yOffset);
      rc.ctx.restore();
    }
  }
};

/**
 * Render energy bars above boids
 */
export const renderEnergyBars = (rc: RenderContext): void => {
  for (const boid of rc.boids) {
    const speciesConfig = rc.speciesConfigs[boid.typeId];
    if (!speciesConfig) continue;

    // Always show for predators, toggleable for prey
    const showEnergyBar =
      speciesConfig.role === "predator" || rc.visualSettings.energyBarsEnabled;

    if (!showEnergyBar) continue;

    const energyPercent = boid.energy / boid.phenotype.maxEnergy;
    const barWidth = 22;
    const barHeight = 3;
    const barX = boid.position.x - barWidth / 2;
    const barY = boid.position.y - 20;

    // Background
    rc.ctx.fillStyle = "#333";
    rc.ctx.fillRect(barX, barY, barWidth, barHeight);

    // Energy fill
    const energyColor =
      speciesConfig.role === "predator" ? "#ff0000" : "#00ff88";
    rc.ctx.fillStyle = energyColor;
    rc.ctx.fillRect(barX, barY, barWidth * energyPercent, barHeight);

    // Border
    rc.ctx.strokeStyle = "#666";
    rc.ctx.lineWidth = 1;
    rc.ctx.strokeRect(barX, barY, barWidth, barHeight);
  }
};

/**
 * Render health bars above boids (only when damaged)
 */
export const renderHealthBars = (rc: RenderContext): void => {
  if (!rc.visualSettings.healthBarsEnabled) return;

  for (const boid of rc.boids) {
    // Only show health bar if boid is damaged
    if (!shouldShowHealthBar(boid)) continue;

    const healthPercent = boid.health / boid.phenotype.maxHealth;
    const barWidth = 22;
    const barHeight = 3;
    const barX = boid.position.x - barWidth / 2;
    const barY = boid.position.y - 20; // Above the boid, well above energy bar

    // Background
    rc.ctx.fillStyle = "#222";
    rc.ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health fill (green -> yellow -> red based on health %)
    let healthColor: string;
    if (healthPercent > 0.7) {
      healthColor = "#00ff00"; // Green (healthy)
    } else if (healthPercent > 0.4) {
      healthColor = "#ffff00"; // Yellow (wounded)
    } else {
      healthColor = "#ff0000"; // Red (critical)
    }

    rc.ctx.fillStyle = healthColor;
    rc.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);

    // Border
    rc.ctx.strokeStyle = "#666";
    rc.ctx.lineWidth = 1;
    rc.ctx.strokeRect(barX, barY, barWidth, barHeight);
  }
};

/**
 * Render mating hearts between paired boids
 */
export const renderMatingHearts = (rc: RenderContext): void => {
  if (!rc.visualSettings.matingHeartsEnabled) {
    return;
  }

  // Session 72: Skip mating hearts at high boid counts for performance
  const lod = calculateLOD(rc.allBoids.length);
  if (!lod.renderMatingHearts) {
    return;
  }

  rc.profiler?.start("render.matingHearts");

  const drawnMatingPairs = new Set<string>();

  for (const boid of rc.boids) {
    if (boid.stance === "mating" && boid.mateId) {
      // Create a unique pair ID (sorted to ensure consistency)
      const pairId = [boid.id, boid.mateId].sort().join("-");

      // Skip if we've already drawn this pair
      if (drawnMatingPairs.has(pairId)) continue;
      drawnMatingPairs.add(pairId);

      // Find the mate
      const mate = rc.boids.find((b) => b.id === boid.mateId);
      if (!mate) continue;

      // Calculate midpoint with toroidal wrapping in mind
      let dx = mate.position.x - boid.position.x;
      let dy = mate.position.y - boid.position.y;

      // Wrap dx if crossing horizontal boundary
      if (Math.abs(dx) > rc.width / 2) {
        dx = dx > 0 ? dx - rc.width : dx + rc.width;
      }

      // Wrap dy if crossing vertical boundary
      if (Math.abs(dy) > rc.height / 2) {
        dy = dy > 0 ? dy - rc.height : dy + rc.height;
      }

      // Calculate wrapped midpoint
      let midX = boid.position.x + dx / 2;
      let midY = boid.position.y + dy / 2;

      // Wrap midpoint back into canvas bounds
      if (midX < 0) midX += rc.width;
      if (midX > rc.width) midX -= rc.width;
      if (midY < 0) midY += rc.height;
      if (midY > rc.height) midY -= rc.height;

      // Animated bobbing effect (uses simulation time so it pauses)
      const time = rc.timeState.simulationElapsedMs / 1000;
      const bobOffset = Math.sin(time * 3) * 4; // Bob 4px up/down

      // Draw heart emoji
      rc.ctx.save();
      rc.ctx.font = "12px Arial";
      rc.ctx.textAlign = "center";
      rc.ctx.textBaseline = "middle";

      // Add a subtle glow effect for the heart
      rc.ctx.shadowBlur = 8;
      rc.ctx.shadowColor = "rgba(255, 100, 200, 0.8)";

      rc.ctx.fillText("❤️", midX, midY - 25 + bobOffset);

      // Reset shadow
      rc.ctx.shadowBlur = 0;
      rc.ctx.restore();
    }
  }

  rc.profiler?.end("render.matingHearts");
};

/**
 * Render stats overlay (FPS, population counts)
 */
export const renderStats = (
  rc: RenderContext,
  fps: number,
  obstacleCount: number
): void => {
  rc.profiler?.start("render.stats");

  // Use allBoids for stats (entire world, not just visible viewport)
  const predatorCount = rc.allBoids.filter((b) => {
    const speciesConfig = rc.speciesConfigs[b.typeId];
    return speciesConfig && speciesConfig.role === "predator";
  }).length;
  const preyCount = rc.allBoids.length - predatorCount;

  // Responsive font size and positioning
  const isSmallScreen = rc.width < 600;
  const fontSize = isSmallScreen ? 12 : 16;
  const lineHeight = isSmallScreen ? 16 : 20;
  const startingX = isSmallScreen ? 10 : 25;
  const startingY = (() => {
    if (rc.visualSettings.headerCollapsed) {
      return 70;
    }
    return isSmallScreen ? 20 : 33;
  })();

  rc.ctx.fillStyle = "#00ff88";
  rc.ctx.font = `${fontSize}px monospace`;
  rc.ctx.fillText(`FPS: ${Math.round(fps)}`, startingX, startingY);
  rc.ctx.fillText(
    `Total: ${rc.allBoids.length}`,
    startingX,
    startingY + lineHeight
  );
  rc.ctx.fillStyle = "#00ff88";
  rc.ctx.fillText(`Prey: ${preyCount}`, startingX, startingY + lineHeight * 2);
  rc.ctx.fillStyle = "#ff0000";
  rc.ctx.fillText(
    `Predators: ${predatorCount}`,
    startingX,
    startingY + lineHeight * 3
  );
  rc.ctx.fillStyle = "#00ff88";
  rc.ctx.fillText(
    `Obstacles: ${obstacleCount}`,
    startingX,
    startingY + lineHeight * 4
  );

  // Paused overlay (if paused)
  if (rc.timeState.isPaused) {
    rc.ctx.save();

    // Semi-transparent overlay
    rc.ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    rc.ctx.fillRect(0, 0, rc.width, rc.height);

    // "PAUSED" text
    rc.ctx.fillStyle = "#00ff88";
    rc.ctx.font = "bold 64px 'Nunito Sans', sans-serif";
    rc.ctx.textAlign = "center";
    rc.ctx.textBaseline = "middle";
    rc.ctx.fillText("⏸️ PAUSED", rc.width / 2, rc.height / 2);

    // Instructions
    rc.ctx.fillStyle = "#ffffff";
    rc.ctx.font = "20px 'Nunito Sans', sans-serif";
    rc.ctx.fillText(
      "Press SPACE to resume or → to step forward",
      rc.width / 2,
      rc.height / 2 + 60
    );

    // Frame counter
    rc.ctx.fillStyle = "#888888";
    rc.ctx.font = "16px 'Nunito Sans', sans-serif";
    rc.ctx.fillText(
      `Frame: ${rc.timeState.simulationFrame}`,
      rc.width / 2,
      rc.height / 2 + 90
    );

    rc.ctx.restore();
  }

  // Speed indicator (if not 1x)
  if (rc.timeState.timeScale !== 1.0) {
    rc.ctx.save();
    rc.ctx.fillStyle = "#ffaa00";
    rc.ctx.font = "bold 24px 'Nunito Sans', sans-serif";
    rc.ctx.textAlign = "right";
    rc.ctx.textBaseline = "top";
    rc.ctx.fillText(`⏩ ${rc.timeState.timeScale}x`, rc.width - 20, 20);
    rc.ctx.restore();
  }

  rc.profiler?.end("render.stats");
};

/**
 * Render picker mode circle and target highlight
 */
export const renderPickerMode = (rc: RenderContext): void => {
  if (rc.camera.mode.type !== "picker") return;

  const { mouseWorldPos, targetBoidId, mouseInCanvas } = rc.camera.mode;

  // Only render if mouse is in canvas
  if (!mouseInCanvas) return;

  const ctx = rc.ctx;

  // Convert world position to screen position
  const screenPos = rc.camera.worldToScreen(mouseWorldPos.x, mouseWorldPos.y);

  // Draw picker circle (fixed screen-space radius)
  const pickerRadius = 80; // pixels
  ctx.save();
  ctx.strokeStyle = "rgba(100, 200, 255, 0.6)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, pickerRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Highlight target boid if one is selected
  if (targetBoidId) {
    const targetBoid = rc.allBoids.find((b) => b.id === targetBoidId);
    if (targetBoid) {
      const boidScreenPos = rc.camera.worldToScreen(
        targetBoid.position.x,
        targetBoid.position.y
      );

      ctx.save();
      ctx.strokeStyle = "rgba(100, 200, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(boidScreenPos.x, boidScreenPos.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
};

/**
 * Render pulsing ring around followed boid
 */
export const renderFollowedBoid = (rc: RenderContext): void => {
  if (rc.camera.mode.type !== "following") return;

  const followedBoid = rc.allBoids.find(
    (b) =>
      b.id ===
      (rc.camera.mode as Extract<CameraMode, { type: "following" }>).boidId
  );
  if (!followedBoid) return;

  const ctx = rc.ctx;
  const screenPos = rc.camera.worldToScreen(
    followedBoid.position.x,
    followedBoid.position.y
  );

  // Pulsing effect based on time
  const pulseSpeed = 0.5; // Hz
  const time = rc.timeState.simulationElapsedMs / 1000;
  const pulsePhase = time * pulseSpeed * Math.PI * 2;
  const pulseScale = 0.8 + Math.sin(pulsePhase) * 0.2; // 0.6 to 1.0
  const radius = 20 * pulseScale;
  const alpha = 0.5 + Math.sin(pulsePhase) * 0.3; // 0.2 to 0.8

  ctx.save();
  ctx.strokeStyle = `rgba(255, 200, 100, ${alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/**
 * Complete rendering pipeline - orchestrates all render passes
 */
export const renderFrame = (
  rc: RenderContext,
  fps: number,
  obstacleCount: number
): void => {
  // Layer 1: Background (with trails)
  renderBackground(rc);

  // Apply camera transform for world rendering
  rc.ctx.save();
  rc.ctx.translate(rc.width / 2, rc.height / 2);
  rc.ctx.scale(rc.camera.zoom, rc.camera.zoom);
  rc.ctx.translate(-rc.camera.x, -rc.camera.y);

  // Layer 2: Static environment
  renderObstacles(rc);
  renderDeathMarkers(rc);
  renderFoodSources(rc);

  // Layer 3: Boid trails (behind bodies)
  renderTrails(rc);

  // Layer 4: Boid bodies
  renderBoidBodies(rc);

  // Layer 5: Boid overlays (stance, energy, health, hearts)
  renderStanceSymbols(rc);
  renderEnergyBars(rc);
  renderHealthBars(rc); // NEW: Health bars
  renderMatingHearts(rc);

  // Restore transform for UI rendering
  rc.ctx.restore();

  // Layer 6: Camera mode overlays (picker circle, followed boid)
  renderPickerMode(rc);
  renderFollowedBoid(rc);

  // Layer 7: UI overlay (in screen space, not world space)
  renderStats(rc, fps, obstacleCount);
};
