import { defineResource } from "braided";
import { CanvasResource } from "./canvas";
import { BoidEngine } from "./engine";
import type { StartedRuntimeStore } from "./runtimeStore";
import type { BoidConfig } from "../boids/types";
import type { RuntimeController } from "./runtimeController";
import { eventKeywords } from "../vocabulary/keywords";

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
    "config",
    "runtimeController",
  ],
  start: ({
    canvas,
    engine,
    runtimeStore,
    config,
    runtimeController,
  }: {
    canvas: CanvasResource;
    engine: BoidEngine;
    runtimeStore: StartedRuntimeStore;
    config: BoidConfig;
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

    const energyBarEnabled = false;
    const stanceSymbolEnabled = false;

    const draw = () => {
      const { ctx, width, height } = canvas;
      const state = runtimeStore.store.getState().state;

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
        const typeConfig = config.types[boid.typeId];

        ctx.save();
        ctx.translate(boid.position.x, boid.position.y);
        ctx.rotate(angle);

        // Draw triangle pointing in direction of velocity
        // Use type's color
        ctx.fillStyle = typeConfig?.color || "#00ff88";
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
                stanceSymbol = "H";
                stanceColor = "#ff0000";
                break;
              case "seeking_mate":
                stanceSymbol = "S";
                stanceColor = "#ff69b4";
                break;
              case "mating":
                stanceSymbol = "M";
                stanceColor = "#ff1493";
                break;
              case "idle":
                stanceSymbol = "I";
                stanceColor = "#666";
                break;
              case "eating":
                stanceSymbol = "E";
                stanceColor = "#ff8800";
                break;
            }
          } else {
            // Prey stance symbols
            switch (stance) {
              case "flocking":
                stanceSymbol = "F";
                stanceColor = "#00aaff";
                break;
              case "seeking_mate":
                stanceSymbol = "S";
                stanceColor = "#ff69b4";
                break;
              case "mating":
                stanceSymbol = "M";
                stanceColor = "#ff1493";
                break;
              case "fleeing":
                stanceSymbol = "!";
                stanceColor = "#ffaa00";
                break;
            }
          }

          if (stanceSymbol && stanceSymbolEnabled) {
            ctx.fillStyle = stanceColor;
            ctx.font = "bold 12px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            // Draw above the boid (offset by -12 for prey, -15 for predators)
            const yOffset = typeConfig.role === "predator" ? -15 : -12;
            ctx.fillText(
              stanceSymbol,
              boid.position.x,
              boid.position.y + yOffset
            );
          }
        }

        // Draw energy bar above boid
        if (typeConfig && energyBarEnabled) {
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

      // Draw FPS counter and stats
      const predatorCount = engine.boids.filter((b) => {
        const typeConfig = config.types[b.typeId];
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

    return { start, stop, isRunning } satisfies Renderer;
  },
  halt: (renderer: Renderer) => {
    renderer.stop();
  },
});
