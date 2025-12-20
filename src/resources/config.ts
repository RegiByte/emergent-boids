import { defineResource } from "braided";
import type { BoidConfig } from "../boids/types";

export const config = defineResource({
  start: (): BoidConfig => {
    return {
      count: 500,
      perceptionRadius: 50,
      obstacleAvoidanceWeight: 2.0,
      canvasWidth: 800,
      canvasHeight: 600,
      types: {
        explorer: {
          id: "explorer",
          name: "Explorer",
          color: "#00ff88", // Green (original)
          separationWeight: 1.5,
          alignmentWeight: 1.0,
          cohesionWeight: 1.0,
          maxSpeed: 4,
          maxForce: 0.1,
        },
        social: {
          id: "social",
          name: "Social",
          color: "#ff4488", // Pink
          separationWeight: 0.5,
          alignmentWeight: 1.2,
          cohesionWeight: 2.5,
          maxSpeed: 3,
          maxForce: 0.08,
        },
        independent: {
          id: "independent",
          name: "Independent",
          color: "#ffaa00", // Orange
          separationWeight: 2.5,
          alignmentWeight: 0.5,
          cohesionWeight: 0.5,
          maxSpeed: 5,
          maxForce: 0.15,
        },
        cautious: {
          id: "cautious",
          name: "Cautious",
          color: "#00aaff", // Blue
          separationWeight: 2.0,
          alignmentWeight: 1.5,
          cohesionWeight: 1.5,
          maxSpeed: 2.5,
          maxForce: 0.12,
        },
      },
    };
  },
  halt: () => {
    // No cleanup needed for config
  },
});
