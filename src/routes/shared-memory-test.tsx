/**
 * Shared Memory Test Route (Session 111)
 *
 * Simple test page to verify SharedArrayBuffer support and basic functionality.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  getSharedArrayBufferStatus,
  createSharedBoidBuffer,
  createSharedBoidViews,
  getActivePositions,
  swapBuffers,
  getInactivePositions,
} from "@/lib/sharedMemory";

export const Route = createFileRoute("/shared-memory-test")({
  component: SharedMemoryTest,
});

function SharedMemoryTest() {
  const [status] = useState(() => getSharedArrayBufferStatus());
  const [testResult, setTestResult] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  // Test 1: Basic SharedArrayBuffer creation
  const testBasicCreation = () => {
    try {
      const buffer = new SharedArrayBuffer(1024);
      const view = new Uint32Array(buffer);
      view[0] = 42;

      setTestResult(
        `✅ Created SharedArrayBuffer(1024), wrote value: ${view[0]}`,
      );
    } catch (error) {
      setTestResult(
        `❌ Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Test 2: Create boid buffer with layout
  const testBoidBuffer = () => {
    try {
      const { buffer, layout } = createSharedBoidBuffer(100);
      const views = createSharedBoidViews(buffer, layout);

      // Write some test data to inactive buffer
      const inactive = getInactivePositions(views);
      inactive[0] = 123.45;
      inactive[1] = 678.9;

      // Swap buffers
      swapBuffers(views);

      // Read from now-active buffer
      const active = getActivePositions(views);

      setTestResult(
        `✅ Created buffer for 100 boids (${layout.totalBytes} bytes)\n` +
          `   Written [${inactive[0]}, ${inactive[1]}]\n` +
          `   Read back [${active[0]}, ${active[1]}]`,
      );
    } catch (error) {
      setTestResult(
        `❌ Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Test 3: Animated boids using shared memory
  const startAnimation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Create shared buffer for 100 boids
    const boidCount = 100;
    const { buffer, layout } = createSharedBoidBuffer(boidCount);
    const views = createSharedBoidViews(buffer, layout);

    // Initialize positions in inactive buffer
    const inactive = getInactivePositions(views);
    for (let i = 0; i < boidCount; i++) {
      inactive[i * 2 + 0] = Math.random() * canvas.width;
      inactive[i * 2 + 1] = Math.random() * canvas.height;
    }

    // Swap to make them active
    swapBuffers(views);

    let frame = 0;
    const animate = () => {
      frame++;

      // Simulate: Write to inactive buffer
      const writeBuffer = getInactivePositions(views);
      const time = Date.now() / 1000;

      for (let i = 0; i < boidCount; i++) {
        const angle = time + i * 0.1;
        const radius = 50 + i * 2;
        writeBuffer[i * 2 + 0] = canvas.width / 2 + Math.cos(angle) * radius;
        writeBuffer[i * 2 + 1] = canvas.height / 2 + Math.sin(angle) * radius;
      }

      // Atomic swap
      swapBuffers(views);

      // Render: Read from active buffer
      const readBuffer = getActivePositions(views);

      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#00ff00";
      for (let i = 0; i < boidCount; i++) {
        const x = readBuffer[i * 2 + 0];
        const y = readBuffer[i * 2 + 1];
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update stats
      if (frame % 30 === 0) {
        setTestResult(
          `✅ Animation running: ${frame} frames\n` +
            `   Buffer size: ${layout.totalBytes} bytes\n` +
            `   Boids: ${boidCount}\n` +
            `   Buffer index: ${views.bufferIndex[0]}`,
        );
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
  };

  const stopAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
      setTestResult("⏹️ Animation stopped");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">SharedArrayBuffer Test</h1>
          <p className="text-muted-foreground">
            Session 111 - Verifying shared memory support for parallel
            simulation
          </p>
        </div>

        {/* Status Card */}
        <div className="border rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">Browser Support Status</h2>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">SharedArrayBuffer:</span>
              <span
                className={status.supported ? "text-green-500" : "text-red-500"}
              >
                {status.supported ? "✅ Supported" : "❌ Not Supported"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">crossOriginIsolated:</span>
              <span
                className={
                  status.crossOriginIsolated ? "text-green-500" : "text-red-500"
                }
              >
                {status.crossOriginIsolated ? "✅ true" : "❌ false"}
              </span>
            </div>

            {status.reason && (
              <div className="bg-destructive/10 border border-destructive/20 rounded p-3 mt-2">
                <p className="text-sm font-mono text-destructive">
                  {status.reason}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Make sure the server is sending COOP/COEP headers. Check
                  vite.config.ts for configuration.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Test Buttons */}
        {status.supported && (
          <div className="border rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold">Tests</h2>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={testBasicCreation}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                Test 1: Basic Creation
              </button>

              <button
                onClick={testBoidBuffer}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                Test 2: Boid Buffer Layout
              </button>

              <button
                onClick={startAnimation}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                disabled={animationRef.current !== 0}
              >
                Test 3: Start Animation
              </button>

              <button
                onClick={stopAnimation}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                disabled={animationRef.current === 0}
              >
                Stop Animation
              </button>
            </div>

            {testResult && (
              <div className="bg-muted rounded p-4 mt-4">
                <pre className="text-sm font-mono whitespace-pre-wrap">
                  {testResult}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Animation Canvas */}
        {status.supported && (
          <div className="border rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold">Animation Canvas</h2>
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="border border-border rounded bg-black w-full"
              style={{ maxWidth: "100%" }}
            />
          </div>
        )}

        {/* Instructions */}
        <div className="border rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">How This Works</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>SharedArrayBuffer</strong> allows zero-copy data sharing
              between threads. For it to work, the browser requires special
              security headers:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Cross-Origin-Opener-Policy: same-origin</li>
              <li>Cross-Origin-Embedder-Policy: require-corp</li>
            </ul>
            <p>
              These headers are configured in{" "}
              <code className="bg-muted px-1 rounded">vite.config.ts</code>. You
              may need to restart the dev server for changes to take effect.
            </p>
            <p>
              <strong>Double Buffering:</strong> We use two buffers to prevent
              torn reads: the worker writes to the inactive buffer while the
              main thread reads from the active buffer. An atomic swap ensures
              clean handoff.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
