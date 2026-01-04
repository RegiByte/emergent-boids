import { findBoidWhere, iterateBoids } from "@/boids/iterators";
import {
  Boid,
  BoidsById,
  PhysicalBoid,
} from "@/boids/vocabulary/schemas/entities";
import { Vector2 } from "@/boids/vocabulary/schemas/primitives";
import {
  getActivePositions,
  getActiveVelocities,
  getInactivePositions,
  getInactiveVelocities,
  SharedBoidViews,
  StatsIndex,
} from "@/lib/sharedMemory";
import { defineResource, StartedResource } from "braided";

/**
 * Gets the physical properties of a boid from the shared memory.
 */
export function getBoidPhysics(
  index: number,
  views: SharedBoidViews,
): PhysicalBoid {
  const positions = getActivePositions(views);
  const velocities = getActiveVelocities(views);

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
  };
}

export function getBoidsPhysicsIndexed(
  indexes: number[],
  views: SharedBoidViews,
): PhysicalBoid[] {
  const positions = getActivePositions(views);
  const velocities = getActiveVelocities(views);

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
  }));
}

/**
 * Merge logical + physical state to create complete Boid
 */
export function mergeBoidWithPhysics(boid: Boid, views: SharedBoidViews): Boid {
  const index = boid.index;

  return {
    ...boid,
    ...getBoidPhysics(index, views),
  } as Boid;
}

export const createLocalBoidStore = () => {
  const boids = {} as BoidsById;
  let count = 0;

  return {
    getBoidById: (id: string) => boids[id],
    getBoidByIndex: (index: number) =>
      findBoidWhere(boids, (boid) => boid.index === index),
    addBoid: (boid: Boid) => {
      boids[boid.id] = boid;
      count++;
    },
    removeBoid: (id: string) => {
      // returns true if boid existed and was removed, false otherwise
      if (!boids[id]) {
        return false;
      }
      delete boids[id];
      count--;

      return true;
    },
    updateBoid: (id: string, updater: (boid: Boid) => void) => {
      if (!boids[id]) {
        return;
      }
      updater(boids[id]);
    },
    updateBoidPosition: (id: string, position: Vector2) => {
      if (!boids[id]) {
        return;
      }
      boids[id] = { ...boids[id], position };
    },
    updateBoidVelocity: (id: string, velocity: Vector2) => {
      if (!boids[id]) {
        return;
      }
      boids[id] = { ...boids[id], velocity };
    },
    updateBoidAcceleration: (id: string, acceleration: Vector2) => {
      if (!boids[id]) {
        return;
      }
      boids[id] = { ...boids[id], acceleration };
    },
    boids: boids as Readonly<BoidsById>,
    count: () => count,
    nextIndex: () => count + 1,
    clear: () => {
      for (const id in boids) {
        delete boids[id];
      }
      count = 0;
    },
  };
};

export type LocalBoidStore = ReturnType<typeof createLocalBoidStore>;

/**
 * Local Boid Store Resource
 * This is the single source of truth for boids in the main thread.
 * No other place should be mutating boids directly.
 */
export const localBoidStore = defineResource({
  dependencies: [],
  start: () => {
    const store = createLocalBoidStore();
    const api = {
      store,
      cleanup: () => {
        store.clear();
      },
    };

    return api;
  },
  halt: (store) => {
    store.cleanup();
  },
});

export type LocalBoidStoreResource = StartedResource<typeof localBoidStore>;

/**
 * Writes the updated boids physical properties to the shared memory.
 */
export function syncBoidsToSharedMemory(
  bufferViews: SharedBoidViews,
  boids: BoidsById,
) {
  const writePositions = getInactivePositions(bufferViews);
  const writeVelocities = getInactiveVelocities(bufferViews);

  for (const boid of iterateBoids(boids)) {
    const index = boid.index;
    writePositions[index * 2 + 0] = boid.position.x;
    writePositions[index * 2 + 1] = boid.position.y;
    writeVelocities[index * 2 + 0] = boid.velocity.x;
    writeVelocities[index * 2 + 1] = boid.velocity.y;
  }
}

export function initializeBoidsStats(
  bufferViews: SharedBoidViews,
  {
    aliveCount,
    frameCount,
    simulationTimeMs,
  }: { aliveCount: number; frameCount: number; simulationTimeMs: number },
) {
  Atomics.store(bufferViews.stats, StatsIndex.ALIVE_COUNT, aliveCount);
  Atomics.store(bufferViews.stats, StatsIndex.FRAME_COUNT, frameCount);
  Atomics.store(
    bufferViews.stats,
    StatsIndex.SIMULATION_TIME_MS,
    simulationTimeMs,
  );
}
