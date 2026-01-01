import { useEffect, useRef, useState } from "react";
import { useResource } from "../system";
import type { Boid } from "../boids/vocabulary/schemas/entities";

export function Minimap({ backgroundColor }: { backgroundColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useResource("engine");
  const camera = useResource("camera");
  const runtimeStore = useResource("runtimeStore");

  // Get world dimensions from config
  const worldWidth = runtimeStore.useStore((state) => state.config.world.width);
  const worldHeight = runtimeStore.useStore(
    (state) => state.config.world.height,
  );
  const speciesConfigs = runtimeStore.useStore((state) => state.config.species);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const MINIMAP_SIZE = 200;
    const scaleX = MINIMAP_SIZE / worldWidth;
    const scaleY = MINIMAP_SIZE / worldHeight;

    // Animation loop for minimap
    let animationId: number;

    const render = () => {
      // Clear with dark background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

      // Draw grid lines for reference
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      const gridSize = 1000; // 1K grid
      for (let i = 0; i <= worldWidth; i += gridSize) {
        const x = i * scaleX;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, MINIMAP_SIZE);
        ctx.stroke();
      }
      for (let i = 0; i <= worldHeight; i += gridSize) {
        const y = i * scaleY;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(MINIMAP_SIZE, y);
        ctx.stroke();
      }

      // Draw all boids as tiny dots (grouped by species for batching)
      const boidsBySpecies = new Map<string, Boid[]>();
      for (const boid of engine.boids) {
        const existing = boidsBySpecies.get(boid.typeId);
        if (existing) {
          existing.push(boid);
        } else {
          boidsBySpecies.set(boid.typeId, [boid]);
        }
      }

      // Render each species batch
      for (const [typeId, boids] of boidsBySpecies) {
        const speciesConfig = speciesConfigs[typeId];
        if (!speciesConfig) continue;

        ctx.fillStyle = speciesConfig.baseGenome.visual.color;

        // Draw all boids of this species
        for (const boid of boids) {
          const x = boid.position.x * scaleX;
          const y = boid.position.y * scaleY;

          // Slightly larger dots for predators
          const size = speciesConfig.role === "predator" ? 2.5 : 1.5;

          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw viewport rectangle
      const viewportBounds = camera.getViewportBounds();
      const viewportX = viewportBounds.left * scaleX;
      const viewportY = viewportBounds.top * scaleY;
      const viewportWidth =
        (viewportBounds.right - viewportBounds.left) * scaleX;
      const viewportHeight =
        (viewportBounds.bottom - viewportBounds.top) * scaleY;

      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 2;
      ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);

      // Draw camera center crosshair
      const cameraCenterX = camera.x * scaleX;
      const cameraCenterY = camera.y * scaleY;
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cameraCenterX - 4, cameraCenterY);
      ctx.lineTo(cameraCenterX + 4, cameraCenterY);
      ctx.moveTo(cameraCenterX, cameraCenterY - 4);
      ctx.lineTo(cameraCenterX, cameraCenterY + 4);
      ctx.stroke();

      // Border around minimap
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [
    engine,
    camera,
    worldWidth,
    worldHeight,
    speciesConfigs,
    backgroundColor,
  ]);

  // Drag state for minimap navigation
  const [isDragging, setIsDragging] = useState(false);

  // Helper function to convert minimap coordinates to world coordinates
  const minimapToWorld = (
    minimapX: number,
    minimapY: number,
  ): { x: number; y: number } => {
    const MINIMAP_SIZE = 200;
    const scaleX = MINIMAP_SIZE / worldWidth;
    const scaleY = MINIMAP_SIZE / worldHeight;

    return {
      x: minimapX / scaleX,
      y: minimapY / scaleY,
    };
  };

  // Mouse down: start dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);

    // Immediately pan to clicked location
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const worldPos = minimapToWorld(clickX, clickY);
    camera.panTo(worldPos.x, worldPos.y, true); // Manual navigation
  };

  // Mouse move: pan camera in real-time while dragging
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldPos = minimapToWorld(mouseX, mouseY);
    camera.panTo(worldPos.x, worldPos.y, true); // Manual navigation
  };

  // Mouse up: stop dragging
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mouse leave: stop dragging if mouse leaves minimap
  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 hidden md:block">
      <div className="bg-black/1 backdrop-blur-xs border border-primary/30 rounded-lg p-2 shadow-2xl">
        <div className="text-xs text-primary/70 mb-1 font-mono text-center">
          MINIMAP
        </div>
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          className={
            isDragging ? "cursor-grabbing rounded" : "cursor-grab rounded"
          }
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          title="Click and drag to navigate"
        />
        <div className="text-xs text-primary/50 mt-1 font-mono text-center">
          {worldWidth}x{worldHeight}
        </div>
      </div>
    </div>
  );
}
