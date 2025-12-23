import { defineResource } from "braided";
import { eventKeywords } from "../boids/vocabulary/keywords";
import { CanvasAPI } from "./canvas";
import { BoidEngine } from "./engine";
import type { RuntimeController } from "./runtimeController";
import type { RuntimeStoreResource } from "./runtimeStore";
import type { Profiler } from "./profiler";

export type Renderer = {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
};

export const renderer = defineResource({
  dependencies: [
    "canvas",
    "engine",
    "runtimeStore",
    "runtimeController",
    "profiler",
  ],
  start: ({
    canvas,
    engine,
    runtimeStore,
    runtimeController,
    profiler,
  }: {
    canvas: CanvasAPI;
    engine: BoidEngine;
    runtimeStore: RuntimeStoreResource;
    runtimeController: RuntimeController;
    profiler: Profiler;
  }) => {
    let animationId: number | null = null;
    let isRunning = false;
    let lastFrameTime = performance.now();
    let fps = 60;

    // Fixed timestep configuration
    const FIXED_UPDATE_RATE = 60; // Updates per second (60 UPS)
    const FIXED_TIMESTEP = 1 / FIXED_UPDATE_RATE; // 0.01667 seconds (16.67ms)
    const MAX_ACCUMULATED_TIME = FIXED_TIMESTEP * 5; // Prevent spiral of death
    let accumulator = 0;

    // Keyboard shortcuts for visual toggles
    const handleKeyPress = (e: KeyboardEvent) => {
      const { ui } = runtimeStore.store.getState();
      const currentSettings = ui.visualSettings;

      switch (e.key.toLowerCase()) {
        case "t":
          // Toggle trails
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                trailsEnabled: !currentSettings.trailsEnabled,
              },
            },
          });
          console.log("Trails:", !currentSettings.trailsEnabled);
          break;
        case "e":
          // Toggle energy bars
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                energyBarsEnabled: !currentSettings.energyBarsEnabled,
              },
            },
          });
          console.log("Energy bars:", !currentSettings.energyBarsEnabled);
          break;
        case "h":
          // Toggle mating hearts
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                matingHeartsEnabled: !currentSettings.matingHeartsEnabled,
              },
            },
          });
          console.log("Mating hearts:", !currentSettings.matingHeartsEnabled);
          break;
        case "s":
          // Toggle stance symbols
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                stanceSymbolsEnabled: !currentSettings.stanceSymbolsEnabled,
              },
            },
          });
          console.log("Stance symbols:", !currentSettings.stanceSymbolsEnabled);
          break;
        case "d":
          // Toggle death markers
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                deathMarkersEnabled: !currentSettings.deathMarkersEnabled,
              },
            },
          });
          console.log("Death markers:", !currentSettings.deathMarkersEnabled);
          break;
        case "f":
          // Toggle food sources
          runtimeStore.store.setState({
            ui: {
              ...ui,
              visualSettings: {
                ...currentSettings,
                foodSourcesEnabled: !currentSettings.foodSourcesEnabled,
              },
            },
          });
          console.log("Food sources:", !currentSettings.foodSourcesEnabled);
          break;
        case " ":
          // Toggle pause (space bar)
          e.preventDefault();
          if (isRunning) {
            stop();
            console.log("Paused");
          } else {
            start();
            console.log("Resumed");
          }
          break;
        case "p":
          // Toggle profiler
          if (profiler.isEnabled()) {
            profiler.printSummary();
            profiler.disable();
          } else {
            profiler.reset();
            profiler.enable();
          }
          break;
        case "r":
          // Reset profiler metrics
          if (profiler.isEnabled()) {
            profiler.reset();
            console.log("Profiler metrics reset");
          }
          break;
        case "/":
        case "k":
          // Show help (/ or k)
          console.log(`
╔════════════════════════════════════════╗
║     EMERGENT BOIDS - KEYBOARD HELP     ║
╠════════════════════════════════════════╣
║ T - Toggle motion trails               ║
║ E - Toggle energy bars (prey)          ║
║ H - Toggle mating hearts               ║
║ S - Toggle stance symbols              ║
║ D - Toggle death markers               ║
║ F - Toggle food sources                ║
║ Space - Pause/Resume simulation        ║
║ P - Toggle performance profiler        ║
║ R - Reset profiler metrics             ║
║ K or / - Show this help                ║
╚════════════════════════════════════════╝
          `);
          break;
      }
    };

    // Register keyboard listener
    document.addEventListener("keydown", handleKeyPress);

    /**
     * Adjust color brightness based on energy ratio
     * Low energy = darker, high energy = brighter
     * @param hexColor - Hex color string (e.g., "#00ff88")
     * @param energyRatio - Energy ratio (0-1)
     * @returns RGB color string with adjusted brightness
     */
    const adjustColorBrightness = (
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

    const draw = () => {
      const { ctx, width, height } = canvas;
      const { simulation, ui, config } = runtimeStore.store.getState();

      // Get atmosphere settings (active event overrides base)
      const { base, activeEvent } = ui.visualSettings.atmosphere;
      const atmosphereSettings = activeEvent?.settings || base;

      // Clear canvas with atmosphere-controlled background
      profiler.start("render.clear");
      ctx.fillStyle = `rgba(0, 0, 0, ${atmosphereSettings.trailAlpha})`;
      ctx.fillRect(0, 0, width, height);
      profiler.end("render.clear");

      // Draw obstacles first (behind boids)
      profiler.start("render.obstacles");
      for (const obstacle of simulation.obstacles) {
        ctx.fillStyle = "#ff4444";
        ctx.beginPath();
        ctx.arc(
          obstacle.position.x,
          obstacle.position.y,
          obstacle.radius,
          0,
          Math.PI * 2
        );
        ctx.fill();

        // Draw outline
        ctx.strokeStyle = "#ff8888";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      profiler.end("render.obstacles");

      // Draw death markers (after obstacles, before boids)
      profiler.start("render.deathMarkers");
      if (
        ui.visualSettings.deathMarkersEnabled &&
        simulation.deathMarkers.length > 0
      ) {
        for (const marker of simulation.deathMarkers) {
          const speciesConfig = config.species[marker.typeId];
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

          ctx.save();

          // Draw colored circle behind skull (intensity shows danger level)
          ctx.globalAlpha = opacity * 0.4 * strengthRatio;
          ctx.fillStyle = speciesConfig.color;
          ctx.shadowColor = speciesConfig.color;
          ctx.shadowBlur = glowIntensity;
          ctx.beginPath();
          ctx.arc(
            marker.position.x,
            marker.position.y,
            circleRadius,
            0,
            Math.PI * 2
          );
          ctx.fill();

          // Draw skull emoji with strength-based size
          ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
          ctx.shadowBlur = 8;
          ctx.globalAlpha = opacity;
          ctx.font = `${fontSize}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("💀", marker.position.x, marker.position.y);

          ctx.restore();
        }
      }
      profiler.end("render.deathMarkers");

      // Draw food sources
      profiler.start("render.foodSources");
      if (
        ui.visualSettings.foodSourcesEnabled &&
        simulation.foodSources.length > 0
      ) {
        for (const food of simulation.foodSources) {
          if (food.energy <= 0) continue;

          const energyRatio = food.energy / food.maxEnergy; // 0.0 to 1.0

          // Size scales with energy (10-25px radius)
          const radius = 10 + energyRatio * 15;

          // Opacity scales with energy (30-100%)
          const opacity = Math.max(0.3, energyRatio);

          // Color based on type
          const color = food.sourceType === "prey" ? "#4CAF50" : "#F44336"; // Green for prey, red for predator

          ctx.save();

          // Draw circle
          ctx.globalAlpha = opacity;
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(food.position.x, food.position.y, radius, 0, Math.PI * 2);
          ctx.fill();

          // Draw emoji
          const emoji = food.sourceType === "prey" ? "🌿" : "🥩";
          const fontSize = 16 + energyRatio * 8; // 16-24px
          ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
          ctx.shadowBlur = 4;
          ctx.font = `${fontSize}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(emoji, food.position.x, food.position.y);

          ctx.restore();
        }
      }
      profiler.end("render.foodSources");

      // Draw each boid
      profiler.start("render.boids");

      // OPTIMIZATION: Batch trail rendering
      // Collect all trail segments first, then draw them in batches
      // This reduces canvas state changes from ~10,000 to ~100
      if (ui.visualSettings.trailsEnabled) {
        profiler.start("render.trails.collect");

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

        for (const boid of engine.boids) {
          const speciesConfig = config.species[boid.typeId];
          if (!speciesConfig || boid.positionHistory.length <= 1) continue;

          // Calculate energy ratio for trail visibility
          const energyRatio = boid.energy / speciesConfig.lifecycle.maxEnergy;
          const baseAlpha = 0.3 + energyRatio * 0.5;

          const color = speciesConfig.color;
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
            const maxJump = Math.min(width, height) / 2;

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

        profiler.end("render.trails.collect");

        // Draw all batches
        profiler.start("render.trails.draw");

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (const [batchKey, batch] of trailBatches) {
          const [colorPart, alphaPart] = batchKey.split("|");
          const [r, g, b] = colorPart.split(",").map(Number);
          const alpha = parseFloat(alphaPart);

          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx.lineWidth = batch.lineWidth;

          // Draw all segments in this batch with a single stroke call
          ctx.beginPath();
          for (const seg of batch.segments) {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
          }
          ctx.stroke();
        }

        profiler.end("render.trails.draw");
      }

      // Draw boid bodies
      for (const boid of engine.boids) {
        const angle = Math.atan2(boid.velocity.y, boid.velocity.x);
        const speciesConfig = config.species[boid.typeId];
        if (!speciesConfig) continue;

        ctx.save();
        ctx.translate(boid.position.x, boid.position.y);
        ctx.rotate(angle);

        // Draw triangle pointing in direction of velocity
        // Use energy-based color brightness
        if (speciesConfig) {
          const energyRatio = boid.energy / speciesConfig.lifecycle.maxEnergy;
          const dynamicColor = adjustColorBrightness(
            speciesConfig.color,
            energyRatio
          );
          ctx.fillStyle = dynamicColor;
        } else {
          ctx.fillStyle = "#00ff88";
        }

        ctx.beginPath();

        // Predators are larger
        if (speciesConfig?.role === "predator") {
          ctx.moveTo(12, 0);
          ctx.lineTo(-6, 6);
          ctx.lineTo(-6, -6);
        } else {
          ctx.moveTo(8, 0);
          ctx.lineTo(-4, 4);
          ctx.lineTo(-4, -4);
        }

        ctx.closePath();
        ctx.fill();

        // Add subtle outline for better visibility
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();

        // Draw stance indicator (letter) on the boid
        if (speciesConfig) {
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
                stanceSymbol = "👀";
                stanceColor = "#ff69b4";
                break;
              case "mating":
                stanceSymbol = "❣️";
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

          if (stanceSymbol && ui.visualSettings.stanceSymbolsEnabled) {
            ctx.fillStyle = stanceColor;
            ctx.font = "bold 12px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            // Draw below the boid (offset by -12 for prey, -15 for predators)
            const yOffset = speciesConfig.role === "predator" ? -15 : -12;
            ctx.fillText(
              stanceSymbol,
              boid.position.x,
              boid.position.y + yOffset
            );
          }
        }

        // Draw energy bar above boid
        // Always show for predators, toggleable for prey
        const showEnergyBar =
          speciesConfig &&
          (speciesConfig.role === "predator" ||
            ui.visualSettings.energyBarsEnabled);
        if (showEnergyBar) {
          const energyPercent = boid.energy / speciesConfig.lifecycle.maxEnergy;
          const barWidth = 20;
          const barHeight = 3;
          const barX = boid.position.x - barWidth / 2;
          const barY = boid.position.y - 12;

          // Background
          ctx.fillStyle = "#333";
          ctx.fillRect(barX, barY, barWidth, barHeight);

          // Energy fill
          const energyColor =
            speciesConfig.role === "predator" ? "#ff0000" : "#00ff88";
          ctx.fillStyle = energyColor;
          ctx.fillRect(barX, barY, barWidth * energyPercent, barHeight);

          // Border
          ctx.strokeStyle = "#666";
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
      }
      profiler.end("render.boids");

      // Draw mating hearts (one per pair, centered between mates)
      profiler.start("render.matingHearts");
      if (ui.visualSettings.matingHeartsEnabled) {
        const drawnMatingPairs = new Set<string>();

        for (const boid of engine.boids) {
          if (boid.stance === "mating" && boid.mateId) {
            // Create a unique pair ID (sorted to ensure consistency)
            const pairId = [boid.id, boid.mateId].sort().join("-");

            // Skip if we've already drawn this pair
            if (drawnMatingPairs.has(pairId)) continue;
            drawnMatingPairs.add(pairId);

            // Find the mate
            const mate = engine.boids.find((b) => b.id === boid.mateId);
            if (!mate) continue;

            // Calculate midpoint with toroidal wrapping in mind
            // If boids are on opposite sides of canvas, we need to wrap the calculation
            let dx = mate.position.x - boid.position.x;
            let dy = mate.position.y - boid.position.y;

            // Wrap dx if crossing horizontal boundary
            if (Math.abs(dx) > width / 2) {
              dx = dx > 0 ? dx - width : dx + width;
            }

            // Wrap dy if crossing vertical boundary
            if (Math.abs(dy) > height / 2) {
              dy = dy > 0 ? dy - height : dy + height;
            }

            // Calculate wrapped midpoint
            let midX = boid.position.x + dx / 2;
            let midY = boid.position.y + dy / 2;

            // Wrap midpoint back into canvas bounds
            if (midX < 0) midX += width;
            if (midX > width) midX -= width;
            if (midY < 0) midY += height;
            if (midY > height) midY -= height;

            // Animated bobbing effect
            const time = performance.now() / 1000;
            const bobOffset = Math.sin(time * 3) * 4; // Bob 4px up/down

            // Draw heart emoji
            ctx.save();
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Add a subtle glow effect for the heart
            ctx.shadowBlur = 8;
            ctx.shadowColor = "rgba(255, 100, 200, 0.8)";

            ctx.fillText("❤️", midX, midY - 25 + bobOffset);

            // Reset shadow
            ctx.shadowBlur = 0;
            ctx.restore();
          }
        }
      }
      profiler.end("render.matingHearts");

      // Draw FPS counter and stats
      profiler.start("render.stats");
      const predatorCount = engine.boids.filter((b) => {
        const speciesConfig = config.species[b.typeId];
        return speciesConfig && speciesConfig.role === "predator";
      }).length;
      const preyCount = engine.boids.length - predatorCount;

      const startingY = 33;
      ctx.fillStyle = "#00ff88";
      ctx.font = "16px monospace";
      ctx.fillText(`FPS: ${Math.round(fps)}`, 25, startingY);
      ctx.fillText(`Total: ${engine.boids.length}`, 25, startingY + 20);
      ctx.fillStyle = "#00ff88";
      ctx.fillText(`Prey: ${preyCount}`, 25, startingY + 40);
      ctx.fillStyle = "#ff0000";
      ctx.fillText(`Predators: ${predatorCount}`, 25, startingY + 60);
      ctx.fillStyle = "#00ff88";
      ctx.fillText(
        `Obstacles: ${simulation.obstacles.length}`,
        25,
        startingY + 80
      );
      profiler.end("render.stats");
    };

    const animate = () => {
      profiler.start("frame.total");

      // Calculate frame time
      const currentTime = performance.now();
      const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
      lastFrameTime = currentTime;

      // Smooth FPS calculation (exponential moving average) - for display only
      fps = fps * 0.9 + (1 / deltaTime) * 0.1;

      // Add frame time to accumulator
      accumulator += deltaTime;

      // Clamp accumulator to prevent spiral of death (if simulation can't keep up)
      if (accumulator > MAX_ACCUMULATED_TIME) {
        accumulator = MAX_ACCUMULATED_TIME;
      }

      // Update simulation at fixed rate (may run 0, 1, or multiple times per frame)
      profiler.start("frame.update");
      while (accumulator >= FIXED_TIMESTEP) {
        engine.update(FIXED_TIMESTEP); // Always pass fixed 16.67ms timestep
        accumulator -= FIXED_TIMESTEP;
      }
      profiler.end("frame.update");

      // Check for catches after all updates (once per render frame)
      profiler.start("frame.catches");
      const catches = engine.checkCatches();
      for (const catchEvent of catches) {
        runtimeController.dispatch({
          type: eventKeywords.boids.caught,
          predatorId: catchEvent.predatorId,
          preyId: catchEvent.preyId,
          preyTypeId: catchEvent.preyTypeId, // Include prey type for death tracking
          preyEnergy: catchEvent.preyEnergy,
          preyPosition: catchEvent.preyPosition,
        });
      }
      profiler.end("frame.catches");

      // Render at display rate (always once per frame)
      profiler.start("frame.render");
      draw();
      profiler.end("frame.render");

      profiler.end("frame.total");

      // Record frame metrics
      const metrics = profiler.getMetrics();
      const frameTime =
        metrics.find((m) => m.name === "frame.total")?.lastTime || 0;
      const updateTime =
        metrics.find((m) => m.name === "frame.update")?.lastTime || 0;
      const renderTime =
        metrics.find((m) => m.name === "frame.render")?.lastTime || 0;
      profiler.recordFrame(frameTime, fps, updateTime, renderTime);

      animationId = requestAnimationFrame(animate);
    };

    const start = () => {
      if (!isRunning) {
        isRunning = true;
        animate();
      }
    };

    const stop = () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      isRunning = false;
    };

    const cleanup = () => {
      document.removeEventListener("keydown", handleKeyPress);
    };

    return { start, stop, isRunning, cleanup } satisfies Renderer & {
      cleanup: () => void;
    };
  },
  halt: (renderer: Renderer & { cleanup?: () => void }) => {
    renderer.stop();
    if (renderer.cleanup) {
      renderer.cleanup();
    }
  },
});
