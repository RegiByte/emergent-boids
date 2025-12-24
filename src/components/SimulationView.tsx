import { eventKeywords } from "@/boids/vocabulary/keywords";
import { ControlsSidebar, type SpawnMode } from "@/components/ControlsSidebar";
import { HeaderSidebar } from "@/components/HeaderSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useResource, useSystem } from "@/system";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncer } from "@tanstack/react-pacer";
import { CanvasAPI } from "@/resources/canvas";
import { CanvasFrame } from "@/components/CanvasFrame";

function SimulationView() {
  const runtimeController = useResource("runtimeController");
  const runtimeStore = useResource("runtimeStore");
  const canvas = useResource("canvas");
  const renderer = useResource("renderer");
  const { useStore } = runtimeStore;
  const sidebarOpen = useStore((state) => state.ui.sidebarOpen);

  // Get atmosphere settings (select individual values to avoid creating new objects)
  const atmosphereBase = useStore(
    (state) => state.ui.visualSettings.atmosphere.base
  );
  const atmosphereEvent = useStore(
    (state) => state.ui.visualSettings.atmosphere.activeEvent
  );

  // Compute final settings (memoized to prevent re-renders)
  const atmosphereSettings = useMemo(() => {
    if (atmosphereEvent) {
      return {
        trailAlpha: atmosphereEvent.settings.trailAlpha,
        fogColor: atmosphereEvent.settings.fogColor,
        fogIntensity:
          atmosphereEvent.settings.fogIntensity ?? atmosphereBase.fogIntensity,
        fogOpacity:
          atmosphereEvent.settings.fogOpacity ?? atmosphereBase.fogOpacity,
      };
    }
    return atmosphereBase;
  }, [atmosphereBase, atmosphereEvent]);
  const system = useSystem();
  const canvasAreaRef = useRef<HTMLDivElement>(null); // The parent flex container
  const canvasContainerRef = useRef<HTMLDivElement>(null); // The canvas wrapper
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const [spawnMode, setSpawnMode] = useState<SpawnMode>("obstacle");
  const getParentDimensions = () => {
    if (canvasAreaRef.current) {
      const rect = canvasAreaRef.current.getBoundingClientRect();
      return {
        width: Math.floor(rect.width) - 4,
        height: Math.floor(rect.height) - 4,
      };
    }
    return {
      width: 0,
      height: 0,
    };
  };
  const updateCanvasDebouncer = useDebouncer(
    (canvas: CanvasAPI) => {
      const { width, height } = getParentDimensions();
      console.trace("resizing canvas to", width, height);
      canvas.resize(width, height);
    },
    {
      wait: 200,
      leading: false,
      trailing: true,
    }
  );

  useEffect(() => {
    // Mount canvas when system is ready
    if (canvas && canvasContainerRef.current && canvasAreaRef.current) {
      const container = canvasContainerRef.current;
      canvasElementRef.current = canvas.canvas;

      // Find or create the canvas wrapper div
      let canvasWrapper = container.querySelector(
        "[data-canvas-wrapper]"
      ) as HTMLDivElement;
      if (!canvasWrapper) {
        canvasWrapper = document.createElement("div");
        canvasWrapper.setAttribute("data-canvas-wrapper", "true");
        canvasWrapper.style.position = "absolute";
        canvasWrapper.style.inset = "0";
        canvasWrapper.style.width = "100%";
        canvasWrapper.style.height = "100%";
        container.appendChild(canvasWrapper);
      }

      // Clear wrapper and append canvas
      canvasWrapper.innerHTML = "";
      canvasWrapper.appendChild(canvas.canvas);

      // Calculate initial canvas size based on container
      // Use requestAnimationFrame to ensure layout is complete
      // This needs to run at least once to get the initial canvas size
      requestAnimationFrame(() => {
        const { width, height } = getParentDimensions();
        if (width > 0 && height > 0) {
          canvas.resize(width, height);
        }
      });

      // Add click handler for placing obstacles or spawning predators
      const handleCanvasClick = (e: MouseEvent) => {
        const rect = canvas.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (spawnMode === "obstacle") {
          // Dispatch obstacle added event
          runtimeController.dispatch({
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
          runtimeController.dispatch({
            type: eventKeywords.boids.spawnPredator,
            x,
            y,
          });
          toast.success("Predator spawned", {
            description: `Position: (${Math.round(x)}, ${Math.round(y)})`,
          });
        }
      };

      canvas.canvas.addEventListener("click", handleCanvasClick);

      // Start the renderer
      if (renderer) {
        renderer.start();
      }

      return () => {
        // Stop renderer on cleanup
        if (renderer) {
          renderer.stop();
        }
        canvas.canvas.removeEventListener("click", handleCanvasClick);
      };
    }
  }, [spawnMode, canvas, renderer, runtimeController]);

  // Update cursor based on spawn mode
  useEffect(() => {
    if (canvasElementRef.current) {
      canvasElementRef.current.style.cursor =
        spawnMode === "obstacle" ? "crosshair" : "pointer";
    }
  }, [spawnMode]);

  // Handle canvas area resize (tracks both window resize and sidebar toggle)
  useEffect(() => {
    if (!canvas || !canvasAreaRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry) {
        const areaWidth = entry.contentRect.width;
        const areaHeight = entry.contentRect.height;

        const canvasWidth = Math.floor(areaWidth);
        const canvasHeight = Math.floor(areaHeight);

        if (canvasWidth > 0 && canvasHeight > 0) {
          updateCanvasDebouncer.maybeExecute(canvas);
        }
      }
    });

    // Observe the canvas AREA (parent), not the container that holds the canvas
    // This prevents feedback loops from canvas size changes
    resizeObserver.observe(canvasAreaRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvas, updateCanvasDebouncer]);

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
      if (e.code === "Escape") {
        e.preventDefault();
        runtimeController.dispatch({
          type: eventKeywords.obstacles.cleared,
        });
        toast.success("All obstacles cleared");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runtimeController]);

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={(open) => {
        console.log("sidebar open changed", open);
        runtimeController.dispatch({
          type: eventKeywords.ui.sidebarToggled,
          open,
        });
        // ResizeObserver will handle the canvas resize automatically
      }}
      onAnimationEnd={() => {
        console.log("sidebar animation end");
      }}
    >
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <ControlsSidebar
          spawnMode={spawnMode}
          onSpawnModeChange={setSpawnMode}
        />
        <SidebarInset className="flex flex-col">
          {/* Header with Sidebar Trigger and Graphs */}
          <div className="flex items-center gap-2 border-b bg-card px-4 py-3 w-full">
            <div className="group">
              <label
                className={cn(
                  "absolute left-2 top-2 px-1 py-1 inline-flex items-center justify-center gap-2",
                  "rounded-md group-hover:bg-slate-100/30"
                )}
              >
                <SidebarTrigger
                  className={"p-2"}
                  icon={IconAdjustmentsHorizontal}
                />
                <span className="text-sm">Simulation Controls</span>
              </label>
            </div>
            {system && <HeaderSidebar />}
          </div>

          {/* Canvas Area */}
          <div
            ref={canvasAreaRef}
            data-testid="canvas-area"
            className={cn(
              "flex-1 flex items-center justify-center bg-black relative overflow-hidden"
            )}
            style={
              {
                // Atmosphere settings driven by state (reactive!)
                "--simulation-bg": `rgba(0, 0, 0, ${atmosphereSettings.trailAlpha})`,
                "--simulation-fog-color": atmosphereSettings.fogColor,
              } as React.CSSProperties
            }
          >
            {!system && (
              <div className="text-primary text-lg">Loading system...</div>
            )}
            <div
              ref={canvasContainerRef}
              data-testid="canvas-container"
              className={cn("relative w-full h-full border-2 border-(--simulation-fog-color) rounded-b-lg overflow-hidden")}
            >
              <CanvasFrame
                fogIntensity={atmosphereSettings.fogIntensity}
                fogOpacity={atmosphereSettings.fogOpacity}
              />
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default SimulationView;
