precision mediump float;

// Per-vertex attributes (shared circle shape - we'll use a triangle fan)
attribute vec2 position;

// Per-instance attributes (different for each food source)
attribute vec2 offset;      // World position
attribute vec3 color;       // Food color (green for prey, red for predator)
attribute float radius;     // Circle radius (scales with energy)
attribute float alpha;      // Opacity (scales with energy)

// Camera uniform (single combined matrix)
uniform mat3 transform;

// Pass to fragment shader
varying vec3 vColor;
varying float vAlpha;
varying vec2 vLocalPos;     // Position within circle (for outline effect)

void main() {
  // Scale position by radius and translate to world position
  vec2 worldPos = position * radius + offset;
  
  // Apply combined camera transform (world -> NDC)
  vec3 transformed = transform * vec3(worldPos, 1.0);
  gl_Position = vec4(transformed.xy, 0, 1);
  
  // Pass to fragment shader
  vColor = color;
  vAlpha = alpha;
  vLocalPos = position; // Position in circle space (-1 to 1)
}

