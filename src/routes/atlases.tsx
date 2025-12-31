import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconHome, IconZoomIn, IconZoomOut, IconGridDots } from "@tabler/icons-react";
import { createEmojiAtlas } from "@/resources/webgl/atlases/emojiAtlas";
import { createFontAtlas } from "@/resources/webgl/atlases/fontAtlas";
import { createShapeAtlas } from "@/resources/webgl/atlases/shapeAtlas";
import { createBodyPartsAtlas } from "@/resources/webgl/atlases/bodyPartsAtlas";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/atlases")({
  component: AtlasesRoute,
});

type AtlasConfig = {
  name: string;
  description: string;
  generate: () => any;
  info?: string;
};

function AtlasesRoute() {
  const atlases: AtlasConfig[] = [
    {
      name: "Emoji Atlas",
      description: "Stance symbol emojis for boid behavior indicators",
      generate: createEmojiAtlas,
      info: "64px cells - Hunting 😈, Fleeing 😱, Mating 💑, etc.",
    },
    {
      name: "Font Atlas",
      description: "Bitmap font texture for text rendering",
      generate: () =>
        createFontAtlas("Arial", 16, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 "),
      info: "16px font with metrics for proper character spacing",
    },
    {
      name: "Shape Atlas",
      description: "Geometric body shapes for boid rendering",
      generate: createShapeAtlas,
      info: "128px cells - Diamond, Circle, Hexagon, Triangle, etc.",
    },
    {
      name: "Body Parts Atlas",
      description: "Composable body parts layered on base shapes",
      generate: createBodyPartsAtlas,
      info: "128px cells - Eyes, Fins, Spikes, Tails, Antennae",
    },
  ];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Texture Atlas Inspector</h1>
              <p className="text-lg text-muted-foreground mt-2">
                WebGL texture atlases used for high-performance rendering
              </p>
            </div>
            <Link to="/">
              <Button variant="outline" size="sm">
                <IconHome className="h-4 w-4 mr-2" />
                Back to Simulation
              </Button>
            </Link>
          </div>
        </header>

        {/* Atlas Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {atlases.map((atlas) => (
            <AtlasCard key={atlas.name} config={atlas} />
          ))}
        </div>

        {/* Info Section */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle>About Texture Atlases</CardTitle>
            <CardDescription>
              Why we use texture atlases for WebGL rendering
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>Texture atlases</strong> combine multiple images into a single texture,
              enabling extremely efficient WebGL rendering. Instead of switching textures
              between draw calls (expensive!), we pack everything into one texture and
              use UV coordinates to sample different regions.
            </p>
            <p>
              <strong>Benefits:</strong> One draw call for hundreds of boids regardless of
              their shape or stance. Smooth anti-aliasing from Canvas 2D rendering.
              Easy to add new shapes without impacting performance.
            </p>
            <p>
              <strong>Session 85 Victory:</strong> These atlases are part of the modular
              WebGL architecture that reduced the renderer from 1,997 lines to 490 lines
              (75% reduction!)
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AtlasCard({ config }: { config: AtlasConfig }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Generate atlas (memoized)
  const atlasResult = useMemo(() => {
    try {
      return config.generate();
    } catch (error) {
      console.error(`Failed to generate ${config.name}:`, error);
      return null;
    }
  }, [config]);

  // Append canvas to DOM
  useEffect(() => {
    if (!atlasResult || !canvasRef.current) return;

    const canvas = atlasResult.canvas;
    
    // Style the canvas for proper display
    canvas.style.display = "block";
    canvas.style.imageRendering = "pixelated"; // Sharp pixel rendering
    canvas.style.borderRadius = "8px";
    canvas.style.backgroundColor = "#1a1a1a"; // Dark background for contrast
    
    canvasRef.current.appendChild(canvas);
    setIsLoading(false);

    return () => {
      if (canvasRef.current?.contains(canvas)) {
        canvasRef.current.removeChild(canvas);
      }
    };
  }, [atlasResult]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.5, 0.5));

  if (!atlasResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">{config.name}</CardTitle>
          <CardDescription>Failed to generate atlas</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const gridSize = atlasResult.gridSize;
  const atlasSize = atlasResult.canvas.width;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.name}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
            >
              <IconZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-12 text-center">
              {(zoom * 100).toFixed(0)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 4}
            >
              <IconZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant={showGrid ? "default" : "outline"}
            size="sm"
            onClick={() => setShowGrid(!showGrid)}
          >
            <IconGridDots className="h-4 w-4 mr-2" />
            Grid
          </Button>
        </div>

        {/* Canvas Container */}
        <div className="relative overflow-auto border-2 border-border rounded-lg bg-[#1a1a1a]">
          <div
            className="relative inline-block"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            <div ref={canvasRef} className="relative" />

            {/* Grid Overlay */}
            {showGrid && !isLoading && (
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                width={atlasSize}
                height={atlasSize}
                viewBox={`0 0 ${atlasSize} ${atlasSize}`}
                style={{
                  borderRadius: "8px",
                }}
              >
                {/* Vertical lines */}
                {Array.from({ length: gridSize + 1 }).map((_, i) => (
                  <line
                    key={`v-${i}`}
                    x1={(i * atlasSize) / gridSize}
                    y1={0}
                    x2={(i * atlasSize) / gridSize}
                    y2={atlasSize}
                    stroke="rgba(255, 255, 255, 0.3)"
                    strokeWidth="1"
                  />
                ))}
                {/* Horizontal lines */}
                {Array.from({ length: gridSize + 1 }).map((_, i) => (
                  <line
                    key={`h-${i}`}
                    x1={0}
                    y1={(i * atlasSize) / gridSize}
                    x2={atlasSize}
                    y2={(i * atlasSize) / gridSize}
                    stroke="rgba(255, 255, 255, 0.3)"
                    strokeWidth="1"
                  />
                ))}
              </svg>
            )}
          </div>
        </div>

        {/* Atlas Info */}
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Atlas Size:</span>
            <span className="font-mono">
              {atlasSize} × {atlasSize} px
            </span>
          </div>
          <div className="flex justify-between">
            <span>Grid Size:</span>
            <span className="font-mono">
              {gridSize} × {gridSize} cells
            </span>
          </div>
          <div className="flex justify-between">
            <span>Cell Size:</span>
            <span className="font-mono">
              {atlasSize / gridSize} px
            </span>
          </div>
          {config.info && (
            <div className="pt-2 border-t">
              <p className="text-xs">{config.info}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

