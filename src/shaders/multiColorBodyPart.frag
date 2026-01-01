precision highp float;

uniform sampler2D bodyPartsTexture;

varying vec3 vColor;
varying vec2 vPartUV;
varying vec3 vPrimaryColor;
varying vec3 vSecondaryColor;
varying vec3 vTertiaryColor;

void main() {
  // Sample the body part texture
  vec4 partColor = texture2D(bodyPartsTexture, vPartUV);
  
  // Discard fully transparent pixels (prevents blocking boids behind)
  if (partColor.a < 0.01) {
    discard;
  }
  
  vec3 finalColor;
  
  // Session 102: Color dominance detection for body parts (same as shapes)
  // A channel is "dominant" if it's 2x larger than the other two channels
  bool rDominant = partColor.r > partColor.g * 2.0 && partColor.r > partColor.b * 2.0;
  bool gDominant = partColor.g > partColor.r * 2.0 && partColor.g > partColor.b * 2.0;
  bool bDominant = partColor.b > partColor.r * 2.0 && partColor.b > partColor.g * 2.0;
  
  // Detect RED marker → Primary color (layer 1)
  if (rDominant && partColor.r > 0.5) {
    finalColor = vPrimaryColor;
  }
  // Detect GREEN marker → Secondary color (layer 2)
  else if (gDominant && partColor.g > 0.5) {
    finalColor = vSecondaryColor;
  }
  // Detect BLUE marker → Tertiary color (layer 3)
  else if (bDominant && partColor.b > 0.5) {
    finalColor = vTertiaryColor;
  }
  // WHITE or gradient → Keep original (fallback for non-multi-color parts)
  else {
    // Mix white texture with boid color (original behavior)
    float brightness = (partColor.r + partColor.g + partColor.b) / 3.0;
    finalColor = mix(vColor * 0.5, vec3(1.0), brightness * 0.7);
  }
  
  gl_FragColor = vec4(finalColor, partColor.a);
}

