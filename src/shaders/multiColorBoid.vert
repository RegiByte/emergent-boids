precision highp float;

// Per-vertex attributes (shared quad geometry)
attribute vec2 position;  // Quad vertices (0,0) to (1,1)

// Per-instance attributes (different for each boid)
attribute vec2 offset;      // Boid world position
attribute float rotation;   // Boid heading angle
attribute vec3 color;       // Primary body color (from genome)
attribute vec3 borderColor; // Border/outline color
attribute vec3 shadowColor; // Shadow color (perceptually darkened from primary)
attribute float scale;      // Boid size (radius)
attribute vec2 shapeUV;     // UV offset in shape atlas

// Camera uniform (single combined matrix)
uniform mat3 transform;

// Shape atlas info
uniform float cellSize;     // UV size of one cell (e.g., 0.25 for 4x4 grid)

// Pass to fragment shader
varying vec3 vColor;
varying vec3 vBorderColor;
varying vec3 vShadowColor;  // Session 101 Phase 2: Shadow color
varying vec2 vShapeUV;

void main() {
  // Center the quad (position is 0-1, we want -0.5 to 0.5)
  vec2 centeredPos = position - 0.5;
  
  // Rotate quad by boid heading
  float c = cos(rotation);
  float s = sin(rotation);
  mat2 rot = mat2(c, -s, s, c);
  vec2 rotatedPos = rot * centeredPos;
  
  // Scale and translate to world position
  // scale represents radius; multiply by 2.0 to get diameter for quad
  vec2 worldPos = rotatedPos * (scale * 2.0) + offset;
  
  // Apply combined camera transform (world -> NDC)
  vec3 transformed = transform * vec3(worldPos, 1.0);
  gl_Position = vec4(transformed.xy, 0.0, 1.0);
  
  // Calculate UV coordinates for sampling the shape texture
  // position is 0-1 quad, we map it to the correct cell in the atlas
  vShapeUV = shapeUV + position * cellSize;
  
  vColor = color;
  vBorderColor = borderColor;
  // Session 101 Phase 2: Shadow color passed as attribute (computed with chroma-js)
  vShadowColor = shadowColor;
}

