precision highp float;

// Shared quad geometry (-1,-1) to (1,1)
attribute vec2 position;

// Per-instance attributes
attribute vec2 foodPosition;  // Food world position
attribute vec2 uvOffset;      // UV offset for this emoji in atlas
attribute float alpha;        // Fade-out alpha (scales with energy)

// Uniforms
uniform mat3 transform;       // Camera transform
uniform float cellSize;       // Size of one cell in UV space (1/gridSize)

// Varying (passed to fragment shader)
varying vec2 vUV;
varying float vAlpha;

void main() {
  // Symbol size scales with cellSize to match food radius
  // Food emojis are slightly larger than food circles for visibility
  float symbolSize = 24.0; // Fixed size for food emojis
  
  // Position emoji at food center
  vec2 offset = position * symbolSize;
  vec2 worldPos = foodPosition + offset;
  
  // Transform to clip space
  vec3 clipPos = transform * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
  
  // Calculate UV coordinates
  // position is (-1,-1) to (1,1), convert to (0,0) to (1,1)
  vec2 uvCoord = (position + 1.0) * 0.5;
  vUV = uvOffset + uvCoord * cellSize;
  vAlpha = alpha;
}

