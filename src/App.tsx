import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useSystem } from "./system";
import { type SpawnMode } from "./components/Controls";
import { SimulationPanel } from "./components/SimulationPanel";
import { eventKeywords } from "./boids/vocabulary/keywords";
import { calculateCanvasDimensions } from "./resources/canvas";

function App() {
  const system = useSystem();
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [spawnMode, setSpawnMode] = useState<SpawnMode>("obstacle");

  useEffect(() => {
    // Mount canvas when system is ready
    if (system?.canvas && canvasContainerRef.current) {
      const container = canvasContainerRef.current;

      // Clear container and append canvas
      container.innerHTML = "";
      container.appendChild(system.canvas.canvas);

      // Add click handler for placing obstacles or spawning predators
      const handleCanvasClick = (e: MouseEvent) => {
        const rect = system.canvas.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (spawnMode === "obstacle") {
          // Dispatch obstacle added event
          system.runtimeController.dispatch({
            type: eventKeywords.obstacles.added,
            x,
            y,
            radius: 30, // Default radius
          });
        } else {
          // Dispatch spawn predator event
          system.runtimeController.dispatch({
            type: eventKeywords.boids.spawnPredator,
            x,
            y,
          });
        }
      };

      system.canvas.canvas.addEventListener("click", handleCanvasClick);

      // Start the renderer
      if (system.renderer) {
        system.renderer.start();
      }

      return () => {
        // Stop renderer on cleanup
        if (system.renderer) {
          system.renderer.stop();
        }
        system.canvas.canvas.removeEventListener("click", handleCanvasClick);
      };
    }
  }, [system, spawnMode]);

  // Handle window resize
  useEffect(() => {
    if (!system?.canvas) return;

    let resizeTimeout: ReturnType<typeof setTimeout>;
    
    const handleResize = () => {
      // Debounce resize to avoid too many updates
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const { canvasWidth, canvasHeight } = calculateCanvasDimensions();
        system.canvas.resize(canvasWidth, canvasHeight);
      }, 150); // Wait 150ms after resize stops
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [system]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "#0a0a0a",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          background: "#1a1a1a",
          borderBottom: "2px solid #333",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "24px", color: "#00ff88" }}>
          🐦 Emergent Boids: Predator/Prey Ecosystem
        </h1>
        <p style={{ margin: "8px 0 0 0", color: "#888", fontSize: "14px" }}>
          Simple rules → Complex dynamics. Click canvas to spawn predators or place obstacles.
        </p>
      </div>

      {/* Main Content: 75% Canvas | 25% Panel */}
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
        }}
      >
        {/* Canvas Area (75%) */}
        <div
          style={{
            flex: "0 0 75%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#000",
            position: "relative",
          }}
        >
          {!system && (
            <div style={{ color: "#00ff88", fontSize: "18px" }}>
              Loading system...
            </div>
          )}
          <div 
            ref={canvasContainerRef}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
            }}
          />
        </div>

        {/* Simulation Panel (25%) */}
        <div
          style={{
            flex: "0 0 25%",
            display: "flex",
            flexDirection: "column",
            minWidth: "350px",
          }}
        >
          {system && (
            <SimulationPanel
              spawnMode={spawnMode}
              onSpawnModeChange={setSpawnMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

