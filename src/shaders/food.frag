precision mediump float;

varying vec3 vColor;
varying float vAlpha;
varying vec2 vLocalPos;

void main() {
  // Calculate distance from center (in circle space)
  float dist = length(vLocalPos);
  
  // Outline only: visible only near edge (0.85 to 1.0)
  // This creates a ring/outline effect
  float innerEdge = 0.85;
  float outerEdge = 1.0;
  
  // Discard pixels outside circle
  if (dist > outerEdge + 0.05) {
    discard;
  }
  
  // Discard pixels inside the circle (keep only the outline)
  if (dist < innerEdge - 0.05) {
    discard;
  }
  
  // Smooth transition for anti-aliasing on both edges
  float outlineAlpha = smoothstep(innerEdge - 0.05, innerEdge, dist) * 
                       (1.0 - smoothstep(outerEdge, outerEdge + 0.05, dist));
  
  // Apply outline alpha and energy-based alpha
  float finalAlpha = outlineAlpha * vAlpha;
  
  // Discard fully transparent pixels to avoid z-fighting
  if (finalAlpha < 0.01) {
    discard;
  }
  
  gl_FragColor = vec4(vColor, finalAlpha);
}

