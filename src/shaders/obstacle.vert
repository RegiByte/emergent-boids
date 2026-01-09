precision highp float;

// Shared quad geometry (-1,-1) to (1,1)
attribute vec2 position;

// Per-instance attributes
attribute vec2 obstaclePosition;  // Obstacle world position
attribute float radius;            // Obstacle radius

// Uniforms
uniform mat3 transform;            // Camera transform

// Varying (passed to fragment shader)
varying vec2 vUV;

void main() {
  // Scale quad by radius to match obstacle size
  vec2 offset = position * radius;
  vec2 worldPos = obstaclePosition + offset;
  
  // Transform to clip space
  vec3 clipPos = transform * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
  
  // UV coordinates (0,0) to (1,1) for texture sampling
  vUV = (position + 1.0) * 0.5;
}

