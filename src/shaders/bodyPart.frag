precision highp float;

uniform sampler2D bodyPartsTexture;

varying vec3 vColor;
varying vec2 vPartUV;

void main() {
  // Sample the body part texture
  vec4 partColor = texture2D(bodyPartsTexture, vPartUV);
  
  // Discard fully transparent pixels (prevents blocking boids behind)
  if (partColor.a < 0.01) {
    discard;
  }
  
  // Mix white texture with boid color
  // Use texture brightness to blend between white and boid color
  // This makes eyes slightly tinted but still visible
  float brightness = (partColor.r + partColor.g + partColor.b) / 3.0;
  vec3 tintedColor = mix(vColor * 0.5, vec3(1.0), brightness * 0.7);
  
  gl_FragColor = vec4(tintedColor, partColor.a);
}
