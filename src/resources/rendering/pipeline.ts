/**
 * Functional Rendering Pipeline
 *
 * Breaks down rendering into composable, pure-ish functions.
 * Each function takes a RenderContext and draws one aspect of the simulation.
 */

import { bodyPartKeywords } from "@/boids/vocabulary/keywords";
import type {
  Boid,
  DeathMarker,
  FoodSource,
  Obstacle,
  SpeciesConfig,
} from "../../boids/vocabulary/schemas/prelude";
import type { Profiler } from "../profiler";
import { getBodyPartRenderer, getShapeRenderer } from "./shapes";

/**
 * Render Context - All data needed for rendering
 */
export type RenderContext = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  boids: Boid[];
  obstacles: Obstacle[];
  deathMarkers: DeathMarker[];
  foodSources: FoodSource[];
  speciesConfigs: Record<string, SpeciesConfig>;
  visualSettings: {
    trailsEnabled: boolean;
    energyBarsEnabled: boolean;
    matingHeartsEnabled: boolean;
    stanceSymbolsEnabled: boolean;
    deathMarkersEnabled: boolean;
    foodSourcesEnabled: boolean;
    atmosphere: {
      trailAlpha: number;
    };
  };
  profiler?: Profiler;
};

/**
 * Adjust color brightness based on energy ratio
 * Low energy = darker, high energy = brighter
 */
export const adjustColorBrightness = (
  hexColor: string,
  energyRatio: number
): string => {
  // Extract RGB from hex
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  // Adjust brightness (0.4 = 40% brightness at 0 energy, 1.0 = full at max)
  const minBrightness = 0.4;
  const brightness = minBrightness + (1 - minBrightness) * energyRatio;

  const newR = Math.round(r * brightness);
  const newG = Math.round(g * brightness);
  const newB = Math.round(b * brightness);

  return `rgb(${newR}, ${newG}, ${newB})`;
};

/**
 * Clear canvas with atmosphere-controlled background
 */
export const renderBackground = (rc: RenderContext): void => {
  rc.profiler?.start("render.clear");
  rc.ctx.fillStyle = `rgba(0, 0, 0, ${rc.visualSettings.atmosphere.trailAlpha})`;
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
    rc.ctx.fillStyle = speciesConfig.visual.color;
    rc.ctx.shadowColor = speciesConfig.visual.color;
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

/**
 * Render boid trails (batched for performance)
 */
export const renderTrails = (rc: RenderContext): void => {
  if (!rc.visualSettings.trailsEnabled) {
    return;
  }

  rc.profiler?.start("render.trails.collect");

  // Group segments by color and alpha (quantized to reduce batches)
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

  // Map key: "color|alpha|lineWidth"
  const trailBatches = new Map<string, TrailBatch>();

  for (const boid of rc.boids) {
    const speciesConfig = rc.speciesConfigs[boid.typeId];
    if (!speciesConfig || boid.positionHistory.length <= 1) continue;

    // Check if this species should render trails
    const shouldRenderTrail = speciesConfig.visual?.trail ?? true;
    if (!shouldRenderTrail) continue;

    // Calculate energy ratio for trail visibility
    const energyRatio = boid.energy / speciesConfig.lifecycle.maxEnergy;
    const baseAlpha = 0.3 + energyRatio * 0.5;

    // Use custom trail color if specified, otherwise use species color
    const color = speciesConfig.visual.trailColor || speciesConfig.visual.color;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
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

  for (const boid of rc.boids) {
    const angle = Math.atan2(boid.velocity.y, boid.velocity.x);
    const speciesConfig = rc.speciesConfigs[boid.typeId];
    if (!speciesConfig) continue;

    rc.ctx.save();
    rc.ctx.translate(boid.position.x, boid.position.y);
    rc.ctx.rotate(angle);

    // Get shape and size from species config
    const shape = speciesConfig.visual?.shape || "circle";
    const sizeMultiplier = speciesConfig.visual?.size || 1.0;
    const baseSize = speciesConfig.role === "predator" ? 12 : 8;
    const size = baseSize * sizeMultiplier;

    // Energy-based color brightness
    const energyRatio = boid.energy / speciesConfig.lifecycle.maxEnergy;
    const dynamicColor = adjustColorBrightness(
      speciesConfig.visual.color,
      energyRatio
    );

    // Check if glow effect is requested
    const bodyParts = speciesConfig.visual?.bodyParts || [];
    const hasGlow = bodyParts.includes(bodyPartKeywords.glow);

    if (hasGlow) {
      rc.ctx.shadowBlur = size * 0.8;
      rc.ctx.shadowColor = dynamicColor;
    }

    // Render main body shape
    rc.ctx.fillStyle = dynamicColor;
    const shapeRenderer = getShapeRenderer(shape);
    shapeRenderer(rc.ctx, size);
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
    for (const partName of bodyParts) {
      if (partName === "glow") continue; // Already handled above
      const partRenderer = getBodyPartRenderer(partName);
      if (partRenderer) {
        // Use custom tail color if specified, otherwise use species color
        const partColor =
          partName === "tail" && speciesConfig.visual.tailColor
            ? speciesConfig.visual.tailColor
            : speciesConfig.visual.color;
        partRenderer(rc.ctx, size, partColor);
      }
    }

    rc.ctx.restore();
  }

  rc.profiler?.end("render.boids");
};

/**
 * Render stance symbols above boids
 */
export const renderStanceSymbols = (rc: RenderContext): void => {
  if (!rc.visualSettings.stanceSymbolsEnabled) {
    return;
  }

  for (const boid of rc.boids) {
    const speciesConfig = rc.speciesConfigs[boid.typeId];
    if (!speciesConfig) continue;

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
      }
    }

    if (stanceSymbol) {
      rc.ctx.fillStyle = stanceColor;
      rc.ctx.font = "bold 12px monospace";
      rc.ctx.textAlign = "center";
      rc.ctx.textBaseline = "bottom";
      // Draw below the boid (offset by -12 for prey, -15 for predators)
      const yOffset = speciesConfig.role === "predator" ? -15 : -12;
      rc.ctx.fillText(stanceSymbol, boid.position.x, boid.position.y + yOffset);
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

    const energyPercent = boid.energy / speciesConfig.lifecycle.maxEnergy;
    const barWidth = 20;
    const barHeight = 3;
    const barX = boid.position.x - barWidth / 2;
    const barY = boid.position.y - 12;

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
 * Render mating hearts between paired boids
 */
export const renderMatingHearts = (rc: RenderContext): void => {
  if (!rc.visualSettings.matingHeartsEnabled) {
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

      // Animated bobbing effect
      const time = performance.now() / 1000;
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

  const predatorCount = rc.boids.filter((b) => {
    const speciesConfig = rc.speciesConfigs[b.typeId];
    return speciesConfig && speciesConfig.role === "predator";
  }).length;
  const preyCount = rc.boids.length - predatorCount;

  const startingY = 33;
  rc.ctx.fillStyle = "#00ff88";
  rc.ctx.font = "16px monospace";
  rc.ctx.fillText(`FPS: ${Math.round(fps)}`, 25, startingY);
  rc.ctx.fillText(`Total: ${rc.boids.length}`, 25, startingY + 20);
  rc.ctx.fillStyle = "#00ff88";
  rc.ctx.fillText(`Prey: ${preyCount}`, 25, startingY + 40);
  rc.ctx.fillStyle = "#ff0000";
  rc.ctx.fillText(`Predators: ${predatorCount}`, 25, startingY + 60);
  rc.ctx.fillStyle = "#00ff88";
  rc.ctx.fillText(`Obstacles: ${obstacleCount}`, 25, startingY + 80);

  rc.profiler?.end("render.stats");
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

  // Layer 2: Static environment
  renderObstacles(rc);
  renderDeathMarkers(rc);
  renderFoodSources(rc);

  // Layer 3: Boid trails (behind bodies)
  renderTrails(rc);

  // Layer 4: Boid bodies
  renderBoidBodies(rc);

  // Layer 5: Boid overlays (stance, energy, hearts)
  renderStanceSymbols(rc);
  renderEnergyBars(rc);
  renderMatingHearts(rc);

  // Layer 6: UI overlay
  renderStats(rc, fps, obstacleCount);
};
