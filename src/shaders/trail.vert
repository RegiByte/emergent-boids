// Trail Vertex Shader
// Renders line segments for boid motion trails
// Uses instanced rendering: one draw call per batch (color/alpha/width)

precision mediump float;

// Shared line geometry (2 vertices per segment)
attribute float position; // 0.0 or 1.0 (start or end of line)

// Per-instance attributes (one per trail segment)
attribute vec2 startPos;  // World position of line start
attribute vec2 endPos;    // World position of line end
attribute vec3 color;     // RGB color (0-1)
attribute float alpha;    // Opacity (0-1)

// Camera transform (world space → NDC)
uniform mat3 transform;

// Pass to fragment shader
varying vec4 vColor;

void main() {
  // Interpolate between start and end position based on vertex position
  vec2 worldPos = mix(startPos, endPos, position);
  
  // Transform to NDC (Normalized Device Coordinates)
  vec3 ndc = transform * vec3(worldPos, 1.0);
  gl_Position = vec4(ndc.xy, 0.0, 1.0);
  
  // Pass color with alpha to fragment shader
  vColor = vec4(color, alpha);
}

