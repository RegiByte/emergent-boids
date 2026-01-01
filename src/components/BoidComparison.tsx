/**
 * BoidComparison Component
 *
 * Displays a boid rendered with both Canvas 2D and WebGL side-by-side
 * for visual comparison and debugging.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Genome } from "@/boids/vocabulary/schemas/genetics";
import type { SpeciesConfig } from "@/boids/vocabulary/schemas/species";
import { useStaticBoid, type RenderMode } from "@/hooks/useStaticBoid";
import { cn } from "@/lib/utils";

export interface BoidComparisonProps {
  genome: Pick<Genome, "traits" | "visual"> | Genome;
  typeId?: string;
  mode?: RenderMode;
  rotation?: number;
  scale?: number;
  size?: number;
  showLabels?: boolean;
  className?: string;
  speciesConfig?: SpeciesConfig;
}

/**
 * Renders a boid with both Canvas 2D and WebGL for comparison
 */
export function BoidComparison({
  genome,
  typeId = "unknown",
  mode = "both",
  rotation = 0,
  scale = 2,
  size = 200,
  showLabels = true,
  className,
  speciesConfig,
}: BoidComparisonProps) {
  const { canvas2dRef, webglRef } = useStaticBoid(genome, {
    mode,
    typeId,
    rotation,
    scale,
    width: size,
    height: size,
    backgroundColor: "#1a1a1a",
    speciesConfig,
  });

  // Single renderer mode
  if (mode !== "both") {
    const canvasRef = mode === "canvas2d" ? canvas2dRef : webglRef;
    const title = mode === "canvas2d" ? "Canvas 2D" : "WebGL";

    return (
      <Card className={className}>
        {showLabels && (
          <CardHeader>
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className="flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="rounded-lg border-2 border-border"
            style={{
              imageRendering: "pixelated",
              backgroundColor: "#1a1a1a",
            }}
          />
        </CardContent>
      </Card>
    );
  }

  // Side-by-side comparison mode
  return (
    <div className={cn("flex gap-4", className)}>
      <Card className="flex-1">
        {showLabels && (
          <CardHeader>
            <CardTitle className="text-sm">Canvas 2D</CardTitle>
          </CardHeader>
        )}
        <CardContent className="flex items-center justify-center">
          <canvas
            ref={canvas2dRef}
            width={size}
            height={size}
            className="rounded-lg border-2 border-border"
            style={{
              imageRendering: "pixelated",
              backgroundColor: "#1a1a1a",
            }}
          />
        </CardContent>
      </Card>

      <Card className="flex-1">
        {showLabels && (
          <CardHeader>
            <CardTitle className="text-sm">WebGL</CardTitle>
          </CardHeader>
        )}
        <CardContent className="flex items-center justify-center">
          <canvas
            ref={webglRef}
            width={size}
            height={size}
            className="rounded-lg border-2 border-border"
            style={{
              imageRendering: "pixelated",
              backgroundColor: "#1a1a1a",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Simple boid card with metadata
 */
export interface BoidCardProps {
  genome: Pick<Genome, "traits" | "visual"> | Genome;
  typeId?: string;
  mode?: RenderMode;
  rotation?: number;
  scale?: number;
  size?: number;
  className?: string;
  speciesConfig?: SpeciesConfig;
}

export function BoidCard({
  genome,
  typeId = "unknown",
  mode = "canvas2d",
  rotation = 0,
  scale = 2,
  size = 200,
  className,
  speciesConfig,
}: BoidCardProps) {
  const { canvas2dRef, webglRef } = useStaticBoid(genome, {
    mode,
    typeId,
    rotation,
    scale,
    width: size,
    height: size,
    backgroundColor: "#1a1a1a",
    speciesConfig,
  });

  // Side-by-side comparison mode
  if (mode === "both") {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm">Side-by-Side Comparison</CardTitle>
          <p className="text-xs text-muted-foreground">
            Size: {genome.traits.size.toFixed(1)} | Speed:{" "}
            {genome.traits.speed.toFixed(1)}
          </p>
        </CardHeader>
        <CardContent className="flex gap-4">
          {/* Canvas 2D */}
          <div className="flex-1 space-y-2">
            <div className="text-xs font-medium text-muted-foreground text-center">
              Canvas 2D
            </div>
            <canvas
              ref={canvas2dRef}
              width={size}
              height={size}
              className="rounded-lg border-2 border-border w-full"
              style={{
                imageRendering: "pixelated",
                backgroundColor: "#1a1a1a",
              }}
            />
          </div>
          {/* WebGL */}
          <div className="flex-1 space-y-2">
            <div className="text-xs font-medium text-muted-foreground text-center">
              WebGL
            </div>
            <canvas
              ref={webglRef}
              width={size}
              height={size}
              className="rounded-lg border-2 border-border w-full"
              style={{
                imageRendering: "pixelated",
                backgroundColor: "#1a1a1a",
              }}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Single renderer mode
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">Boid</CardTitle>
        <p className="text-xs text-muted-foreground">
          Size: {genome.traits.size.toFixed(1)} | Speed:{" "}
          {genome.traits.speed.toFixed(1)}
        </p>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        {/* Render both canvases, show only the one matching current mode */}
        <canvas
          ref={canvas2dRef}
          width={size}
          height={size}
          className="rounded-lg border-2 border-border"
          style={{
            imageRendering: "pixelated",
            backgroundColor: "#1a1a1a",
            display: mode === "canvas2d" ? "block" : "none",
          }}
        />
        <canvas
          ref={webglRef}
          width={size}
          height={size}
          className="rounded-lg border-2 border-border"
          style={{
            imageRendering: "pixelated",
            backgroundColor: "#1a1a1a",
            display: mode === "webgl" ? "block" : "none",
          }}
        />
      </CardContent>
    </Card>
  );
}
