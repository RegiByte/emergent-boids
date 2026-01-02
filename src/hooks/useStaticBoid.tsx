/**
 * useStaticBoid Hook
 *
 * React hook for rendering static boids with Canvas 2D or WebGL.
 * Handles canvas lifecycle, context management, and rendering.
 *
 * Supports three modes:
 * - "canvas2d": Render using Canvas 2D only
 * - "webgl": Render using WebGL only
 * - "both": Render both side-by-side for comparison
 */

import { useEffect, useRef } from "react";
import type { Genome } from "@/boids/vocabulary/schemas/genetics";
import type { SpeciesConfig } from "@/boids/vocabulary/schemas/species";
import type { AtlasesResult } from "@/resources/atlases";
import {
  createStaticBoid,
  renderBoidCanvas2D,
  applyCameraTransform,
  type StaticCamera,
} from "@/lib/staticBoidRenderer";
import {
  createMinimalWebGLContext,
  renderBoidWebGL,
  destroyWebGLContext,
  type StaticWebGLContext,
} from "@/lib/staticBoidWebGL";

export type RenderMode = "canvas2d" | "webgl" | "both";

export interface UseStaticBoidOptions {
  mode?: RenderMode;
  typeId?: string; // Species/type identifier
  rotation?: number;
  scale?: number;
  width?: number;
  height?: number;
  camera?: StaticCamera;
  backgroundColor?: string;
  speciesConfig?: SpeciesConfig; // Species configuration for shape rendering
  atlases?: AtlasesResult; // Session 105: Pre-generated atlases from resource
}

export interface UseStaticBoidResult {
  canvas2dRef: React.RefObject<HTMLCanvasElement | null>;
  webglRef: React.RefObject<HTMLCanvasElement | null>;
  mode: RenderMode;
}

/**
 * Hook for rendering a static boid with Canvas 2D and/or WebGL
 *
 * @param genome - The boid's genome
 * @param options - Rendering options
 * @returns Canvas refs and render mode
 *
 * @example
 * ```tsx
 * function BoidCard({ genome }: { genome: Genome }) {
 *   const { canvas2dRef, mode } = useStaticBoid(genome, {
 *     mode: "canvas2d",
 *     rotation: 0,
 *     scale: 2,
 *     width: 200,
 *     height: 200,
 *   });
 *
 *   return <canvas ref={canvas2dRef} width={200} height={200} />;
 * }
 * ```
 */
export function useStaticBoid(
  genome: Pick<Genome, "traits" | "visual"> | Genome | null,
  options?: UseStaticBoidOptions,
): UseStaticBoidResult {
  const {
    mode = "canvas2d",
    typeId = "unknown",
    rotation = 0,
    scale = 1,
    width = 200,
    height = 200,
    camera = { position: { x: 0, y: 0 }, zoom: 1 },
    backgroundColor = "transparent",
    speciesConfig,
    atlases,
  } = options ?? {};

  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const webglRef = useRef<HTMLCanvasElement>(null);
  const webglContextRef = useRef<StaticWebGLContext | null>(null);

  // Initialize WebGL context (once per mode change or atlases change)
  // Session 105: Now requires atlases to be provided
  useEffect(() => {
    if (mode === "canvas2d") return; // Skip if Canvas 2D-only mode
    if (!webglRef.current) return;
    if (!atlases) {
      console.warn("Atlases not provided - cannot initialize WebGL context");
      return;
    }

    // Create WebGL context with pre-generated atlases
    const context = createMinimalWebGLContext(webglRef.current, atlases);
    if (!context) {
      console.warn("Failed to initialize WebGL context for static boid");
      return;
    }

    webglContextRef.current = context;

    // Cleanup on unmount or mode change
    return () => {
      if (webglContextRef.current) {
        destroyWebGLContext(webglContextRef.current);
        webglContextRef.current = null;
      }
    };
  }, [mode, atlases]); // Reinitialize when mode or atlases change

  // Render Canvas 2D
  useEffect(() => {
    if (mode === "webgl") return; // Skip if WebGL-only mode
    if (!canvas2dRef.current || !genome) return;

    const canvas = canvas2dRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    if (backgroundColor === "transparent") {
      ctx.clearRect(0, 0, width, height);
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    // Create static boid
    // Profile baseGenomes don't have genealogy fields, so we add defaults
    const completeGenome = {
      traits: genome.traits,
      visual: genome.visual,
      parentIds: null,
      generation: 0,
      mutations: undefined,
    } as Genome;
    const boid = createStaticBoid(
      completeGenome,
      typeId,
      { x: 0, y: 0 },
      rotation,
    );

    // Apply camera transform
    ctx.save();
    applyCameraTransform(ctx, camera, width, height);

    // Render boid
    renderBoidCanvas2D(ctx, boid, scale, speciesConfig, atlases);

    ctx.restore();
  }, [
    genome,
    typeId,
    mode,
    rotation,
    scale,
    width,
    height,
    camera,
    backgroundColor,
    speciesConfig,
  ]);

  // Render WebGL
  useEffect(() => {
    if (mode === "canvas2d") return; // Skip if Canvas 2D-only mode
    if (!webglContextRef.current || !genome) return;

    // Create static boid
    // Profile baseGenomes don't have genealogy fields, so we add defaults
    const completeGenome = {
      traits: genome.traits,
      visual: genome.visual,
      parentIds: null,
      generation: 0,
      mutations: undefined,
    } as Genome;
    const boid = createStaticBoid(
      completeGenome,
      typeId,
      { x: 0, y: 0 },
      rotation,
    );

    // Render boid using WebGL
    renderBoidWebGL(webglContextRef.current, boid, speciesConfig, {
      scale,
      width,
      height,
    });
  }, [genome, typeId, mode, rotation, scale, width, height, speciesConfig]);

  return {
    canvas2dRef,
    webglRef,
    mode,
  };
}

/**
 * Simpler hook for Canvas 2D only rendering
 *
 * @example
 * ```tsx
 * function SimpleBoid({ genome }: { genome: Genome }) {
 *   const canvasRef = useStaticBoidCanvas2D(genome, { scale: 2 });
 *   return <canvas ref={canvasRef} width={200} height={200} />;
 * }
 * ```
 */
export function useStaticBoidCanvas2D(
  genome: Genome | null,
  options?: Omit<UseStaticBoidOptions, "mode">,
) {
  const { canvas2dRef } = useStaticBoid(genome, {
    ...options,
    mode: "canvas2d",
  });
  return canvas2dRef;
}
