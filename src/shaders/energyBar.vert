// Energy Bar Vertex Shader
// Renders rectangular energy bars above boids
// Uses instanced rendering: one draw call for all bars

precision mediump float;

// Shared quad geometry (unit square: 0,0 to 1,1)
attribute vec2 position; // (0,0), (1,0), (0,1), (1,1)

// Per-instance attributes (one per energy bar)
attribute vec2 boidPos;       // Boid world position
attribute float energyPercent; // Energy percentage (0-1)
attribute vec3 barColor;      // Bar color (red for predator, green for prey)

// Camera transform (world space → NDC)
uniform mat3 transform;

// Bar dimensions (in world units)
uniform float barWidth;
uniform float barHeight;
uniform float barOffsetY; // Offset above boid
uniform float layerType;  // 0 = background, 1 = fill, 2 = border

// Pass to fragment shader
varying vec3 vColor;

void main() {
  // Calculate bar position (centered above boid)
  vec2 barTopLeft = boidPos + vec2(-barWidth / 2.0, -barOffsetY);
  
  // Scale position based on layer
  vec2 scaledPos = position;
  if (layerType > 0.5 && layerType < 1.5) {
    // Fill bar: scale width by energy percentage
    scaledPos.x *= energyPercent;
  }
  
  // Calculate world position
  vec2 worldPos = barTopLeft + scaledPos * vec2(barWidth, barHeight);
  
  // Transform to NDC
  vec3 ndc = transform * vec3(worldPos, 1.0);
  gl_Position = vec4(ndc.xy, 0.0, 1.0);
  
  // Pass color to fragment shader
  vColor = barColor;
}

