/**
 * Food Source Constants
 * 
 * Configuration for the food source system that drives the ecosystem's energy flow.
 * Prey food spawns periodically, predator food spawns from catches.
 */

export const FOOD_CONSTANTS = {
  // Prey food sources (plant-based, spawns periodically)
  PREY_FOOD_SPAWN_INTERVAL_TICKS: 3, // Spawn every 3 ticks (~3 seconds) - INCREASED from 5
  PREY_FOOD_SPAWN_COUNT: 4, // Spawn 4 sources per interval - INCREASED from 2
  PREY_FOOD_INITIAL_ENERGY: 80, // Energy per prey food source - INCREASED from 50
  PREY_FOOD_CONSUMPTION_RATE: 10, // Energy consumed per tick per boid - INCREASED from 5
  MAX_PREY_FOOD_SOURCES: 8, // Maximum number of prey food sources on map at once

  // Predator food sources (from catches)
  PREDATOR_FOOD_FROM_PREY_MULTIPLIER: 0.8, // 80% of prey's remaining energy
  PREDATOR_FOOD_CONSUMPTION_RATE: 15, // Energy consumed per tick per boid - INCREASED from 8
  MAX_PREDATOR_FOOD_SOURCES: 12, // Maximum number of predator food sources on map at once

  // Detection and interaction radii
  FOOD_DETECTION_RADIUS: 150, // How far boids can sense food
  FOOD_EATING_RADIUS: 30, // How close to orbit while eating
  FOOD_CONSUMPTION_RADIUS: 20, // Must be this close to consume

  // Prey fear of predator food (death sites)
  PREDATOR_FOOD_FEAR_RADIUS: 80, // Prey avoid predator food sources
  PREDATOR_FOOD_FEAR_WEIGHT: 2.5, // Strong repulsion (similar to fear)
} as const;

