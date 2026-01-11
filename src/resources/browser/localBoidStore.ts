import { findBoidWhere, iterateBoids } from '@/boids/iterators'
import {
  Boid,
  BoidsById,
  PhysicalBoid,
} from '@/boids/vocabulary/schemas/entities'
import { BoidStance, Vector2 } from '@/boids/vocabulary/schemas/primitives'
import {
  getActivePositions,
  getActiveVelocities,
  getInactivePositions,
  getInactiveVelocities,
  getInactiveEnergy,
  getInactiveHealth,
  getInactiveStanceFlags,
  getInactiveStanceEnteredAtFrame,
  SharedBoidViews,
  StatsIndex,
  packStanceFlags,
  getActiveEnergy,
  getActiveHealth,
  getActiveStanceFlags,
  getActiveStanceEnteredAtFrame,
} from '@/lib/sharedMemory'
import { defineResource, StartedResource } from 'braided'
import { stanceKeywords } from '@/boids/vocabulary/keywords'

/**
 * Gets the physical properties of a boid from the shared memory.
 */
export function getBoidPhysics(
  index: number,
  views: SharedBoidViews
): PhysicalBoid {
  const positions = getActivePositions(views)
  const velocities = getActiveVelocities(views)

  return {
    position: {
      x: positions[index * 2 + 0],
      y: positions[index * 2 + 1],
    } as Vector2,
    velocity: {
      x: velocities[index * 2 + 0],
      y: velocities[index * 2 + 1],
    } as Vector2,
    acceleration: {
      x: 0,
      y: 0,
    },
  }
}

export function getBoidsPhysicsIndexed(
  indexes: number[],
  views: SharedBoidViews
): PhysicalBoid[] {
  const positions = getActivePositions(views)
  const velocities = getActiveVelocities(views)

  return indexes.map((index) => ({
    position: {
      x: positions[index * 2 + 0],
      y: positions[index * 2 + 1],
    } as Vector2,
    velocity: {
      x: velocities[index * 2 + 0],
      y: velocities[index * 2 + 1],
    } as Vector2,
    acceleration: {
      x: 0,
      y: 0,
    },
  }))
}

/**
 * Merge logical + physical state to create complete Boid
 */
export function mergeBoidWithPhysics(boid: Boid, views: SharedBoidViews): Boid {
  const index = boid.index

  return {
    ...boid,
    ...getBoidPhysics(index, views),
  } as Boid
}

export const createLocalBoidStore = () => {
  const boids = {} as BoidsById
  let count = 0

  let maxIndex = 0
  const freeIndices: number[] = []

  return {
    getBoidById: (id: string) => boids[id],
    getBoidByIndex: (index: number) =>
      findBoidWhere(boids, (boid) => boid.index === index),
    addBoid: (boid: Boid) => {
      if (boids[boid.id]) {
        console.warn(`[DUPLICATE] Boid ${boid.id} already exists, skipping`)
        return
      }
      boids[boid.id] = boid
      count++

      if (boid.index >= maxIndex) {
        maxIndex = boid.index + 1
      }
    },
    removeBoid: (id: string) => {
      if (!boids[id]) {
        return false
      }

      const boid = boids[id]

      freeIndices.push(boid.index)

      delete boids[id]
      count--

      return true
    },
    updateBoid: (id: string, updater: (boid: Boid) => void) => {
      if (!boids[id]) {
        return
      }
      updater(boids[id])
    },
    updateBoidPosition: (id: string, position: Vector2) => {
      if (!boids[id]) {
        return
      }
      boids[id] = { ...boids[id], position }
    },
    updateBoidVelocity: (id: string, velocity: Vector2) => {
      if (!boids[id]) {
        return
      }
      boids[id] = { ...boids[id], velocity }
    },
    updateBoidAcceleration: (id: string, acceleration: Vector2) => {
      if (!boids[id]) {
        return
      }
      boids[id] = { ...boids[id], acceleration }
    },
    boids: boids as Readonly<BoidsById>,
    count: () => count,

    nextIndex: () => {
      if (freeIndices.length > 0) {
        return freeIndices.pop()!
      }

      return maxIndex++
    },

    getMemoryStats: () => ({
      activeCount: count,
      maxIndex: maxIndex,
      freeCount: freeIndices.length,
      utilization: maxIndex > 0 ? count / maxIndex : 1.0,
    }),

    clear: () => {
      for (const id in boids) {
        delete boids[id]
      }
      count = 0

      maxIndex = 0
      freeIndices.length = 0
    },
  }
}

export type LocalBoidStore = ReturnType<typeof createLocalBoidStore>

/**
 * Local Boid Store Resource
 * This is the single source of truth for boids in the main thread.
 * No other place should be mutating boids directly.
 */
export const localBoidStore = defineResource({
  dependencies: [],
  start: () => {
    const store = createLocalBoidStore()
    const api = {
      store,
      cleanup: () => {
        store.clear()
      },
    }

    return api
  },
  halt: (store) => {
    store.cleanup()
  },
})

export type LocalBoidStoreResource = StartedResource<typeof localBoidStore>

/**
 * Map stance strings to numeric values for packing
 *
 */
const stanceToNumber: Record<string, number> = {
  [stanceKeywords.flocking]: 0,
  [stanceKeywords.fleeing]: 1,
  [stanceKeywords.hunting]: 2,
  [stanceKeywords.eating]: 3,
  [stanceKeywords.mating]: 4,
  [stanceKeywords.seeking_mate]: 5,
  [stanceKeywords.idle]: 6,
}

/**
 * Map numeric stance values back to strings for unpacking
 *
 */
const numberToStance: Record<number, string> = {
  0: stanceKeywords.flocking,
  1: stanceKeywords.fleeing,
  2: stanceKeywords.hunting,
  3: stanceKeywords.eating,
  4: stanceKeywords.mating,
  5: stanceKeywords.seeking_mate,
  6: stanceKeywords.idle,
}

/**
 * Writes the updated boids physical properties to the shared memory.
 *
 *
 *
 */
export function syncBoidsToSharedMemory(
  bufferViews: SharedBoidViews,
  boids: BoidsById
) {
  const writePositions = getInactivePositions(bufferViews)
  const writeVelocities = getInactiveVelocities(bufferViews)
  const writeEnergy = getInactiveEnergy(bufferViews)
  const writeHealth = getInactiveHealth(bufferViews)
  const writeStanceFlags = getInactiveStanceFlags(bufferViews)
  const writeStanceEnteredAtFrame = getInactiveStanceEnteredAtFrame(bufferViews)

  for (const boid of iterateBoids(boids)) {
    const index = boid.index

    writePositions[index * 2 + 0] = boid.position.x
    writePositions[index * 2 + 1] = boid.position.y
    writeVelocities[index * 2 + 0] = boid.velocity.x
    writeVelocities[index * 2 + 1] = boid.velocity.y

    writeEnergy[index] = boid.energy
    writeHealth[index] = boid.health

    const stanceNum = stanceToNumber[boid.stance] ?? 0
    writeStanceFlags[index] = packStanceFlags(stanceNum, boid.seekingMate)

    writeStanceEnteredAtFrame[index] = boid.stanceEnteredAtFrame
  }
}

/**
 * Reads the updated boids physical properties FROM shared memory and updates local store.
 *
 *
 *
 * This is the inverse of syncBoidsToSharedMemory - reads from worker, writes to browser.
 *
 * @param bufferViews - SharedArrayBuffer views (reads from active buffer)
 * @param boids - Local boid store to update (mutates in place)
 */
export function syncBoidsFromSharedMemory(
  bufferViews: SharedBoidViews,
  boids: BoidsById
) {
  const readPositions = getActivePositions(bufferViews)
  const readVelocities = getActiveVelocities(bufferViews)
  const readEnergy = getActiveEnergy(bufferViews)
  const readHealth = getActiveHealth(bufferViews)
  const readStanceFlags = getActiveStanceFlags(bufferViews)
  const readStanceEnteredAtFrame = getActiveStanceEnteredAtFrame(bufferViews)

  for (const boid of iterateBoids(boids)) {
    const index = boid.index

    boid.position.x = readPositions[index * 2 + 0]
    boid.position.y = readPositions[index * 2 + 1]
    boid.velocity.x = readVelocities[index * 2 + 0]
    boid.velocity.y = readVelocities[index * 2 + 1]

    boid.energy = readEnergy[index]
    boid.health = readHealth[index]

    const packedFlags = readStanceFlags[index]
    const stanceNum = packedFlags & 0x7f // Lower 7 bits
    const seekingMate = (packedFlags & 0x80) !== 0 // High bit

    boid.stance = (numberToStance[stanceNum] as BoidStance) ?? boid.stance
    boid.seekingMate = seekingMate

    boid.stanceEnteredAtFrame = readStanceEnteredAtFrame[index]
  }
}

export function initializeBoidsStats(
  bufferViews: SharedBoidViews,
  {
    aliveCount,
    frameCount,
    simulationTimeMs,
  }: { aliveCount: number; frameCount: number; simulationTimeMs: number }
) {
  Atomics.store(bufferViews.stats, StatsIndex.ALIVE_COUNT, aliveCount)
  Atomics.store(bufferViews.stats, StatsIndex.FRAME_COUNT, frameCount)
  Atomics.store(
    bufferViews.stats,
    StatsIndex.SIMULATION_TIME_MS,
    simulationTimeMs
  )
}
