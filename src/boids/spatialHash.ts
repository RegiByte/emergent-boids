import { toroidalSubtract } from './vector'
import type { Boid } from './vocabulary/schemas/entities'
import type {
  Area2D,
  Positionable,
  Vector2,
} from './vocabulary/schemas/primitives'

export type ItemWithDistance<TData> = {
  item: TData
  distance: number
}

export type SpatialHash<TData extends Positionable = Boid> = {
  cellSize: number
  cols: number
  rows: number
  grid: Map<string, TData[]>

  insertItem: (item: TData) => void
  insertItems: (items: TData[] | Record<string, TData>) => void
  getNearbyItems: (
    position: Vector2,
    world: Area2D,
    maxNeighbors?: number,
    maxDistance?: number
  ) => ItemWithDistance<TData>[]
}

/**
 * Create a spatial hash grid for efficient neighbor queries
 * Cell size should match perception radius for optimal performance
 */
export function createSpatialHash<TData extends Positionable = Boid>(
  width: number,
  height: number,
  cellSize: number
): SpatialHash<TData> {
  const queryCache = [] as ItemWithDistance<TData>[]

  const api = {
    cellSize,
    cols: Math.ceil(width / cellSize),
    rows: Math.ceil(height / cellSize),
    grid: new Map(),
    insertItem: (item: TData) => {
      const key = getCellKey(item.position.x, item.position.y, cellSize)
      const cell = api.grid.get(key)
      if (!cell) {
        api.grid.set(key, [item])
        return
      }
      cell.push(item)
    },
    insertItems: (items: TData[] | Record<string, TData>) => {
      if (Array.isArray(items)) {
        for (const item of items) {
          api.insertItem(item)
        }
        return
      }
      for (const key in items) {
        const item = items[key]
        api.insertItem(item)
      }
    },
    getNearbyItems: (
      position: Vector2,
      world: Area2D,
      maxNeighbors = 60,
      maxDistance?: number
    ) => {
      const col = Math.floor(position.x / api.cellSize)
      const row = Math.floor(position.y / api.cellSize)
      const cols = api.cols
      const rows = api.rows
      const grid = api.grid

      queryCache.length = 0

      const maxDistSq = maxDistance ? maxDistance * maxDistance : Infinity

      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const checkCol = (((col + i) % cols) + cols) % cols
          const checkRow = (((row + j) % rows) + rows) % rows

          const key = `${checkCol},${checkRow}`
          const cell = grid.get(key)

          if (cell) {
            for (let k = 0; k < cell.length; k++) {
              const item = cell[k]
              const { x: dx, y: dy } = toroidalSubtract(
                item.position,
                position,
                world.width,
                world.height
              )
              const distanceSq = dx * dx + dy * dy

              if (distanceSq <= maxDistSq) {
                queryCache.push({
                  item,
                  distance: Math.sqrt(distanceSq),
                })
              }
            }
          }
        }
      }

      if (queryCache.length <= maxNeighbors) {
        return queryCache
      }

      queryCache.sort((a, b) => a.distance - b.distance)
      queryCache.length = maxNeighbors // Truncate to max

      return queryCache
    },
  }

  return api
}

/**
 * Get the cell key for a position
 */
function getCellKey(x: number, y: number, cellSize: number): string {
  const col = Math.floor(x / cellSize)
  const row = Math.floor(y / cellSize)
  return `${col},${row}`
}

export type BoidWithDistance = {
  boid: Boid
  distance: number
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
