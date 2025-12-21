import { defineResource } from "braided";
import { CanvasResource } from "./canvas";
import { BoidEngine } from "./engine";
import type { StartedRuntimeStore } from "./runtimeStore";
import type { RuntimeController } from "./runtimeController";
import { eventKeywords } from "../vocabulary/keywords";

export type Renderer = {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
};

export const renderer = defineResource({
  dependencies: ["canvas", "engine", "runtimeStore", "runtimeController"],
  start: ({
    canvas,
    engine,
    runtimeStore,
    runtimeController,
  }: {
    canvas: CanvasResource;
    engine: BoidEngine;
    runtimeStore: StartedRuntimeStore;
    runtimeController: RuntimeController;
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
      const state = runtimeStore.store.getState().state;
      const currentSettings = state.visualSettings;

      switch (e.key.toLowerCase()) {
        case "t":
          // Toggle trails
          runtimeStore.store.setState({
            state: {
              ...state,
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
            state: {
              ...state,
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
            state: {
              ...state,
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
            state: {
              ...state,
              visualSettings: {
                ...currentSettings,
                stanceSymbolsEnabled: !currentSettings.stanceSymbolsEnabled,
              },
            },
          });
          console.log("Stance symbols:", !currentSettings.stanceSymbolsEnabled);
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
║ Space - Pause/Resume simulation        ║
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
      const state = runtimeStore.store.getState().state;
      const visualSettings = state.visualSettings;

      // Clear canvas
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, width, height);

      // Draw obstacles first (behind boids)
      for (const obstacle of state.obstacles) {
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

      // Draw each boid
      for (const boid of engine.boids) {
        const angle = Math.atan2(boid.velocity.y, boid.velocity.x);
        const typeConfig = state.types[boid.typeId];

        // Draw motion trail first (behind the boid)
        if (
          visualSettings.trailsEnabled &&
          typeConfig &&
          boid.positionHistory.length > 1
        ) {
          // Calculate energy ratio for trail visibility
          const energyRatio = boid.energy / typeConfig.maxEnergy;
          // Higher energy = more visible trail (0.3 to 0.8 alpha range)
          const baseAlpha = 0.3 + energyRatio * 0.5;

          ctx.strokeStyle = typeConfig.color;
          ctx.lineWidth = typeConfig.role === "predator" ? 2 : 1.5;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          // Draw trail as connected line segments with fading opacity
          for (let i = 0; i < boid.positionHistory.length - 1; i++) {
            const pos1 = boid.positionHistory[i];
            const pos2 = boid.positionHistory[i + 1];

            // Skip drawing if positions are too far apart (toroidal wrap detected)
            // If distance > half canvas width/height, it's a wrap, not actual movement
            const dx = Math.abs(pos2.x - pos1.x);
            const dy = Math.abs(pos2.y - pos1.y);
            const maxJump = Math.min(width, height) / 2;

            if (dx > maxJump || dy > maxJump) {
              continue; // Skip this segment - it's a wrap
            }

            // Fade older positions (earlier in array = older = more transparent)
            const segmentRatio = i / boid.positionHistory.length;
            const alpha = baseAlpha * segmentRatio;

            // Extract RGB from hex color and apply alpha
            const color = typeConfig.color;
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);

            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

            ctx.beginPath();
            ctx.moveTo(pos1.x, pos1.y);
            ctx.lineTo(pos2.x, pos2.y);
            ctx.stroke();
          }
        }

        ctx.save();
        ctx.translate(boid.position.x, boid.position.y);
        ctx.rotate(angle);

        // Draw triangle pointing in direction of velocity
        // Use energy-based color brightness
        if (typeConfig) {
          const energyRatio = boid.energy / typeConfig.maxEnergy;
          const dynamicColor = adjustColorBrightness(
            typeConfig.color,
            energyRatio
          );
          ctx.fillStyle = dynamicColor;
        } else {
          ctx.fillStyle = "#00ff88";
        }

        ctx.beginPath();

        // Predators are larger
        if (typeConfig?.role === "predator") {
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
        if (typeConfig) {
          const stance = boid.stance;
          let stanceSymbol = "";
          let stanceColor = "#fff";

          if (typeConfig.role === "predator") {
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
                stanceSymbol = "🪽";
                stanceColor = "#00aaff";
                break;
              case "seeking_mate":
                stanceSymbol = "👀";
                stanceColor = "#ff69b4";
                break;
              case "mating":
                stanceSymbol = "❣️";
                stanceColor = "#ff1493";
                break;
              case "fleeing":
                stanceSymbol = "❗";
                stanceColor = "#ffaa00";
                break;
            }
          }

          if (stanceSymbol && visualSettings.stanceSymbolsEnabled) {
            ctx.fillStyle = stanceColor;
            ctx.font = "bold 12px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            // Draw below the boid (offset by -12 for prey, -15 for predators)
            const yOffset = typeConfig.role === "predator" ? -15 : -12;
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
          typeConfig &&
          (typeConfig.role === "predator" || visualSettings.energyBarsEnabled);
        if (showEnergyBar) {
          const energyPercent = boid.energy / typeConfig.maxEnergy;
          const barWidth = 20;
          const barHeight = 3;
          const barX = boid.position.x - barWidth / 2;
          const barY = boid.position.y - 12;

          // Background
          ctx.fillStyle = "#333";
          ctx.fillRect(barX, barY, barWidth, barHeight);

          // Energy fill
          const energyColor =
            typeConfig.role === "predator" ? "#ff0000" : "#00ff88";
          ctx.fillStyle = energyColor;
          ctx.fillRect(barX, barY, barWidth * energyPercent, barHeight);

          // Border
          ctx.strokeStyle = "#666";
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
      }

      // Draw mating hearts (one per pair, centered between mates)
      if (visualSettings.matingHeartsEnabled) {
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

      // Draw FPS counter and stats
      const predatorCount = engine.boids.filter((b) => {
        const typeConfig = state.types[b.typeId];
        return typeConfig && typeConfig.role === "predator";
      }).length;
      const preyCount = engine.boids.length - predatorCount;

      ctx.fillStyle = "#00ff88";
      ctx.font = "16px monospace";
      ctx.fillText(`FPS: ${Math.round(fps)}`, 25, 20);
      ctx.fillText(`Total: ${engine.boids.length}`, 25, 40);
      ctx.fillStyle = "#00ff88";
      ctx.fillText(`Prey: ${preyCount}`, 25, 60);
      ctx.fillStyle = "#ff0000";
      ctx.fillText(`Predators: ${predatorCount}`, 25, 80);
      ctx.fillStyle = "#00ff88";
      ctx.fillText(`Obstacles: ${state.obstacles.length}`, 25, 100);
    };

    const animate = () => {
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
      while (accumulator >= FIXED_TIMESTEP) {
        engine.update(FIXED_TIMESTEP); // Always pass fixed 16.67ms timestep
        accumulator -= FIXED_TIMESTEP;
      }

      // Check for catches after all updates (once per render frame)
      const catches = engine.checkCatches();
      for (const catchEvent of catches) {
        runtimeController.dispatch({
          type: eventKeywords.boids.caught,
          predatorId: catchEvent.predatorId,
          preyId: catchEvent.preyId,
        });
      }

      // Render at display rate (always once per frame)
      draw();
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
