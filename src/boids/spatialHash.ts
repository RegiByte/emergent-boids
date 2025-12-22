import type { Boid } from "./vocabulary/schemas/prelude.ts";
import type { Vector2 } from "./vocabulary/schemas/prelude.ts";

export type SpatialHash = {
  cellSize: number;
  cols: number;
  rows: number;
  grid: Map<string, Boid[]>;
};

/**
 * Create a spatial hash grid for efficient neighbor queries
 * Cell size should match perception radius for optimal performance
 */
export function createSpatialHash(
  width: number,
  height: number,
  cellSize: number
): SpatialHash {
  return {
    cellSize,
    cols: Math.ceil(width / cellSize),
    rows: Math.ceil(height / cellSize),
    grid: new Map(),
  };
}

/**
 * Get the cell key for a position
 */
function getCellKey(x: number, y: number, cellSize: number): string {
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  return `${col},${row}`;
}

/**
 * Insert all boids into the spatial hash
 * Call this once per frame before querying neighbors
 */
export function insertBoids(hash: SpatialHash, boids: Boid[]): void {
  // Clear previous frame's data
  hash.grid.clear();

  // Insert each boid into its cell
  for (const boid of boids) {
    const key = getCellKey(boid.position.x, boid.position.y, hash.cellSize);
    const cell = hash.grid.get(key);
    if (cell) {
      cell.push(boid);
    } else {
      hash.grid.set(key, [boid]);
    }
  }
}

/**
 * Get all boids in the same cell and adjacent cells (9 cells total)
 * Handles toroidal wrapping by checking wrapped cell coordinates
 *
 * Performance optimization: Caps neighbors at maxNeighbors to prevent
 * concentration bottleneck when many boids cluster in one area
 */
export function getNearbyBoids(
  hash: SpatialHash,
  position: Vector2,
  maxNeighbors: number = 60
): Boid[] {
  const nearby: Boid[] = [];
  const col = Math.floor(position.x / hash.cellSize);
  const row = Math.floor(position.y / hash.cellSize);

  // Check 3x3 grid of cells (including current cell)
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      // Wrap cell coordinates for toroidal space
      let checkCol = col + i;
      let checkRow = row + j;

      // Handle wrapping (modulo with proper handling of negatives)
      checkCol = ((checkCol % hash.cols) + hash.cols) % hash.cols;
      checkRow = ((checkRow % hash.rows) + hash.rows) % hash.rows;

      const key = `${checkCol},${checkRow}`;
      const cell = hash.grid.get(key);
      if (cell) {
        nearby.push(...cell);
      }
    }
  }

  // If too many neighbors (concentration scenario), limit to closest ones
  if (nearby.length > maxNeighbors) {
    // Sort by squared distance (avoid sqrt for performance)
    nearby.sort((a, b) => {
      const dxA = a.position.x - position.x;
      const dyA = a.position.y - position.y;
      const distSqA = dxA * dxA + dyA * dyA;

      const dxB = b.position.x - position.x;
      const dyB = b.position.y - position.y;
      const distSqB = dxB * dxB + dyB * dyB;

      return distSqA - distSqB;
    });

    return nearby.slice(0, maxNeighbors);
  }

  return nearby;
}
