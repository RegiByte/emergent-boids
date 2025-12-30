precision highp float;

// Shared quad geometry (0,0) to (1,1)
attribute vec2 position;

// Per-instance attributes (per character)
attribute vec2 charPos;      // Character screen position (pixels)
attribute vec2 uvOffset;     // UV offset for this character in atlas
attribute vec2 charSize;     // Character size (width, height) in pixels
attribute vec3 color;        // Character color (RGB)
attribute float alpha;       // Character alpha

// Uniforms
uniform vec2 resolution;     // Screen resolution (width, height)
uniform float cellSize;      // Size of one cell in UV space (1/gridSize)

// Varying (passed to fragment shader)
varying vec2 vUV;
varying vec3 vColor;
varying float vAlpha;

void main() {
  // Calculate character position in screen space
  // Offset by quad position (top-left origin)
  vec2 offset = position * charSize;
  vec2 screenPos = charPos + offset;
  
  // Convert screen coordinates to clip space (-1 to 1)
  // Note: Y is flipped (screen Y goes down, clip Y goes up)
  vec2 clipPos = (screenPos / resolution) * 2.0 - 1.0;
  clipPos.y = -clipPos.y; // Flip Y axis
  
  gl_Position = vec4(clipPos, 0.0, 1.0);
  
  // Calculate UV coordinates
  vUV = uvOffset + position * cellSize;
  vColor = color;
  vAlpha = alpha;
}
