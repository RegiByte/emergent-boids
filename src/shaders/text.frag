precision highp float;

uniform sampler2D fontTexture;

varying vec2 vUV;
varying vec3 vColor;
varying float vAlpha;

void main() {
  // Sample the font texture
  vec4 texColor = texture2D(fontTexture, vUV);
  
  // Use texture alpha as mask, apply character color
  // This allows us to color monochrome font atlases
  gl_FragColor = vec4(vColor, texColor.a * vAlpha);
}
