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

    const energyBarEnabled = true;

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
      ctx.fillText(`FPS: ${Math.round(fps)}`, 10, 20);
      ctx.fillText(`Total: ${engine.boids.length}`, 10, 40);
      ctx.fillStyle = "#00ff88";
      ctx.fillText(`Prey: ${preyCount}`, 10, 60);
      ctx.fillStyle = "#ff0000";
      ctx.fillText(`Predators: ${predatorCount}`, 10, 80);
      ctx.fillStyle = "#00ff88";
      ctx.fillText(`Obstacles: ${state.obstacles.length}`, 10, 100);
    };

    const animate = () => {
      // Calculate FPS
      const now = performance.now();
      const deltaTime = now - lastFrameTime;
      lastFrameTime = now;
      // Smooth FPS calculation (exponential moving average)
      fps = fps * 0.9 + (1000 / deltaTime) * 0.1;

      engine.update();

      // Check for catches and dispatch events
      const catches = engine.checkCatches();
      for (const catchEvent of catches) {
        runtimeController.dispatch({
          type: eventKeywords.boids.caught,
          predatorId: catchEvent.predatorId,
          preyId: catchEvent.preyId,
        });
      }

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
