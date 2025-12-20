import { useEffect, useRef } from "react";
import "./App.css";
import { useSystem } from "./system";
import { Controls } from "./components/Controls";
import { eventKeywords } from "./vocabulary/keywords";

function App() {
  const system = useSystem();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mount canvas when system is ready
    if (system?.canvas && canvasContainerRef.current) {
      const container = canvasContainerRef.current;

      // Clear container and append canvas
      container.innerHTML = "";
      container.appendChild(system.canvas.canvas);

      // Add click handler for placing obstacles
      const handleCanvasClick = (e: MouseEvent) => {
        const rect = system.canvas.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Dispatch obstacle added event
        system.runtimeController.dispatch({
          type: eventKeywords.obstacles.added,
          x,
          y,
          radius: 30, // Default radius
        });
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
  }, [system]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "20px",
        padding: "20px",
      }}
    >
      <h1>Emergent Boids</h1>
      <p style={{ color: "#888", maxWidth: "600px", textAlign: "center" }}>
        Watch as simple rules (separation, alignment, cohesion, obstacle avoidance) create complex
        flocking behavior. Each boid only knows about its neighbors, yet the
        flock moves as one. Click on the canvas to place obstacles!
      </p>

      <div
        style={{
          display: "flex",
          gap: "20px",
          alignItems: "flex-start",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <div ref={canvasContainerRef} />
        <Controls />
      </div>

      {!system && <p>Loading system...</p>}
    </div>
  );
}

export default App;
