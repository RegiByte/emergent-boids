/**
 * Shared Memory Utilities for Parallel Simulation (Session 111)
 *
 * Provides utilities for working with SharedArrayBuffer for zero-copy
 * data sharing between main thread and worker threads.
 *
 * Core concepts:
 * - SharedArrayBuffer: Raw shared memory accessible from both threads
 * - Double buffering: Two buffers to prevent torn reads
 * - Atomic operations: Lock-free synchronization
 * - Structure-of-Arrays: Cache-friendly layout
 */

/**
 * Check if SharedArrayBuffer is available in this environment.
 * Requires COOP/COEP headers to be set on the server.
 */
export function isSharedArrayBufferSupported(): boolean {
  return typeof SharedArrayBuffer !== "undefined";
}

export const bufferViewIndexes = {
  front: 0,
  back: 1,
} as const;

export type BufferViewIndex = 0 | 1;

/**
 * Get detailed information about SharedArrayBuffer support status
 */
export function getSharedArrayBufferStatus(): {
  supported: boolean;
  reason?: string;
  crossOriginIsolated: boolean;
} {
  const isCrossOriginIsolated =
    typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;

  if (typeof SharedArrayBuffer === "undefined") {
    return {
      supported: false,
      reason: "SharedArrayBuffer is not defined",
      crossOriginIsolated: isCrossOriginIsolated,
    };
  }

  if (!isCrossOriginIsolated) {
    return {
      supported: false,
      reason: "crossOriginIsolated is false - needs COOP/COEP headers",
      crossOriginIsolated: isCrossOriginIsolated,
    };
  }

  return {
    supported: true,
    crossOriginIsolated: isCrossOriginIsolated,
  };
}

/**
 * Memory layout for shared boid simulation state.
 *
 * Structure-of-Arrays layout for cache efficiency:
 * - All X positions together
 * - All Y positions together
 * - etc.
 *
 * Double buffered to prevent torn reads:
 * - Worker writes to inactive buffer
 * - Main reads from active buffer
 * - Atomic swap on completion
 */
export type SharedBoidBufferLayout = {
  /** Total size of the buffer in bytes */
  totalBytes: number;

  /** Number of boids this buffer can hold */
  boidCount: number;

  /** Offset to buffer index (Uint32, 1 element) */
  bufferIndexOffset: number;

  /** Offset to positions buffer 0 (Float32, boidCount * 2 elements) */
  positions0Offset: number;

  /** Offset to positions buffer 1 (Float32, boidCount * 2 elements) */
  positions1Offset: number;

  /** Offset to velocities buffer 0 (Float32, boidCount * 2 elements) */
  velocities0Offset: number;

  /** Offset to velocities buffer 1 (Float32, boidCount * 2 elements) */
  velocities1Offset: number;

  /** Offset to statistics (Uint32, 8 elements) */
  statsOffset: number;
};

/**
 * Calculate memory layout for a given number of boids.
 *
 * Memory layout:
 * - [0-4): Buffer index (Uint32, 1 element = 4 bytes)
 * - [4-...): Positions buffer 0 (Float32, boidCount * 2 elements)
 * - [...-...): Positions buffer 1 (Float32, boidCount * 2 elements)
 * - [...-...): Velocities buffer 0 (Float32, boidCount * 2 elements)
 * - [...-...): Velocities buffer 1 (Float32, boidCount * 2 elements)
 * - [...-...): Statistics (Uint32, 8 elements = 32 bytes)
 */
export function calculateBufferLayout(
  boidCount: number,
): SharedBoidBufferLayout {
  let offset = 0;

  // Buffer index (which buffer is active: 0 or 1)
  const bufferIndexOffset = offset;
  offset += 4; // 1 Uint32 = 4 bytes

  // Positions buffer 0: [x0, y0, x1, y1, ...]
  const positions0Offset = offset;
  offset += boidCount * 2 * 4; // boidCount * 2 Float32s = boidCount * 8 bytes

  // Positions buffer 1
  const positions1Offset = offset;
  offset += boidCount * 2 * 4;

  // Velocities buffer 0: [vx0, vy0, vx1, vy1, ...]
  const velocities0Offset = offset;
  offset += boidCount * 2 * 4;

  // Velocities buffer 1
  const velocities1Offset = offset;
  offset += boidCount * 2 * 4;

  // Statistics: [aliveCount, deadCount, bornCount, ...]
  const statsOffset = offset;
  offset += 8 * 4; // 8 Uint32s = 32 bytes

  const totalBytes = offset;

  return {
    totalBytes,
    boidCount,
    bufferIndexOffset,
    positions0Offset,
    positions1Offset,
    velocities0Offset,
    velocities1Offset,
    statsOffset,
  };
}

/**
 * Create a SharedArrayBuffer with the appropriate layout for boid simulation
 */
export function createSharedBoidBuffer(boidCount: number): {
  buffer: SharedArrayBuffer;
  layout: SharedBoidBufferLayout;
} {
  const layout = calculateBufferLayout(boidCount);
  const buffer = new SharedArrayBuffer(layout.totalBytes);

  return { buffer, layout };
}

/**
 * Typed array views for accessing shared boid data
 */
export type SharedBoidViews = {
  /** Buffer index: which buffer is currently active (0 or 1) */
  bufferIndex: Uint32Array;

  /** Positions buffer 0: [x, y] pairs */
  positions0: Float32Array;

  /** Positions buffer 1: [x, y] pairs */
  positions1: Float32Array;

  /** Velocities buffer 0: [vx, vy] pairs */
  velocities0: Float32Array;

  /** Velocities buffer 1: [vx, vy] pairs */
  velocities1: Float32Array;

  /** Statistics counters */
  stats: Uint32Array;
};

/**
 * Create typed array views for a shared boid buffer
 */
export function createSharedBoidViews(
  buffer: SharedArrayBuffer,
  layout: SharedBoidBufferLayout,
): SharedBoidViews {
  return {
    bufferIndex: new Uint32Array(buffer, layout.bufferIndexOffset, 1),
    positions0: new Float32Array(
      buffer,
      layout.positions0Offset,
      layout.boidCount * 2,
    ),
    positions1: new Float32Array(
      buffer,
      layout.positions1Offset,
      layout.boidCount * 2,
    ),
    velocities0: new Float32Array(
      buffer,
      layout.velocities0Offset,
      layout.boidCount * 2,
    ),
    velocities1: new Float32Array(
      buffer,
      layout.velocities1Offset,
      layout.boidCount * 2,
    ),
    stats: new Uint32Array(buffer, layout.statsOffset, 8),
  };
}

/**
 * Get the currently active positions buffer based on buffer index
 */
export function getActivePositions(views: SharedBoidViews): Float32Array {
  const activeIndex = Atomics.load(views.bufferIndex, 0);
  return activeIndex === 0 ? views.positions0 : views.positions1;
}

/**
 * Get the currently active velocities buffer based on buffer index
 */
export function getActiveVelocities(views: SharedBoidViews): Float32Array {
  const activeIndex = Atomics.load(views.bufferIndex, 0);
  return activeIndex === 0 ? views.velocities0 : views.velocities1;
}

/**
 * Get the currently inactive positions buffer (for worker to write to)
 */
export function getInactivePositions(views: SharedBoidViews): Float32Array {
  const activeIndex = Atomics.load(views.bufferIndex, 0);
  return activeIndex === 0 ? views.positions1 : views.positions0;
}

/**
 * Get the currently inactive velocities buffer (for worker to write to)
 */
export function getInactiveVelocities(views: SharedBoidViews): Float32Array {
  const activeIndex = Atomics.load(views.bufferIndex, 0);
  return activeIndex === 0 ? views.velocities1 : views.velocities0;
}

/**
 * Set the active buffer index
 */
export function setActiveBufferIndex(
  views: SharedBoidViews,
  bufferIndex: number,
) {
  Atomics.store(views.bufferIndex, 0, bufferIndex);
}

/**
 * Get the active buffer index, this indicates which buffer is currently being used by the main thread.
 */
export function getActiveBufferIndex(views: SharedBoidViews): number {
  return Atomics.load(views.bufferIndex, 0);
}

/**
 * Swap the active buffer (worker-side operation after completing write)
 */
export function swapBuffers(views: SharedBoidViews): void {
  const currentIndex = getActiveBufferIndex(views);
  const newIndex =
    currentIndex === bufferViewIndexes.front
      ? bufferViewIndexes.back
      : bufferViewIndexes.front;
  setActiveBufferIndex(views, newIndex);
  // Optional: notify waiters (not needed for our lock-free approach)
  // Atomics.notify(views.bufferIndex, 0);
}

/**
 * Statistics indices in the stats array
 */
export const StatsIndex = {
  ALIVE_COUNT: 0,
  DEAD_COUNT: 1,
  BORN_COUNT: 2,
  FRAME_COUNT: 3,
  SIMULATION_TIME_MS: 4,
  RESERVED_1: 5,
  RESERVED_2: 6,
  RESERVED_3: 7,
} as const;
