// Selection Circle Vertex Shader
// Renders picker circle and followed boid highlight
// Uses instanced rendering for multiple selection circles

precision mediump float;

// Shared circle geometry (unit circle)
attribute vec2 position; // Circle vertices (-1 to 1)

// Per-instance attributes
attribute vec2 center;   // Circle center (world position)
attribute float radius;  // Circle radius (world units)
attribute vec3 color;    // Circle color
attribute float alpha;   // Circle opacity

// Camera transform (world space → NDC)
uniform mat3 transform;

// Pass to fragment shader
varying vec3 vColor;
varying float vAlpha;

void main() {
  // Scale position by radius and offset by center
  vec2 worldPos = center + position * radius;
  
  // Transform to NDC
  vec3 ndc = transform * vec3(worldPos, 1.0);
  gl_Position = vec4(ndc.xy, 0.0, 1.0);
  
  // Pass color and alpha to fragment shader
  vColor = color;
  vAlpha = alpha;
}

