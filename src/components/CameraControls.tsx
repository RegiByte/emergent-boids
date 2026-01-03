import { useResource } from "../systems/standard.ts";
import { Card } from "./ui/card";

export function CameraControls() {
  const camera = useResource("camera");
  const runtimeStore = useResource("runtimeStore");

  // Use reactive mode store for immediate UI updates
  const cameraMode = camera.useMode();

  const worldWidth = runtimeStore.useStore((state) => state.config.world.width);
  const worldHeight = runtimeStore.useStore(
    (state) => state.config.world.height,
  );

  return (
    <div className="absolute bottom-4 left-4 z-40 hidden lg:block">
      <Card className="bg-black/1 backdrop-blur-xs border-primary/30 border p-3 space-y-2">
        <div className="text-xs font-mono text-primary/70 mb-2">
          CAMERA CONTROLS
        </div>

        {/* Position */}
        <div className="space-y-1">
          <div className="text-xs text-primary/50">Position:</div>
          <div className="text-xs font-mono text-primary">
            X: {Math.round(camera.x)} / {worldWidth}
          </div>
          <div className="text-xs font-mono text-primary">
            Y: {Math.round(camera.y)} / {worldHeight}
          </div>
        </div>

        {/* Zoom */}
        <div className="space-y-1">
          <div className="text-xs text-primary/50">Zoom:</div>
          <div className="text-xs font-mono text-primary">
            {camera.zoom.toFixed(2)}x
          </div>
        </div>

        {/* Controls hint */}
        <div className="border-t border-primary/20 pt-2 mt-2 space-y-1">
          <div className="text-xs text-primary/50">Controls:</div>
          <div className="text-xs font-mono text-primary/70">
            WASD - Pan camera
          </div>
          <div className="text-xs font-mono text-primary/70">
            Scroll - Zoom in/out
          </div>
          <div className="text-xs font-mono text-primary/70">
            Ctrl+Click - Drag to pan
          </div>
          <div className="text-xs font-mono text-primary/70">
            Minimap - Click to jump
          </div>
        </div>

        {/* Quick actions */}
        <div className="border-t border-primary/20 pt-2 mt-2 space-y-1">
          <button
            onClick={() => camera.panTo(worldWidth / 2, worldHeight / 2, true)}
            className="w-full text-xs bg-primary/20 hover:bg-primary/30 text-primary py-1 px-2 rounded transition-colors"
          >
            Center Camera
          </button>
          <button
            onClick={() => camera.setZoom(1.0)}
            className="w-full text-xs bg-primary/20 hover:bg-primary/30 text-primary py-1 px-2 rounded transition-colors"
          >
            Reset Zoom
          </button>

          {/* Follow Boid Button */}
          <button
            onClick={() => {
              if (cameraMode.type === "picker") {
                camera.exitPickerMode();
              } else {
                // From free OR following mode, enter picker mode
                camera.enterPickerMode();
              }
            }}
            className={`w-full text-xs py-1 px-2 rounded transition-colors ${
              cameraMode.type === "picker"
                ? "bg-blue-500/40 hover:bg-blue-500/50 text-blue-200"
                : cameraMode.type === "following"
                  ? "bg-yellow-500/40 hover:bg-yellow-500/50 text-yellow-200"
                  : "bg-primary/20 hover:bg-primary/30 text-primary"
            }`}
          >
            {cameraMode.type === "picker"
              ? "Cancel Picker"
              : cameraMode.type === "following"
                ? "Follow Another"
                : "Follow Boid"}
          </button>

          {/* Show followed boid info with stop button */}
          {cameraMode.type === "following" && (
            <div className="space-y-1">
              <div className="text-xs text-primary/70 font-mono">
                Following: {cameraMode.boidId.slice(0, 8)}...
              </div>
              <button
                onClick={() => camera.stopFollowing()}
                className="w-full text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 py-1 px-2 rounded transition-colors"
              >
                Stop Following (Esc)
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
