import { eventKeywords } from "@/boids/vocabulary/keywords";
import { CameraControls } from "@/components/CameraControls";
import { CanvasFrame } from "@/components/CanvasFrame";
import { ControlsSidebar, type SpawnMode } from "@/components/ControlsSidebar";
import { MissionControlHeader } from "@/components/MissionControlHeader";
import { Minimap } from "@/components/Minimap";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { CanvasAPI } from "@/resources/canvas";
import { useResource, useSystem } from "@/system";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { useDebouncer } from "@tanstack/react-pacer";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

function SimulationView() {
  const runtimeController = useResource("runtimeController");
  const runtimeStore = useResource("runtimeStore");
  const canvas = useResource("canvas");
  const camera = useResource("camera");
  const renderer = useResource("renderer");
  const engine = useResource("engine");
  const webglRenderer = useResource("webglRenderer");
  const { useStore } = runtimeStore;
  const sidebarOpen = useStore((state) => state.ui.sidebarOpen);
  const headerCollapsed = useStore((state) => state.ui.headerCollapsed);
  const config = useStore((state) => state.config);

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
    (canvas: CanvasAPI, webglRenderer: { resize: (w: number, h: number) => void }) => {
      const { width, height } = getParentDimensions();
      canvas.resize(width, height);
      webglRenderer.resize(width, height);
    },
    {
      wait: 200,
      leading: false,
      trailing: true,
    }
  );

  useEffect(() => {
    // Mount canvas when system is ready
    if (canvas && webglRenderer && canvasContainerRef.current && canvasAreaRef.current) {
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

      // Mount both Canvas 2D and WebGL canvases
      // Only append if not already in the wrapper (prevents React StrictMode issues)
      if (!canvasWrapper.contains(canvas.canvas)) {
        canvasWrapper.appendChild(canvas.canvas);
      }
      if (!canvasWrapper.contains(webglRenderer.canvas)) {
        canvasWrapper.appendChild(webglRenderer.canvas);
      }

      // Calculate initial canvas size based on container
      // Use requestAnimationFrame to ensure layout is complete
      // This needs to run at least once to get the initial canvas size
      requestAnimationFrame(() => {
        const { width, height } = getParentDimensions();
        if (width > 0 && height > 0) {
          canvas.resize(width, height);
          webglRenderer.resize(width, height);
        }
      });

      // Helper function to find closest boid to screen position
      // Optimized: Only search boids near cursor
      const findClosestBoidToScreen = (
        screenX: number,
        screenY: number,
        maxScreenDistance: number
      ): string | null => {
        let closestBoid: string | null = null;
        let closestDistance = maxScreenDistance;

        // Convert screen position to world position for early rejection
        const worldPos = camera.screenToWorld(screenX, screenY);
        const searchRadiusWorld = maxScreenDistance / camera.zoom;

        for (const boid of engine.boids) {
          // Quick world-space distance check first (cheaper than screen transform)
          const worldDx = boid.position.x - worldPos.x;
          const worldDy = boid.position.y - worldPos.y;
          const worldDistSq = worldDx * worldDx + worldDy * worldDy;
          
          // Skip if too far in world space (early rejection)
          if (worldDistSq > searchRadiusWorld * searchRadiusWorld * 4) continue;

          // Now do accurate screen-space distance check
          const boidScreen = camera.worldToScreen(
            boid.position.x,
            boid.position.y
          );
          const dx = boidScreen.x - screenX;
          const dy = boidScreen.y - screenY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestBoid = boid.id;
          }
        }

        return closestBoid;
      };

      // Add click handler for placing obstacles, spawning predators, or following boids
      const handleCanvasClick = (e: MouseEvent) => {
        // Don't process clicks while panning - click just releases pan mode
        if (camera.isDragging) {
          return;
        }

        const rect = canvas.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Handle picker mode - start following target boid
        if (camera.mode.type === "picker" && camera.mode.targetBoidId) {
          camera.startFollowing(camera.mode.targetBoidId);
          toast.success("Following boid", {
            description: `ID: ${camera.mode.targetBoidId.slice(0, 8)}...`,
          });
          return;
        }

        // Convert screen coordinates to world coordinates using camera
        const worldPos = camera.screenToWorld(screenX, screenY);
        const x = worldPos.x;
        const y = worldPos.y;

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

      // Throttle picker updates to avoid performance issues
      let lastPickerUpdate = 0;
      const PICKER_UPDATE_INTERVAL = 16; // ~60 FPS (16ms)

      // Add mouse move handler for picker mode
      const handleCanvasMouseMove = (e: MouseEvent) => {
        if (camera.mode.type !== "picker") return;

        // Throttle updates to avoid excessive computation
        const now = performance.now();
        if (now - lastPickerUpdate < PICKER_UPDATE_INTERVAL) return;
        lastPickerUpdate = now;

        const rect = canvas.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = camera.screenToWorld(screenX, screenY);

        // Find closest boid within picker radius (80px screen space)
        const closestBoidId = findClosestBoidToScreen(screenX, screenY, 80);

        camera.updatePickerTarget(closestBoidId, worldPos);
      };

      // Track mouse enter/leave canvas for picker mode
      const handleCanvasMouseEnter = () => {
        camera.setMouseInCanvas(true);
      };

      const handleCanvasMouseLeave = () => {
        camera.setMouseInCanvas(false);
      };

      canvas.canvas.addEventListener("click", handleCanvasClick);
      canvas.canvas.addEventListener("mousemove", handleCanvasMouseMove);
      canvas.canvas.addEventListener("mouseenter", handleCanvasMouseEnter);
      canvas.canvas.addEventListener("mouseleave", handleCanvasMouseLeave);

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
        canvas.canvas.removeEventListener("mousemove", handleCanvasMouseMove);
        canvas.canvas.removeEventListener("mouseenter", handleCanvasMouseEnter);
        canvas.canvas.removeEventListener("mouseleave", handleCanvasMouseLeave);
      };
    }
  }, [spawnMode, canvas, webglRenderer, renderer, runtimeController, camera, engine]);

  // Use reactive camera mode for cursor updates
  const cameraMode = camera.useModeStore((state) => state.mode);

  // Update cursor based on spawn mode and camera mode
  useEffect(() => {
    if (canvasElementRef.current) {
      if (cameraMode.type === "picker") {
        canvasElementRef.current.style.cursor = "crosshair";
      } else if (spawnMode === "obstacle") {
        canvasElementRef.current.style.cursor = "crosshair";
      } else {
        canvasElementRef.current.style.cursor = "pointer";
      }
    }
  }, [spawnMode, cameraMode]);

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
          updateCanvasDebouncer.maybeExecute(canvas, webglRenderer);
        }
      }
    });

    // Observe the canvas AREA (parent), not the container that holds the canvas
    // This prevents feedback loops from canvas size changes
    resizeObserver.observe(canvasAreaRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvas, webglRenderer, updateCanvasDebouncer]);

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
    >
      <div
        style={
          {
            "--simulation-bg": config.world.backgroundColor,
          } as React.CSSProperties
        }
        className="flex h-screen w-screen overflow-hidden bg-background"
      >
        <ControlsSidebar
          spawnMode={spawnMode}
          onSpawnModeChange={setSpawnMode}
        />
        <SidebarInset className="flex flex-col">
          {/* Header with Sidebar Trigger and Graphs */}
          <AnimatePresence mode="wait">
            {!headerCollapsed ? (
              <motion.div
                key="header-expanded"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.1, ease: "easeInOut" }}
                className="relative flex items-center gap-2 border-b bg-card px-4 py-3 w-full overflow-hidden"
              >
                <div className="group">
                  <label
                    className={cn(
                      "absolute left-2 top-2 px-1 py-1 inline-flex items-center justify-center gap-2",
                      "rounded-md group-hover:bg-slate-100/30 z-50"
                    )}
                  >
                    <SidebarTrigger
                      className={"p-2"}
                      icon={IconAdjustmentsHorizontal}
                    />
                    <span className="text-sm">Simulation Controls</span>
                  </label>
                </div>
                {system && (
                  <MissionControlHeader
                    showGraphs={true} // Always show graphs when header expanded
                    collapsed={false}
                    onToggleCollapse={() => {
                      runtimeController.dispatch({
                        type: eventKeywords.ui.headerToggled,
                        collapsed: true,
                      });
                    }}
                  />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Canvas Area */}
          <div
            ref={canvasAreaRef}
            data-testid="canvas-area"
            className={cn(
              "flex-1 flex items-center justify-center bg-(--simulation-bg) relative overflow-hidden"
            )}
            style={
              {
                // Atmosphere settings driven by state (reactive!)
                "--simulation-fog-color": atmosphereSettings.fogColor,
              } as React.CSSProperties
            }
          >
            {/* Collapsed header elements - positioned inside canvas area */}
            {headerCollapsed && system && (
              <AnimatePresence mode="wait">
                <motion.div
                  key="header-collapsed"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="absolute inset-0 pointer-events-none z-50"
                >
                  {/* Expand Mission Control button */}
                  <div className="absolute top-0 right-4 pointer-events-auto">
                    <MissionControlHeader
                      showGraphs={false}
                      collapsed={true}
                      onToggleCollapse={() => {
                        runtimeController.dispatch({
                          type: eventKeywords.ui.headerToggled,
                          collapsed: false,
                        });
                      }}
                    />
                  </div>
                  {/* Sidebar trigger when header is collapsed */}
                  <div className="absolute left-2 top-2 pointer-events-auto group">
                    <label
                      className={cn(
                        "px-1 py-1 inline-flex items-center justify-center gap-2",
                        "rounded-md group-hover:bg-slate-100/30 bg-card/80 backdrop-blur-sm border border-primary/30"
                      )}
                    >
                      <SidebarTrigger
                        className={"p-2"}
                        icon={IconAdjustmentsHorizontal}
                      />
                      <span className="text-sm">Simulation Controls</span>
                    </label>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {!system && (
              <div className="text-primary text-lg">Loading system...</div>
            )}
            <div
              ref={canvasContainerRef}
              data-testid="canvas-container"
              className={cn(
                "relative w-full h-full border-2 border-(--simulation-fog-color) rounded-b-lg overflow-hidden"
              )}
            >
              <CanvasFrame
                fogIntensity={atmosphereSettings.fogIntensity}
                fogOpacity={atmosphereSettings.fogOpacity}
              />
              {/* Camera controls and minimap overlays */}
              {system && (
                <>
                  <CameraControls />
                  <Minimap backgroundColor={config.world.backgroundColor} />
                </>
              )}
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default SimulationView;
