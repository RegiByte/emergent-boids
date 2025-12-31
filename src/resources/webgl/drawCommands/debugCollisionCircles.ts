/**
 * Debug Collision Circles Draw Command
 *
 * Renders collision radius circles for debugging size calculations
 * Session 96: Visual verification that rendered size matches physics collision
 */

import type REGL from "regl";

/**
 * Create REGL draw command for debug collision circles
 * Renders red dashed circles showing physics collision boundaries
 */
export function createDebugCollisionCirclesDrawCommand(
  regl: REGL.Regl
): REGL.DrawCommand {
  return regl({
    vert: `
      precision mediump float;
      
      attribute vec2 position;    // Boid center position
      attribute float radius;     // Collision radius
      attribute float angle;      // Angle for circle point (0 to 2π)
      
      uniform mat3 transform;     // Camera transform
      
      void main() {
        // Calculate point on circle
        vec2 circlePoint = position + vec2(
          cos(angle) * radius,
          sin(angle) * radius
        );
        
        // Apply camera transform
        vec3 transformed = transform * vec3(circlePoint, 1.0);
        gl_Position = vec4(transformed.xy, 0.0, 1.0);
      }
    `,

    frag: `
      precision mediump float;
      
      void main() {
        // Red semi-transparent for debug visualization
        gl_FragColor = vec4(1.0, 0.0, 0.0, 0.5);
      }
    `,

    attributes: {
      position: regl.prop<{ positions: Float32Array }, "positions">(
        "positions"
      ),
      radius: regl.prop<{ radii: Float32Array }, "radii">("radii"),
      angle: regl.prop<{ angles: Float32Array }, "angles">("angles"),
    },

    uniforms: {
      transform: regl.prop<{ transform: number[] }, "transform">("transform"),
    },

    count: regl.prop<{ count: number }, "count">("count"),
    primitive: "line strip",
    // Note: WebGL only supports lineWidth = 1 on most platforms
  });
}

/**
 * Prepare collision circle data for all boids
 * Creates circle vertices (line strip) for each boid
 */
export function prepareDebugCollisionCirclesData(
  boids: Array<{
    position: { x: number; y: number };
    phenotype: { collisionRadius: number };
  }>
): {
  positions: Float32Array;
  radii: Float32Array;
  angles: Float32Array;
  count: number;
} {
  const segments = 32; // Points per circle
  const totalPoints = boids.length * (segments + 1); // +1 to close circle

  const positions = new Float32Array(totalPoints * 2);
  const radii = new Float32Array(totalPoints);
  const angles = new Float32Array(totalPoints);

  let idx = 0;
  for (const boid of boids) {
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;

      positions[idx * 2] = boid.position.x;
      positions[idx * 2 + 1] = boid.position.y;
      radii[idx] = boid.phenotype.collisionRadius;
      angles[idx] = angle;

      idx++;
    }
  }

  return {
    positions,
    radii,
    angles,
    count: totalPoints,
  };
}
