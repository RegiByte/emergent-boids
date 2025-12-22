import { useEffect, useRef, useState } from "react";
import { useSystem } from "@/system";
import { type SpawnMode } from "@/components/ControlsSidebar";
import { ControlsSidebar } from "@/components/ControlsSidebar";
import { GraphBar } from "@/components/GraphBar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { eventKeywords } from "@/boids/vocabulary/keywords";
import { toast } from "sonner";

function SimulationView() {
  const system = useSystem();
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const [spawnMode, setSpawnMode] = useState<SpawnMode>("obstacle");

  useEffect(() => {
    // Mount canvas when system is ready
    if (system?.canvas && canvasContainerRef.current) {
      const container = canvasContainerRef.current;
      const canvas = system.canvas.canvas;
      canvasElementRef.current = canvas;

      // Clear container and append canvas
      container.innerHTML = "";
      container.appendChild(canvas);

      // Calculate initial canvas size based on container
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const canvasWidth = Math.floor(rect.width - 40);
        const canvasHeight = Math.floor(rect.height - 40);
        system.canvas.resize(canvasWidth, canvasHeight);
      });

      // Add click handler for placing obstacles or spawning predators
      const handleCanvasClick = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
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
          toast.success("Obstacle placed", {
            description: `Position: (${Math.round(x)}, ${Math.round(y)})`,
          });
        } else {
          // Dispatch spawn predator event
          system.runtimeController.dispatch({
            type: eventKeywords.boids.spawnPredator,
            x,
            y,
          });
          toast.success("Predator spawned", {
            description: `Position: (${Math.round(x)}, ${Math.round(y)})`,
          });
        }
      };

      canvas.addEventListener("click", handleCanvasClick);

      // Start the renderer
      if (system.renderer) {
        system.renderer.start();
      }

      return () => {
        // Stop renderer on cleanup
        if (system.renderer) {
          system.renderer.stop();
        }
        canvas.removeEventListener("click", handleCanvasClick);
      };
    }
  }, [system, spawnMode]);

  // Update cursor based on spawn mode
  useEffect(() => {
    if (canvasElementRef.current) {
      canvasElementRef.current.style.cursor =
        spawnMode === "obstacle" ? "crosshair" : "pointer";
    }
  }, [spawnMode]);

  // Handle canvas container resize (tracks both window resize and sidebar toggle)
  useEffect(() => {
    if (!system?.canvas || !canvasContainerRef.current) return;

    let resizeTimeout: ReturnType<typeof setTimeout>;

    const resizeObserver = new ResizeObserver((entries) => {
      // Debounce resize to avoid too many updates
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const container = entries[0];
        if (container) {
          (
            window as unknown as { simulationContainer: HTMLDivElement }
          ).simulationContainer = container;
          // Use requestAnimationFrame to ensure layout is complete
          requestAnimationFrame(() => {
            // Calculate canvas size based on container dimensions
            const containerWidth = container.contentRect.width;
            const containerHeight = container.contentRect.height;

            // Add some padding (20px on each side)
            const canvasWidth = Math.floor(containerWidth - 40);
            const canvasHeight = Math.floor(containerHeight - 40);

            // Only resize if dimensions are valid
            if (canvasWidth > 0 && canvasHeight > 0) {
              system.canvas.resize(canvasWidth, canvasHeight);
            }
          });
        }
      }, 100); // Reduced debounce time for snappier response
    });

    // Observe the canvas container for size changes
    resizeObserver.observe(canvasContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(resizeTimeout);
    };
  }, [system]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with browser shortcuts (Cmd/Ctrl + key combinations)
      if (e.metaKey || e.ctrlKey) {
        return;
      }

      // Space: Toggle spawn mode
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpawnMode((prev) => {
          const newMode = prev === "obstacle" ? "predator" : "obstacle";
          toast.info(
            newMode === "obstacle"
              ? "Mode: Place Obstacles"
              : "Mode: Spawn Predators"
          );
          return newMode;
        });
      }

      // Escape: Clear obstacles
      if (e.code === "Escape" && system) {
        e.preventDefault();
        system.runtimeController.dispatch({
          type: eventKeywords.obstacles.cleared,
        });
        toast.success("All obstacles cleared");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [system]);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <ControlsSidebar
          spawnMode={spawnMode}
          onSpawnModeChange={setSpawnMode}
        />
        <SidebarInset className="flex flex-col">
          {/* Header */}
          <header className="flex items-center gap-2 border-b bg-card px-4 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-lg font-bold text-primary">
                🐦 Emergent Boids: Predator/Prey Ecosystem
              </h1>
              <p className="text-xs text-muted-foreground">
                Simple rules → Complex dynamics
              </p>
            </div>
          </header>

          {/* Graph Bar */}
          {system && <GraphBar />}

          {/* Canvas Area */}
          <div className="flex-1 flex items-center justify-center bg-black relative overflow-hidden">
            {!system && (
              <div className="text-primary text-lg">Loading system...</div>
            )}
            <div
              ref={canvasContainerRef}
              className="flex items-center justify-center w-full h-full"
            />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default SimulationView;
