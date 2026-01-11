interface CanvasFrameProps {
  /**
   * How far the fog extends inward (0-1, default: 0.3)
   */
  fogIntensity?: number
  /**
   * Opacity of the fog (0-1, default: 0.6)
   */
  fogOpacity?: number
}

/**
 * SVG frame overlay that creates a fog/vignette effect around the canvas edges.
 * Uses radial gradients to simulate fog emanating from the borders.
 */
export function CanvasFrame({
  fogIntensity = 0.3,
  fogOpacity = 0.6,
}: CanvasFrameProps) {
  const stopColor = `var(--simulation-fog-color)`
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 100 }}
      preserveAspectRatio="none"
    >
      <defs>
        {/* Top edge fog */}
        <linearGradient id="fog-top" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={stopColor} stopOpacity={fogOpacity} />
          <stop
            offset={`${fogIntensity * 100}%`}
            stopColor={stopColor}
            stopOpacity="0"
          />
        </linearGradient>

        {/* Bottom edge fog */}
        <linearGradient id="fog-bottom" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={stopColor} stopOpacity={fogOpacity} />
          <stop
            offset={`${fogIntensity * 100}%`}
            stopColor={stopColor}
            stopOpacity="0"
          />
        </linearGradient>

        {/* Left edge fog */}
        <linearGradient id="fog-left" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={stopColor} stopOpacity={fogOpacity} />
          <stop
            offset={`${fogIntensity * 100}%`}
            stopColor={stopColor}
            stopOpacity="0"
          />
        </linearGradient>

        {/* Right edge fog */}
        <linearGradient id="fog-right" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={stopColor} stopOpacity={fogOpacity} />
          <stop
            offset={`${fogIntensity * 100}%`}
            stopColor={stopColor}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>

      {/* Edge fog rectangles - subtle frame effect */}
      <rect width="100%" height="12%" fill="url(#fog-top)" />
      <rect y="88%" width="100%" height="12%" fill="url(#fog-bottom)" />
      <rect width="8%" height="100%" fill="url(#fog-left)" />
      <rect x="92%" width="8%" height="100%" fill="url(#fog-right)" />
    </svg>
  )
}
