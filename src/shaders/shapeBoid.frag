precision highp float;

uniform sampler2D shapeTexture;

varying vec3 vColor;
varying vec2 vShapeUV;

void main() {
  // Sample the shape texture
  vec4 shapeColor = texture2D(shapeTexture, vShapeUV);
  
  // Discard fully transparent pixels (prevents blocking other boids)
  if (shapeColor.a < 0.01) {
    discard;
  }
  
  // Multiply shape alpha by boid color
  // Shape is white, so we colorize it with the boid's color
  vec3 finalColor = shapeColor.rgb * vColor;
  
  // Use shape's alpha for transparency (shapes have anti-aliased edges)
  gl_FragColor = vec4(finalColor, shapeColor.a);
}

