precision highp float;

uniform sampler2D shapeTexture;

varying vec3 vColor;
varying vec3 vBorderColor;
varying vec3 vShadowColor;  // Session 101 Phase 2: Shadow color
varying vec2 vShapeUV;

void main() {
  // Sample the shape texture
  vec4 shapeColor = texture2D(shapeTexture, vShapeUV);
  
  // Discard fully transparent pixels (prevents blocking other boids)
  if (shapeColor.a < 0.01) {
    discard;
  }
  
  vec3 finalColor;
  
  
  // A channel is "dominant" if it's 2x larger than the other two channels
  bool rDominant = shapeColor.r > shapeColor.g * 2.0 && shapeColor.r > shapeColor.b * 2.0;
  bool gDominant = shapeColor.g > shapeColor.r * 2.0 && shapeColor.g > shapeColor.b * 2.0;
  bool bDominant = shapeColor.b > shapeColor.r * 2.0 && shapeColor.b > shapeColor.g * 2.0;
  
  // Detect RED marker → Primary body color
  if (rDominant && shapeColor.r > 0.5) {
    finalColor = vColor;
  }
  // Detect GREEN marker → Border color
  else if (gDominant && shapeColor.g > 0.5) {
    finalColor = vBorderColor;
  }
  // Detect BLUE marker → Shadow color
  else if (bDominant && shapeColor.b > 0.5) {
    finalColor = vShadowColor;
  }
  // WHITE or gradient → Multiply by primary (handles anti-aliasing)
  else {
    finalColor = shapeColor.rgb * vColor;
  }
  
  // Use shape's alpha for transparency (shapes have anti-aliased edges)
  gl_FragColor = vec4(finalColor, shapeColor.a);
}

