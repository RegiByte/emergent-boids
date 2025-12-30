precision highp float;

// Shared quad geometry (0,0) to (1,1)
attribute vec2 position;

// Per-instance attributes
attribute vec2 boidPos;      // Boid world position
attribute vec2 uvOffset;     // UV offset for this emoji in atlas
attribute float alpha;       // Fade-out alpha

// Uniforms
uniform mat3 transform;      // Camera transform
uniform float cellSize;      // Size of one cell in UV space (1/gridSize)
uniform float symbolSize;    // World-space size of symbol (e.g., 20px)

// Varying (passed to fragment shader)
varying vec2 vUV;
varying float vAlpha;

void main() {
  // Calculate symbol position (above boid)
  // Offset by -25px to position above health bar (which is at -20px)
  vec2 symbolPos = boidPos + vec2(0.0, -25.0);
  
  // Offset by quad position (centered)
  vec2 offset = (position - 0.5) * symbolSize;
  vec2 worldPos = symbolPos + offset;
  
  // Transform to clip space
  vec3 clipPos = transform * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
  
  // Calculate UV coordinates
  // position is (0,0) to (1,1), scale to cell size and offset
  vUV = uvOffset + position * cellSize;
  vAlpha = alpha;
}

