// Health Bar Fragment Shader
// Renders background, fill, and border for health bars

precision mediump float;

varying vec3 vColor;
uniform float layerType; // 0 = background, 1 = fill, 2 = border

void main() {
  // Use threshold comparison for floating point values
  if (layerType < 0.5) {
    // Background: darker gray (distinguishes from energy bars)
    gl_FragColor = vec4(0.13, 0.13, 0.13, 1.0);
  } else if (layerType < 1.5) {
    // Fill: use bar color (green/yellow/red based on health %)
    gl_FragColor = vec4(vColor, 1.0);
  } else {
    // Border: medium gray
    gl_FragColor = vec4(0.4, 0.4, 0.4, 1.0);
  }
}

