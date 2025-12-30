import { defineResource } from "braided";
import REGL from "regl";
import type { Boid } from "../boids/vocabulary/schemas/prelude";
import type { BoidEngine } from "./engine";
import type { CameraAPI } from "./camera";
import type { CanvasAPI } from "./canvas";
import { toRgb } from "../lib/colors";

// Import shaders as strings
import boidVertShader from "../shaders/boid.vert?raw";
import boidFragShader from "../shaders/boid.frag?raw";

export type WebGLRenderer = {
  render: () => void;
  resize: (width: number, height: number) => void;
};

export const webglRenderer = defineResource({
  dependencies: {
    required: ["canvas", "engine", "camera"],
    optional: [],
  },
  start: ({
    canvas,
    engine,
    camera,
  }: {
    canvas: CanvasAPI;
    engine: BoidEngine;
    camera: CameraAPI;
  }) => {
    // Create a separate canvas element for WebGL
    // (Can't use the same canvas as 2D context - they're mutually exclusive)
    const webglCanvas = document.createElement("canvas");
    webglCanvas.width = canvas.width;
    webglCanvas.height = canvas.height;
    webglCanvas.classList.add(
      "absolute",
      "top-[50%]",
      "left-[50%]",
      "translate-x-[-50%]",
      "translate-y-[-50%]"
    );
    webglCanvas.style.display = "none"; // Hidden by default (Canvas renderer is default)

    // Initialize regl
    const regl = REGL({
      canvas: webglCanvas,
      extensions: ["ANGLE_instanced_arrays"],
    });

    // Triangle vertices (shared by all boids)
    // Pointing right (0 degrees = east)
    // Base size needs to be visible in world coordinates (world is 2500x2500)
    // At default zoom (1.0), we want boids to be ~10 pixels, so 10 world units
    const trianglePositions = [
      [5, 0], // Tip (right) - 10 units wide total
      [-3, -3], // Bottom left
      [-3, 3], // Top left
    ];

    // Create draw command
    // Note: regl types are complex, using type assertion for prop() calls
    const drawBoids = regl({
      vert: boidVertShader,
      frag: boidFragShader,

      attributes: {
        // Shared triangle shape
        position: trianglePositions,

        // Per-instance data
        offset: {
          buffer: (regl.prop as (name: string) => unknown)("positions"),
          divisor: 1,
        },
        rotation: {
          buffer: (regl.prop as (name: string) => unknown)("rotations"),
          divisor: 1,
        },
        color: {
          buffer: (regl.prop as (name: string) => unknown)("colors"),
          divisor: 1,
        },
        scale: {
          buffer: (regl.prop as (name: string) => unknown)("scales"),
          divisor: 1,
        },
      },

      uniforms: {
        transform: (regl.prop as unknown as (name: string) => number[])(
          "transform"
        ),
      },

      count: 3, // 3 vertices per triangle
      instances: (regl.prop as unknown as (name: string) => number)("count"),
    });

    // Prepare boid data for GPU
    const prepareBoidData = (boids: Boid[]) => {
      const count = boids.length;
      const positions = new Float32Array(count * 2);
      const rotations = new Float32Array(count);
      const colors = new Float32Array(count * 3);
      const scales = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const boid = boids[i];

        // Position
        positions[i * 2] = boid.position.x;
        positions[i * 2 + 1] = boid.position.y;

        // Rotation (from velocity) - atan2 gives angle in radians
        // Note: Negate Y because our projection flips Y axis (Canvas Y-down vs WebGL Y-up)
        // This ensures boids point in the direction they're moving
        rotations[i] = Math.atan2(-boid.velocity.y, boid.velocity.x);

        // Color (normalized to 0-1) - convert hex to RGB
        const [r, g, b] = toRgb(boid.phenotype.color);
        colors[i * 3] = r / 255;
        colors[i * 3 + 1] = g / 255;
        colors[i * 3 + 2] = b / 255;

        // Scale (from phenotype renderSize)
        // renderSize is typically 0.8-1.2 (size multiplier from genome)
        scales[i] = boid.phenotype.renderSize;
      }

      return { positions, rotations, colors, scales, count };
    };

    const render = () => {
      // CRITICAL: Tell regl to update its internal state (canvas size, viewport, etc.)
      // This ensures WebGL viewport matches canvas dimensions
      regl.poll();
      
      // Clear screen (match Canvas background)
      regl.clear({
        color: [0.0, 0.2, 0.3, 1.0], // rgba(0, 51, 77) normalized
        depth: 1,
      });

      // Get visible boids (same culling as Canvas renderer)
      const visibleBoids = engine.boids.filter((boid) =>
        camera.isInViewport(boid.position.x, boid.position.y, 100)
      );

      // Skip if no boids
      if (visibleBoids.length === 0) {
        return;
      }

      // Prepare data
      const boidData = prepareBoidData(visibleBoids);

      // Draw!
      drawBoids({
        ...boidData,
        transform: camera.getTransformMatrix(),
      });
    };

    const resize = (width: number, height: number) => {
      // Update WebGL canvas size to match main canvas
      webglCanvas.width = width;
      webglCanvas.height = height;
      
      // Update regl's internal state after resize
      regl.poll();
    };

    return {
      render,
      resize,
      canvas: webglCanvas, // Expose canvas for mounting
    } satisfies WebGLRenderer & { canvas: HTMLCanvasElement };
  },
  halt: (resource: WebGLRenderer & { canvas?: HTMLCanvasElement }) => {
    // Remove WebGL canvas from DOM
    if (resource.canvas?.parentNode) {
      resource.canvas.remove();
    }
  },
});

