import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { IconHome, IconRotate, IconZoomIn } from "@tabler/icons-react";
import { BoidCard } from "@/components/BoidComparison";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import type { RenderMode } from "@/hooks/useStaticBoid";
import { stableEcosystemProfile } from "@/profiles/stable-ecosystem";
import { createSystemHooks, createSystemManager } from "braided-react";
import { defineResource } from "braided";

const atlasesResource = defineResource({
  start: () => {
    console.log("Starting atlases resource");
  },
  halt: () => {
    console.log("Halting atlases resource");
  },
});

const boidsAtlasSystem = {
  atlases: atlasesResource,
};

const manager = createSystemManager(boidsAtlasSystem);
const { useResource } = createSystemHooks(manager);

export const Route = createFileRoute("/boids-atlas")({
  component: BoidsAtlasRoute,
});

function BoidsAtlasRoute() {
  const atlases = useResource("atlases");
  const [renderMode, setRenderMode] = useState<RenderMode>("both");
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(3);
  const [speciesData] = useState(() =>
    Object.entries(stableEcosystemProfile.species).map(
      ([speciesId, species]) => ({
        genome: species.baseGenome,
        typeId: speciesId,
        name: species.name,
        role: species.role,
        speciesConfig: species,
      }),
    ),
  );

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Boids Atlas</h1>
              <p className="text-lg text-muted-foreground mt-2">
                Visual testing and comparison of boid rendering
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

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Rendering Controls</CardTitle>
            <CardDescription>
              Adjust rendering mode, rotation, and scale
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Render Mode Toggle */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Render Mode</label>
              <div className="flex gap-2">
                <Button
                  variant={renderMode === "canvas2d" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRenderMode("canvas2d")}
                >
                  Canvas 2D
                </Button>
                <Button
                  variant={renderMode === "webgl" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRenderMode("webgl")}
                >
                  WebGL
                </Button>
                <Button
                  variant={renderMode === "both" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRenderMode("both")}
                >
                  Side-by-Side
                </Button>
              </div>
            </div>

            {/* Rotation Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  <IconRotate className="inline h-4 w-4 mr-1" />
                  Rotation
                </label>
                <span className="text-sm text-muted-foreground">
                  {Math.round((rotation * 180) / Math.PI)}°
                </span>
              </div>
              <Slider
                value={[rotation]}
                onValueChange={(value) => {
                  const val = Array.isArray(value) ? value[0] : value;
                  setRotation(val);
                }}
                min={0}
                max={Math.PI * 2}
                step={Math.PI / 16}
                className="w-full"
              />
            </div>

            {/* Scale Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  <IconZoomIn className="inline h-4 w-4 mr-1" />
                  Scale
                </label>
                <span className="text-sm text-muted-foreground">
                  {scale.toFixed(1)}x
                </span>
              </div>
              <Slider
                value={[scale]}
                onValueChange={(value) => {
                  const val = Array.isArray(value) ? value[0] : value;
                  setScale(val);
                }}
                min={0.5}
                max={4}
                step={0.1}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* Boids Grid */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">
            Boids from Stable Ecosystem Profile
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {speciesData.length > 0
              ? `Showing ${speciesData.length} species configurations`
              : "Loading species configurations..."}
          </p>

          {speciesData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {speciesData.map((species, index) => (
                <div key={index}>
                  <BoidCard
                    genome={species.genome}
                    typeId={species.typeId}
                    mode={renderMode}
                    rotation={rotation}
                    scale={scale}
                    size={200}
                    speciesConfig={species.speciesConfig}
                  />
                  <div className="mt-2 text-center">
                    <p className="text-sm font-medium">{species.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {species.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Section */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle>About Boids Atlas</CardTitle>
            <CardDescription>
              Visual testing environment for boid rendering
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>Purpose:</strong> The Boids Atlas provides a controlled
              environment for testing and comparing boid rendering without
              running the full simulation. This enables rapid iteration on
              visual design and debugging of rendering issues.
            </p>
            <p>
              <strong>Features:</strong> Adjust rotation and scale in real-time
              to see how boids look from different angles and sizes. Compare
              Canvas 2D and WebGL rendering side-by-side to ensure visual
              consistency.
            </p>
            <p>
              <strong>Coming Soon:</strong> WebGL rendering, side-by-side
              comparison, animation poses (hunting, fleeing, mating), and body
              parts visualization.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
