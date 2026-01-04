import { toroidalSubtract } from "./vector";
import type { Boid, BoidsById } from "./vocabulary/schemas/entities";
import type {
  Area2D,
  Positionable,
  Vector2,
} from "./vocabulary/schemas/primitives";

export type ItemWithDistance<TData> = {
  item: TData;
  distance: number;
};

export type SpatialHash<TData extends Positionable = Boid> = {
  cellSize: number;
  cols: number;
  rows: number;
  grid: Map<string, TData[]>;

  insertItem: (item: TData) => void;
  insertItems: (items: TData[] | Record<string, TData>) => void;
  getNearbyItems: (
    position: Vector2,
    world: Area2D,
    maxNeighbors?: number,
    maxDistance?: number,
  ) => ItemWithDistance<TData>[];
};

/**
 * Create a spatial hash grid for efficient neighbor queries
 * Cell size should match perception radius for optimal performance
 */
export function createSpatialHash<TData extends Positionable = Boid>(
  width: number,
  height: number,
  cellSize: number,
): SpatialHash<TData> {
  // Query result cache (per instance, not module-level)
  const queryCache = [] as ItemWithDistance<TData>[];

  const api = {
    cellSize,
    cols: Math.ceil(width / cellSize),
    rows: Math.ceil(height / cellSize),
    grid: new Map(),
    insertItem: (item: TData) => {
      const key = getCellKey(item.position.x, item.position.y, cellSize);
      const cell = api.grid.get(key);
      if (!cell) {
        api.grid.set(key, [item]);
        return;
      }
      cell.push(item);
    },
    insertItems: (items: TData[] | Record<string, TData>) => {
      if (Array.isArray(items)) {
        for (const item of items) {
          api.insertItem(item);
        }
        return;
      }
      for (const key in items) {
        const item = items[key];
        api.insertItem(item);
      }
    },
    getNearbyItems: (
      position: Vector2,
      world: Area2D,
      maxNeighbors = 60,
      maxDistance?: number,
    ) => {
      const col = Math.floor(position.x / api.cellSize);
      const row = Math.floor(position.y / api.cellSize);
      const cols = api.cols;
      const rows = api.rows;
      const grid = api.grid;

      queryCache.length = 0;

      const maxDistSq = maxDistance ? maxDistance * maxDistance : Infinity;

      // Check 3x3 grid of cells (including current cell)
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          // Wrap cell coordinates for toroidal space
          const checkCol = (((col + i) % cols) + cols) % cols;
          const checkRow = (((row + j) % rows) + rows) % rows;

          const key = `${checkCol},${checkRow}`;
          const cell = grid.get(key);

          if (cell) {
            for (let k = 0; k < cell.length; k++) {
              const item = cell[k];
              const { x: dx, y: dy } = toroidalSubtract(
                item.position,
                position,
                world.width,
                world.height,
              );
              const distanceSq = dx * dx + dy * dy;

              if (distanceSq <= maxDistSq) {
                queryCache.push({ item, distance: Math.sqrt(distanceSq) });
              }
            }
          }
        }
      }

      // If we have few enough neighbors, return them all
      if (queryCache.length <= maxNeighbors) {
        return queryCache;
      }

      // Too many neighbors - sort by distance and take closest
      queryCache.sort((a, b) => a.distance - b.distance);
      queryCache.length = maxNeighbors; // Truncate to max

      return queryCache;
    },
  };

  return api;
}

/**
 * Get the cell key for a position
 */
function getCellKey(x: number, y: number, cellSize: number): string {
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  return `${col},${row}`;
}

// /**
//  * Insert all boids into the spatial hash
//  * Call this once per frame before querying neighbors
//  *
//  * PERFORMANCE OPTIMIZATION (Session 71):
//  * Reuses cell arrays instead of clearing the map, reducing GC pressure.
//  * This avoids allocating ~100-200 arrays per frame at high boid counts.
//  */
// export function insertGridItems<TData = Boid>(
//   hash: SpatialHash<TData>,
//   items: BoidsById
// ): void {
//   // OPTIMIZATION: Clear arrays without deallocating them
//   // This reuses existing cell arrays, reducing garbage collection pressure
//   for (const cell of hash.grid.values()) {
//     cell.length = 0; // Clear array in-place (keeps capacity)
//   }

//   // Insert each boid into its cell (reuse existing arrays when possible)
//   for (const boidId in items) {
//     const boid = items[boidId];
//     const key = getCellKey(boid.position.x, boid.position.y, hash.cellSize);
//     let cell = hash.grid.get(key);
//     if (!cell) {
//       // Only allocate new array if cell doesn't exist yet
//       cell = [];
//       hash.grid.set(key, cell);
//     }
//     cell.push(boid);
//   }
// }

// PERFORMANCE OPTIMIZATION (Session 71): Reusable arrays for neighbor queries
// Reduces allocations from ~1800 arrays/frame to 0 arrays/frame
const neighborQueryCache: Array<BoidWithDistance> = [];

export type BoidWithDistance = {
  boid: Boid;
  distance: number;
};

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
// export function getNearbyBoids(
//   hash: SpatialHash,
//   position: Vector2,
//   maxNeighbors: number = 60,
//   maxDistance?: number
// ): BoidWithDistance[] {
//   // PERFORMANCE OPTIMIZATION:
//   // Instead of collecting ALL neighbors then sorting, we use a more efficient approach:
//   // 1. Collect boids with their distances as we find them
//   // 2. Filter by max distance if provided (early rejection)
//   // 3. Only sort if we exceed maxNeighbors
//   // 4. Use pre-calculated distances to avoid redundant calculations
//   // 5. Reuse array from previous query (Session 71 optimization)

//   const col = Math.floor(position.x / hash.cellSize);
//   const row = Math.floor(position.y / hash.cellSize);

//   // OPTIMIZATION: Reuse array from previous query
//   const boidsWithDist = neighborQueryCache;
//   boidsWithDist.length = 0; // Clear without deallocating
//   const maxDistSq = maxDistance ? maxDistance * maxDistance : Infinity;

//   // Check 3x3 grid of cells (including current cell)
//   for (let i = -1; i <= 1; i++) {
//     for (let j = -1; j <= 1; j++) {
//       // Wrap cell coordinates for toroidal space
//       let checkCol = col + i;
//       let checkRow = row + j;

//       // Handle wrapping (modulo with proper handling of negatives)
//       checkCol = ((checkCol % hash.cols) + hash.cols) % hash.cols;
//       checkRow = ((checkRow % hash.rows) + hash.rows) % hash.rows;

//       const key = `${checkCol},${checkRow}`;
//       const cell = hash.grid.get(key);

//       if (cell) {
//         // Calculate distances as we collect boids
//         for (let k = 0; k < cell.length; k++) {
//           const boid = cell[k];
//           const dx = boid.position.x - position.x;
//           const dy = boid.position.y - position.y;
//           const distance = dx * dx + dy * dy;

//           // Skip boids beyond max distance (if specified)
//           if (distance <= maxDistSq) {
//             boidsWithDist.push({ boid, distance: distance });
//           }
//         }
//       }
//     }
//   }

//   // If we have few enough neighbors, return them all (no sorting needed)
//   if (boidsWithDist.length <= maxNeighbors) {
//     const result = new Array(boidsWithDist.length);
//     for (let i = 0; i < boidsWithDist.length; i++) {
//       result[i] = boidsWithDist[i].boid;
//     }
//     return result;
//   }

//   // Too many neighbors - sort by distance and return closest
//   boidsWithDist.sort((a, b) => a.distance - b.distance);

//   return boidsWithDist;
// }
