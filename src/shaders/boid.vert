precision mediump float;

// Per-vertex attributes (shared triangle shape)
attribute vec2 position;

// Per-instance attributes (different for each boid)
attribute vec2 offset;
attribute float rotation;
attribute vec3 color;
attribute float scale;

// Camera uniform (single combined matrix)
uniform mat3 transform;

// Pass color to fragment shader
varying vec3 vColor;

void main() {
  // Rotate triangle
  float c = cos(rotation);
  float s = sin(rotation);
  mat2 rot = mat2(c, -s, s, c);
  
  // Scale and translate
  vec2 pos = rot * position * scale + offset;
  
  // Apply combined camera transform (world -> NDC)
  vec3 transformed = transform * vec3(pos, 1.0);
  gl_Position = vec4(transformed.xy, 0, 1);
  
  vColor = color;
}

