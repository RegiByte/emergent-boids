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
 *
 * @param hash - The spatial hash grid
 * @param position - Position to query from
 * @param maxNeighbors - Maximum number of neighbors to return
 * @param maxDistance - Optional maximum distance to consider (for early filtering)
 */
export function getNearbyBoids(
  hash: SpatialHash,
  position: Vector2,
  maxNeighbors: number = 60,
  maxDistance?: number
): Boid[] {
  // PERFORMANCE OPTIMIZATION:
  // Instead of collecting ALL neighbors then sorting, we use a more efficient approach:
  // 1. Collect boids with their distances as we find them
  // 2. Filter by max distance if provided (early rejection)
  // 3. Only sort if we exceed maxNeighbors
  // 4. Use pre-calculated distances to avoid redundant calculations
  
  const col = Math.floor(position.x / hash.cellSize);
  const row = Math.floor(position.y / hash.cellSize);

  // Collect boids with distances in one pass
  const boidsWithDist: Array<{ boid: Boid; distSq: number }> = [];
  const maxDistSq = maxDistance ? maxDistance * maxDistance : Infinity;
  
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
        // Calculate distances as we collect boids
        for (let k = 0; k < cell.length; k++) {
          const boid = cell[k];
          const dx = boid.position.x - position.x;
          const dy = boid.position.y - position.y;
          const distSq = dx * dx + dy * dy;
          
          // Skip boids beyond max distance (if specified)
          if (distSq <= maxDistSq) {
            boidsWithDist.push({ boid, distSq });
          }
        }
      }
    }
  }

  // If we have few enough neighbors, return them all (no sorting needed)
  if (boidsWithDist.length <= maxNeighbors) {
    const result = new Array(boidsWithDist.length);
    for (let i = 0; i < boidsWithDist.length; i++) {
      result[i] = boidsWithDist[i].boid;
    }
    return result;
  }

  // Too many neighbors - sort by distance and return closest
  boidsWithDist.sort((a, b) => a.distSq - b.distSq);

  const result = new Array(maxNeighbors);
  for (let i = 0; i < maxNeighbors; i++) {
    result[i] = boidsWithDist[i].boid;
  }
  return result;
}
