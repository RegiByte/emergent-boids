import { useResource } from "../system";
import { Card } from "./ui/card";

export function CameraControls() {
  const camera = useResource("camera");
  const runtimeStore = useResource("runtimeStore");

  const worldWidth = runtimeStore.useStore(
    (state) => state.config.world.canvasWidth
  );
  const worldHeight = runtimeStore.useStore(
    (state) => state.config.world.canvasHeight
  );

  return (
    <div className="absolute bottom-4 left-4 z-40 hidden lg:block">
      <Card className="bg-black/80 backdrop-blur-sm border-primary/30 p-3 space-y-2">
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
            onClick={() => camera.panTo(worldWidth / 2, worldHeight / 2)}
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
        </div>
      </Card>
    </div>
  );
}
