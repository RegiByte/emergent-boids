precision highp float;

uniform sampler2D obstacleTexture;

varying vec2 vUV;

void main() {
  // Sample the pre-rendered obstacle texture (hazard stripes)
  vec4 texColor = texture2D(obstacleTexture, vUV);
  
  // Distance from center (for circular clipping)
  vec2 center = vec2(0.5, 0.5);
  float dist = distance(vUV, center);
  
  // Discard pixels outside circle radius
  if (dist > 0.5) {
    discard;
  }
  
  gl_FragColor = texColor;
}

