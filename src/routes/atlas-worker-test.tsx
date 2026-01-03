/**
 * Atlas Worker Comparison Route
 *
 * Compares atlas generation performance: Main Thread vs Web Worker
 * Tests the worker tasks abstraction with real-world atlas generation.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconHome, IconPlayerPlay, IconRefresh } from "@tabler/icons-react";
import { atlasGenerationClientResource } from "@/workers/atlasGenerationTasks";
import {
  createFontAtlas,
  DEFAULT_FONT_CHARS,
} from "@/resources/browser/webgl/atlases/fontAtlas";
import { createBodyPartsAtlas } from "@/resources/browser/webgl/atlases/bodyPartsAtlas";
import { createSystemHooks, createSystemManager } from "braided-react";

// Create a minimal system with just the atlas generation worker resource
const atlasWorkerSystem = {
  atlasGenerationTasks: atlasGenerationClientResource,
};

const manager = createSystemManager(atlasWorkerSystem);
const { useResource } = createSystemHooks(manager);

export const Route = createFileRoute("/atlas-worker-test")({
  component: AtlasWorkerTestRoute,
});

type TestResult = {
  generationTime: number;
  transferTime?: number;
  totalTime: number;
  canvas: HTMLCanvasElement;
  success: boolean;
  error?: string;
};

function AtlasWorkerTestRoute() {
  // Get the atlas generation tasks resource
  const atlasGenerationTasks = useResource("atlasGenerationTasks");

  const [mainThreadResult, setMainThreadResult] = useState<TestResult | null>(
    null
  );
  const [workerResult, setWorkerResult] = useState<TestResult | null>(null);
  const [workerOffscreenResult, setWorkerOffscreenResult] =
    useState<TestResult | null>(null);
  const [bodyPartsMainResult, setBodyPartsMainResult] =
    useState<TestResult | null>(null);
  const [bodyPartsWorkerResult, setBodyPartsWorkerResult] =
    useState<TestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [testType, setTestType] = useState<"font" | "bodyParts">("font");

  // Use the hook for declarative state management
  const fontAtlasTask =
    atlasGenerationTasks.useTaskDispatcher("generateFontAtlas");
  const fontAtlasOffscreenTask = atlasGenerationTasks.useTaskDispatcher(
    "generateFontAtlasOffscreen"
  );
  const bodyPartsAtlasTask = atlasGenerationTasks.useTaskDispatcher(
    "generateBodyPartsAtlas"
  );

  const runMainThreadTest = async () => {
    const startTime = performance.now();

    try {
      // Generate font atlas on main thread
      const result = createFontAtlas("monospace", 16, DEFAULT_FONT_CHARS);

      if (!result) {
        throw new Error("Failed to generate atlas");
      }

      const endTime = performance.now();
      const generationTime = endTime - startTime;

      setMainThreadResult({
        generationTime,
        totalTime: generationTime,
        canvas: result.canvas,
        success: true,
      });
    } catch (error) {
      const endTime = performance.now();
      setMainThreadResult({
        generationTime: endTime - startTime,
        totalTime: endTime - startTime,
        canvas: document.createElement("canvas"),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const runWorkerTest = async () => {
    const startTime = performance.now();

    try {
      // Dispatch task using the hook
      const subscription = fontAtlasTask.dispatch({
        fontFamily: "monospace",
        fontSize: 16,
        chars: DEFAULT_FONT_CHARS,
      });

      // Wait for completion by polling fontAtlasTask.output
      await new Promise<void>((resolve, reject) => {
        subscription.onComplete(() => {
          resolve();
        });
        subscription.onError((error) => {
          reject(new Error(error));
        });
      });

      const transferStartTime = performance.now();
      const output = fontAtlasTask.stateRef.current.output;

      if (!output) {
        throw new Error("No output from worker");
      }

      // Reconstruct canvas from ImageData
      const { imageData, uvEntries, gridSize } = output;

      const canvas = document.createElement("canvas");
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to create canvas context");
      }

      // Put image data back into canvas
      const reconstructedImageData = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );
      ctx.putImageData(reconstructedImageData, 0, 0);

      const endTime = performance.now();
      const transferTime = endTime - transferStartTime;
      const totalTime = endTime - startTime;
      const generationTime = totalTime - transferTime;

      setWorkerResult({
        generationTime,
        transferTime,
        totalTime,
        canvas,
        success: true,
      });

      console.log("✅ Worker atlas generation complete:", {
        generationTime: `${generationTime.toFixed(2)}ms`,
        transferTime: `${transferTime.toFixed(2)}ms`,
        totalTime: `${totalTime.toFixed(2)}ms`,
        uvEntries: uvEntries.length,
        gridSize,
      });
    } catch (error) {
      const endTime = performance.now();
      setWorkerResult({
        generationTime: 0,
        totalTime: endTime - startTime,
        canvas: document.createElement("canvas"),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const runWorkerOffscreenTest = async () => {
    const setupStartTime = performance.now();

    try {
      // Calculate atlas dimensions (same as main thread)
      const fontSize = 16;
      const fontFamily = "monospace";
      const chars = DEFAULT_FONT_CHARS;
      const charSize = fontSize * 1.5;
      const uniqueChars = Array.from(new Set(chars));
      const gridSize = Math.ceil(Math.sqrt(uniqueChars.length));
      const atlasSize = gridSize * charSize;

      // Create canvas and transfer control to OffscreenCanvas
      const canvas = document.createElement("canvas");
      canvas.width = atlasSize;
      canvas.height = atlasSize;

      const offscreenCanvas = canvas.transferControlToOffscreen();

      const setupTime = performance.now() - setupStartTime;
      const workerStartTime = performance.now();

      // Dispatch task with OffscreenCanvas (transferable!)
      const subscription = fontAtlasOffscreenTask.dispatch(
        {
          offscreenCanvas,
          fontFamily,
          fontSize,
          chars,
          gridSize,
          atlasSize,
          charSize,
        },
        [offscreenCanvas]
      ); // ← Transfer the offscreen canvas!

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        subscription.onComplete(() => {
          resolve();
        });
        subscription.onError((error) => {
          reject(new Error(error));
        });
      });

      const reconstructStartTime = performance.now();
      const output = fontAtlasOffscreenTask.stateRef.current.output;

      if (!output) {
        throw new Error("No output from worker");
      }

      // Create a new canvas to hold the ImageBitmap result
      const resultCanvas = document.createElement("canvas");
      resultCanvas.width = atlasSize;
      resultCanvas.height = atlasSize;
      const ctx = resultCanvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to create canvas context");
      }

      // Draw ImageBitmap to canvas (zero-copy on GPU!)
      ctx.drawImage(output.imageBitmap, 0, 0);

      const endTime = performance.now();
      const reconstructTime = endTime - reconstructStartTime;
      const workerTime = reconstructStartTime - workerStartTime;
      const totalTime = endTime - setupStartTime;

      setWorkerOffscreenResult({
        generationTime: workerTime,
        transferTime: setupTime + reconstructTime,
        totalTime,
        canvas: resultCanvas,
        success: true,
      });

      console.log("✅ Worker (OffscreenCanvas) atlas generation complete:", {
        setupTime: `${setupTime.toFixed(2)}ms`,
        workerTime: `${workerTime.toFixed(2)}ms`,
        reconstructTime: `${reconstructTime.toFixed(2)}ms`,
        totalTime: `${totalTime.toFixed(2)}ms`,
        uvEntries: output.uvEntries.length,
        gridSize: output.gridSize,
      });
    } catch (error) {
      const endTime = performance.now();
      setWorkerOffscreenResult({
        generationTime: 0,
        totalTime: endTime - setupStartTime,
        canvas: document.createElement("canvas"),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const runBodyPartsMainThreadTest = async () => {
    const startTime = performance.now();

    try {
      // Generate body parts atlas on main thread
      const result = createBodyPartsAtlas();

      if (!result) {
        throw new Error("Failed to generate body parts atlas");
      }

      const endTime = performance.now();
      const generationTime = endTime - startTime;

      setBodyPartsMainResult({
        generationTime,
        totalTime: generationTime,
        canvas: result.canvas,
        success: true,
      });

      console.log("✅ Body parts (Main Thread) complete:", {
        generationTime: `${generationTime.toFixed(2)}ms`,
      });
    } catch (error) {
      const endTime = performance.now();
      setBodyPartsMainResult({
        generationTime: endTime - startTime,
        totalTime: endTime - startTime,
        canvas: document.createElement("canvas"),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const runBodyPartsWorkerTest = async () => {
    const startTime = performance.now();

    try {
      // Dispatch task
      const subscription = bodyPartsAtlasTask.dispatch({});

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        subscription.onComplete(() => {
          resolve();
        });
        subscription.onError((error) => {
          reject(new Error(error));
        });
      });

      const transferStartTime = performance.now();
      const output = bodyPartsAtlasTask.stateRef.current.output;

      if (!output) {
        throw new Error("No output from worker");
      }

      // Reconstruct canvas from ImageData
      const { imageData, uvEntries, gridSize } = output;

      const canvas = document.createElement("canvas");
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to create canvas context");
      }

      // Put image data back into canvas
      const reconstructedImageData = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );
      ctx.putImageData(reconstructedImageData, 0, 0);

      const endTime = performance.now();
      const transferTime = endTime - transferStartTime;
      const totalTime = endTime - startTime;
      const generationTime = totalTime - transferTime;

      setBodyPartsWorkerResult({
        generationTime,
        transferTime,
        totalTime,
        canvas,
        success: true,
      });

      console.log("✅ Body parts (Worker) complete:", {
        generationTime: `${generationTime.toFixed(2)}ms`,
        transferTime: `${transferTime.toFixed(2)}ms`,
        totalTime: `${totalTime.toFixed(2)}ms`,
        uvEntries: uvEntries.length,
        gridSize,
      });
    } catch (error) {
      const endTime = performance.now();
      setBodyPartsWorkerResult({
        generationTime: 0,
        totalTime: endTime - startTime,
        canvas: document.createElement("canvas"),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const runBothTests = async () => {
    setIsRunning(true);

    if (testType === "font") {
      // Font atlas tests
      setMainThreadResult(null);
      setWorkerResult(null);
      setWorkerOffscreenResult(null);
      fontAtlasTask.reset();
      fontAtlasOffscreenTask.reset();

      // Run main thread test first
      await runMainThreadTest();

      // Small delay for UI update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Run worker test (ImageData)
      await runWorkerTest();

      // Small delay for UI update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Run worker test (OffscreenCanvas)
      await runWorkerOffscreenTest();
    } else {
      // Body parts atlas tests
      setBodyPartsMainResult(null);
      setBodyPartsWorkerResult(null);
      bodyPartsAtlasTask.reset();

      // Run main thread test first
      await runBodyPartsMainThreadTest();

      // Small delay for UI update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Run worker test
      await runBodyPartsWorkerTest();
    }

    setIsRunning(false);
  };

  const resetTests = () => {
    setMainThreadResult(null);
    setWorkerResult(null);
    setWorkerOffscreenResult(null);
    setBodyPartsMainResult(null);
    setBodyPartsWorkerResult(null);
    fontAtlasTask.reset();
    fontAtlasOffscreenTask.reset();
    bodyPartsAtlasTask.reset();
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">
                Atlas Worker Performance Test
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                Comparing main thread vs web worker atlas generation
              </p>
            </div>
            <Link to="/atlases">
              <Button variant="outline" size="sm">
                <IconHome className="h-4 w-4 mr-2" />
                Atlas Inspector
              </Button>
            </Link>
          </div>

          {/* Session Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-md">
            <span className="text-xs font-mono text-primary">
              🎯 Session 110: OffscreenCanvas Transfer Comparison
            </span>
          </div>
        </header>

        {/* Control Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Test Controls</CardTitle>
            <CardDescription>
              Run font atlas generation: Main Thread + Worker (ImageData) +
              Worker (OffscreenCanvas)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Test Type Selector */}
            <div className="flex gap-2 p-1 bg-secondary rounded-lg">
              <Button
                onClick={() => setTestType("font")}
                variant={testType === "font" ? "default" : "ghost"}
                className="flex-1"
              >
                Font Atlas (Fast ~18ms)
              </Button>
              <Button
                onClick={() => setTestType("bodyParts")}
                variant={testType === "bodyParts" ? "default" : "ghost"}
                className="flex-1"
              >
                Body Parts (Heavy ~100ms+)
              </Button>
            </div>

            <div className="flex gap-4">
              <Button
                onClick={runBothTests}
                disabled={isRunning}
                size="lg"
                className="flex-1"
              >
                <IconPlayerPlay className="h-5 w-5 mr-2" />
                {isRunning ? "Running Tests..." : "Run Performance Test"}
              </Button>
              <Button
                onClick={resetTests}
                disabled={isRunning}
                variant="outline"
                size="lg"
              >
                <IconRefresh className="h-5 w-5 mr-2" />
                Reset
              </Button>
            </div>

            {/* Progress Display */}
            {fontAtlasTask.isLoading && fontAtlasTask.progress && (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  Worker Progress: {fontAtlasTask.progress.stage} (
                  {fontAtlasTask.progress.current} /{" "}
                  {fontAtlasTask.progress.total})
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${(fontAtlasTask.progress.current / fontAtlasTask.progress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Grid */}
        {testType === "font" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Thread Result */}
            <Card>
              <CardHeader>
                <CardTitle>Main Thread</CardTitle>
                <CardDescription>Synchronous generation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {mainThreadResult ? (
                  <>
                    {mainThreadResult.success ? (
                      <>
                        {/* Canvas Preview */}
                        <div className="border-2 border-border rounded-lg bg-[#1a1a1a] p-4 flex items-center justify-center">
                          <canvas
                            ref={(el) => {
                              if (el && mainThreadResult.canvas) {
                                el.width = mainThreadResult.canvas.width;
                                el.height = mainThreadResult.canvas.height;
                                const ctx = el.getContext("2d");
                                if (ctx) {
                                  ctx.drawImage(mainThreadResult.canvas, 0, 0);
                                }
                              }
                            }}
                            className="max-w-full"
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>

                        {/* Metrics */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Generation Time:
                            </span>
                            <span className="font-mono font-bold text-green-500">
                              {mainThreadResult.generationTime.toFixed(2)}ms
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Total Time:
                            </span>
                            <span className="font-mono font-bold">
                              {mainThreadResult.totalTime.toFixed(2)}ms
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-destructive">
                        Error: {mainThreadResult.error}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Run test to see results
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Worker Result (ImageData) */}
            <Card>
              <CardHeader>
                <CardTitle>Worker (ImageData)</CardTitle>
                <CardDescription>Phase 1: ImageData transfer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {workerResult ? (
                  <>
                    {workerResult.success ? (
                      <>
                        {/* Canvas Preview */}
                        <div className="border-2 border-border rounded-lg bg-[#1a1a1a] p-4 flex items-center justify-center">
                          <canvas
                            ref={(el) => {
                              if (el && workerResult.canvas) {
                                el.width = workerResult.canvas.width;
                                el.height = workerResult.canvas.height;
                                const ctx = el.getContext("2d");
                                if (ctx) {
                                  ctx.drawImage(workerResult.canvas, 0, 0);
                                }
                              }
                            }}
                            className="max-w-full"
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>

                        {/* Metrics */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Generation Time:
                            </span>
                            <span className="font-mono font-bold text-green-500">
                              {workerResult.generationTime.toFixed(2)}ms
                            </span>
                          </div>
                          {workerResult.transferTime ? (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                Transfer Time:
                              </span>
                              <span className="font-mono font-bold text-orange-500">
                                {workerResult.transferTime.toFixed(2)}ms
                              </span>
                            </div>
                          ) : null}
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Total Time:
                            </span>
                            <span className="font-mono font-bold">
                              {workerResult.totalTime.toFixed(2)}ms
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-destructive">
                        Error: {workerResult.error}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Run test to see results
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Worker Result (OffscreenCanvas) */}
            <Card>
              <CardHeader>
                <CardTitle>Worker (OffscreenCanvas)</CardTitle>
                <CardDescription>Phase 2: Zero-copy transfer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {workerOffscreenResult ? (
                  <>
                    {workerOffscreenResult.success ? (
                      <>
                        {/* Canvas Preview */}
                        <div className="border-2 border-border rounded-lg bg-[#1a1a1a] p-4 flex items-center justify-center">
                          <canvas
                            ref={(el) => {
                              if (el && workerOffscreenResult.canvas) {
                                el.width = workerOffscreenResult.canvas.width;
                                el.height = workerOffscreenResult.canvas.height;
                                const ctx = el.getContext("2d");
                                if (ctx) {
                                  ctx.drawImage(
                                    workerOffscreenResult.canvas,
                                    0,
                                    0
                                  );
                                }
                              }
                            }}
                            className="max-w-full"
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>

                        {/* Metrics */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Generation Time:
                            </span>
                            <span className="font-mono font-bold text-green-500">
                              {workerOffscreenResult.generationTime.toFixed(2)}
                              ms
                            </span>
                          </div>
                          {workerOffscreenResult.transferTime && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                Transfer Time:
                              </span>
                              <span className="font-mono font-bold text-orange-500">
                                {workerOffscreenResult.transferTime.toFixed(2)}
                                ms
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Total Time:
                            </span>
                            <span className="font-mono font-bold">
                              {workerOffscreenResult.totalTime.toFixed(2)}ms
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-destructive">
                        Error: {workerOffscreenResult.error}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Run test to see results
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Body Parts Results Grid */}
        {testType === "bodyParts" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Main Thread Result */}
            <Card>
              <CardHeader>
                <CardTitle>Main Thread</CardTitle>
                <CardDescription>Body parts with Voronoi shell</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {bodyPartsMainResult ? (
                  <>
                    {bodyPartsMainResult.success ? (
                      <>
                        {/* Canvas Preview */}
                        <div className="border-2 border-border rounded-lg bg-[#1a1a1a] p-4 flex items-center justify-center">
                          <canvas
                            ref={(el) => {
                              if (el && bodyPartsMainResult.canvas) {
                                el.width = bodyPartsMainResult.canvas.width;
                                el.height = bodyPartsMainResult.canvas.height;
                                const ctx = el.getContext("2d");
                                if (ctx) {
                                  ctx.drawImage(
                                    bodyPartsMainResult.canvas,
                                    0,
                                    0
                                  );
                                }
                              }
                            }}
                            className="max-w-full"
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>

                        {/* Metrics */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Generation Time:
                            </span>
                            <span className="font-mono font-bold text-green-500">
                              {bodyPartsMainResult.generationTime.toFixed(2)}ms
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Total Time:
                            </span>
                            <span className="font-mono font-bold">
                              {bodyPartsMainResult.totalTime.toFixed(2)}ms
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-destructive">
                        Error: {bodyPartsMainResult.error}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Run test to see results
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Worker Result */}
            <Card>
              <CardHeader>
                <CardTitle>Worker (ImageData)</CardTitle>
                <CardDescription>Off-thread Voronoi generation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {bodyPartsWorkerResult ? (
                  <>
                    {bodyPartsWorkerResult.success ? (
                      <>
                        {/* Canvas Preview */}
                        <div className="border-2 border-border rounded-lg bg-[#1a1a1a] p-4 flex items-center justify-center">
                          <canvas
                            ref={(el) => {
                              if (el && bodyPartsWorkerResult.canvas) {
                                el.width = bodyPartsWorkerResult.canvas.width;
                                el.height = bodyPartsWorkerResult.canvas.height;
                                const ctx = el.getContext("2d");
                                if (ctx) {
                                  ctx.drawImage(
                                    bodyPartsWorkerResult.canvas,
                                    0,
                                    0
                                  );
                                }
                              }
                            }}
                            className="max-w-full"
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>

                        {/* Metrics */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Generation Time:
                            </span>
                            <span className="font-mono font-bold text-green-500">
                              {bodyPartsWorkerResult.generationTime.toFixed(2)}
                              ms
                            </span>
                          </div>
                          {bodyPartsWorkerResult.transferTime && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                Transfer Time:
                              </span>
                              <span className="font-mono font-bold text-orange-500">
                                {bodyPartsWorkerResult.transferTime.toFixed(2)}
                                ms
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Total Time:
                            </span>
                            <span className="font-mono font-bold">
                              {bodyPartsWorkerResult.totalTime.toFixed(2)}ms
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-destructive">
                        Error: {bodyPartsWorkerResult.error}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Run test to see results
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Font Comparison Summary */}
        {testType === "font" &&
          mainThreadResult &&
          workerResult &&
          workerOffscreenResult && (
            <Card>
              <CardHeader>
                <CardTitle>Performance Comparison</CardTitle>
                <CardDescription>Analysis of both approaches</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      Main Thread
                    </div>
                    <div className="text-2xl font-bold">
                      {mainThreadResult.success
                        ? `${mainThreadResult.totalTime.toFixed(1)}ms`
                        : "Error"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Baseline
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      Worker (ImageData)
                    </div>
                    <div className="text-2xl font-bold">
                      {workerResult.success
                        ? `${workerResult.totalTime.toFixed(1)}ms`
                        : "Error"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {workerResult.success && mainThreadResult.success
                        ? `${((workerResult.totalTime / mainThreadResult.totalTime - 1) * 100).toFixed(0)}% vs main`
                        : "N/A"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      Worker (Offscreen)
                    </div>
                    <div className="text-2xl font-bold">
                      {workerOffscreenResult.success
                        ? `${workerOffscreenResult.totalTime.toFixed(1)}ms`
                        : "Error"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {workerOffscreenResult.success && mainThreadResult.success
                        ? `${((workerOffscreenResult.totalTime / mainThreadResult.totalTime - 1) * 100).toFixed(0)}% vs main`
                        : "N/A"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Winner</div>
                    <div className="text-2xl font-bold">
                      {mainThreadResult.success &&
                      workerResult.success &&
                      workerOffscreenResult.success
                        ? (() => {
                            const times = [
                              {
                                name: "Main",
                                time: mainThreadResult.totalTime,
                              },
                              {
                                name: "ImageData",
                                time: workerResult.totalTime,
                              },
                              {
                                name: "Offscreen",
                                time: workerOffscreenResult.totalTime,
                              },
                            ];
                            const winner = times.reduce((min, curr) =>
                              curr.time < min.time ? curr : min
                            );
                            return winner.name;
                          })()
                        : "N/A"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Fastest total
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-2 text-sm text-muted-foreground">
                  <p>
                    <strong>Phase 1 (ImageData):</strong> Simple structured data
                    transfer. Worker extracts ImageData, main thread
                    reconstructs canvas. ~3-5ms overhead for
                    serialization/deserialization.
                  </p>
                  <p>
                    <strong>Phase 2 (OffscreenCanvas):</strong> Zero-copy
                    transfer via transferables. Worker owns canvas directly,
                    returns ImageBitmap. Should have lower overhead for large
                    atlases.
                  </p>
                  <p>
                    <strong>Key Insight:</strong> For small, fast operations
                    (~15-20ms), transfer overhead matters. Main thread may win
                    for tiny tasks.
                  </p>
                  <p>
                    <strong>The Real Win:</strong> Workers keep the main thread
                    responsive. For heavier tasks (body parts atlas ~100ms+),
                    workers prevent UI freezing.
                  </p>
                  <p>
                    <strong>Next Steps:</strong> Test with body parts atlas
                    (Voronoi tessellation) to see if workers win for heavy
                    computation.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

        {/* Body Parts Comparison Summary */}
        {testType === "bodyParts" &&
          bodyPartsMainResult &&
          bodyPartsWorkerResult && (
            <Card>
              <CardHeader>
                <CardTitle>Performance Comparison (Body Parts)</CardTitle>
                <CardDescription>
                  Heavy computation with Voronoi tessellation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      Main Thread
                    </div>
                    <div className="text-2xl font-bold">
                      {bodyPartsMainResult.success
                        ? `${bodyPartsMainResult.totalTime.toFixed(1)}ms`
                        : "Error"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Baseline (blocks UI)
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      Worker (ImageData)
                    </div>
                    <div className="text-2xl font-bold">
                      {bodyPartsWorkerResult.success
                        ? `${bodyPartsWorkerResult.totalTime.toFixed(1)}ms`
                        : "Error"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {bodyPartsWorkerResult.success &&
                      bodyPartsMainResult.success
                        ? `${((bodyPartsWorkerResult.totalTime / bodyPartsMainResult.totalTime - 1) * 100).toFixed(0)}% vs main`
                        : "N/A"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Winner</div>
                    <div className="text-2xl font-bold">
                      {bodyPartsMainResult.success &&
                      bodyPartsWorkerResult.success
                        ? bodyPartsMainResult.totalTime <
                          bodyPartsWorkerResult.totalTime
                          ? "Main Thread"
                          : "Worker"
                        : "N/A"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      By total time
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-2 text-sm text-muted-foreground">
                  <p>
                    <strong>Heavy Computation Test:</strong> Body parts atlas
                    includes Voronoi tessellation for the shell (~80-100ms).
                    This tests whether workers win for compute-heavy tasks.
                  </p>
                  <p>
                    <strong>Worker Generation:</strong>{" "}
                    {bodyPartsWorkerResult.success
                      ? `${bodyPartsWorkerResult.generationTime.toFixed(2)}ms`
                      : "N/A"}{" "}
                    actual work time
                  </p>
                  <p>
                    <strong>Transfer Overhead:</strong>{" "}
                    {bodyPartsWorkerResult.success &&
                    bodyPartsWorkerResult.transferTime
                      ? `${bodyPartsWorkerResult.transferTime.toFixed(2)}ms (${((bodyPartsWorkerResult.transferTime / bodyPartsWorkerResult.totalTime) * 100).toFixed(0)}% of total)`
                      : "N/A"}
                  </p>
                  <p>
                    <strong>Main Thread Responsiveness:</strong> While raw speed
                    may be similar, the worker keeps the UI responsive during
                    generation. No frame drops, no frozen interactions. This is
                    the real win!
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}
