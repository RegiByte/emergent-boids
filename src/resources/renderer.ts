import { defineResource } from "braided";
import { CanvasResource } from "./canvas";
import { BoidEngine } from "./engine";
import type { StartedRuntimeStore } from "./runtimeStore";
import type { BoidConfig } from "../boids/types";

export type Renderer = {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
};

export const renderer = defineResource({
  dependencies: ["canvas", "engine", "runtimeStore", "config"],
  start: ({
    canvas,
    engine,
    runtimeStore,
    config,
  }: {
    canvas: CanvasResource;
    engine: BoidEngine;
    runtimeStore: StartedRuntimeStore;
    config: BoidConfig;
  }) => {
    let animationId: number | null = null;
    let isRunning = false;
    let lastFrameTime = performance.now();
    let fps = 60;

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
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, 4);
        ctx.lineTo(-4, -4);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      // Draw FPS counter and stats
      ctx.fillStyle = "#00ff88";
      ctx.font = "16px monospace";
      ctx.fillText(`FPS: ${Math.round(fps)}`, 10, 20);
      ctx.fillText(`Boids: ${engine.boids.length}`, 10, 40);
      ctx.fillText(`Obstacles: ${state.obstacles.length}`, 10, 60);
    };

    const animate = () => {
      // Calculate FPS
      const now = performance.now();
      const deltaTime = now - lastFrameTime;
      lastFrameTime = now;
      // Smooth FPS calculation (exponential moving average)
      fps = fps * 0.9 + (1000 / deltaTime) * 0.1;

      engine.update();
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
