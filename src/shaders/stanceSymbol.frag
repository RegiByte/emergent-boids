precision highp float;

uniform sampler2D emojiTexture;

varying vec2 vUV;
varying float vAlpha;

void main() {
  // Sample the texture
  vec4 texColor = texture2D(emojiTexture, vUV);
  
  // Apply fade-out alpha
  gl_FragColor = vec4(texColor.rgb, texColor.a * vAlpha);
}


