precision highp float;

// Per-vertex attributes (shared quad geometry)
attribute vec2 position;  // Quad vertices (0,0) to (1,1)

// Per-instance attributes (different for each body part)
attribute vec2 boidPos;     // Boid world position
attribute float boidRotation; // Boid heading angle (radians)
attribute vec3 boidColor;   // Boid color (from genome)
attribute float boidScale;  // Boid size (collision radius)
attribute vec2 partUV;      // UV offset in body parts atlas
attribute vec2 partOffset;  // Part position relative to boid center (world units)
attribute float partRotation; // Part rotation relative to boid (radians)
attribute float partScale;  // Part radius (world units) - multiplied by 2.0 for diameter


attribute vec3 primaryColor;    // Color for RED marker (layer 1)
attribute vec3 secondaryColor;  // Color for GREEN marker (layer 2)
attribute vec3 tertiaryColor;   // Color for BLUE marker (layer 3)

// Camera uniform
uniform mat3 transform;

// Body parts atlas info
uniform float cellSize;     // UV size of one cell

// Pass to fragment shader
varying vec3 vColor;
varying vec2 vPartUV;
varying vec3 vPrimaryColor;
varying vec3 vSecondaryColor;
varying vec3 vTertiaryColor;

void main() {
  // Center the quad and scale by part size
  
  // This matches the main boid shader's semantics (scale = radius)
  vec2 centeredPos = (position - 0.5) * (partScale * 2.0);
  
  // Rotate part by combined rotation (boid + part local rotation)
  float totalRotation = boidRotation + partRotation;
  float c = cos(totalRotation);
  float s = sin(totalRotation);
  mat2 rot = mat2(c, -s, s, c);
  vec2 rotatedPart = rot * centeredPos;
  
  // Rotate the offset by boid heading (so offset is relative to boid's front)
  float cBoid = cos(boidRotation);
  float sBoid = sin(boidRotation);
  mat2 boidRot = mat2(cBoid, -sBoid, sBoid, cBoid);
  vec2 rotatedOffset = boidRot * partOffset;
  
  // Add rotated offset to rotated part
  vec2 finalPos = rotatedPart + rotatedOffset;
  
  // Translate to world position
  vec2 worldPos = finalPos + boidPos;
  
  // Apply camera transform
  vec3 transformed = transform * vec3(worldPos, 1.0);
  gl_Position = vec4(transformed.xy, 0.0, 1.0);
  
  // Calculate UV coordinates
  vPartUV = partUV + position * cellSize;
  
  vColor = boidColor;
  vPrimaryColor = primaryColor;
  vSecondaryColor = secondaryColor;
  vTertiaryColor = tertiaryColor;
}

