// Selection Circle Fragment Shader
// Renders colored circles with transparency

precision mediump float;

varying vec3 vColor;
varying float vAlpha;

void main() {
  gl_FragColor = vec4(vColor, vAlpha);
}

