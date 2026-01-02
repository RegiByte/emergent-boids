/**
 * Worker System Configuration (Session 112)
 *
 * Braided system for the worker thread.
 * Provides worker-compatible versions of core resources:
 * - time: Frame counter, elapsed time (no React/Zustand)
 * - profiler: Performance tracking (accumulates, reports to main thread)
 * - randomness: Seeded RNG for reproducibility
 * - config: Snapshot of runtimeStore state
 *
 * Philosophy:
 * - Worker has its own resource system (composition!)
 * - Main thread is source of truth (sync when needed)
 * - Resources are lightweight (no DOM, no React)
 * - Same patterns as main system (braided composition)
 */

import { defineResource } from "braided";
import { createSeededRNG, type DomainRNG } from "@/lib/seededRandom";

// ============================================================================
// Worker Time Resource
// ============================================================================

export type WorkerTimeResource = {
  getFrame: () => number;
  getElapsed: () => number; // milliseconds
  getElapsedSeconds: () => number;
  tick: () => void; // Increment frame
  addTime: (deltaMs: number) => void; // Add elapsed time
  reset: (frame: number, elapsedMs: number) => void;
};

export const createWorkerTimeResource = (initialState?: {
  frame: number;
  elapsedMs: number;
}) => {
  return defineResource({
    start: () => {
      let frame = initialState?.frame ?? 0;
      let elapsedMs = initialState?.elapsedMs ?? 0;

      return {
        getFrame: () => frame,
        getElapsed: () => elapsedMs,
        getElapsedSeconds: () => elapsedMs / 1000,
        tick: () => {
          frame++;
        },
        addTime: (deltaMs: number) => {
          elapsedMs += deltaMs;
        },
        reset: (newFrame: number, newElapsedMs: number) => {
          frame = newFrame;
          elapsedMs = newElapsedMs;
        },
      } satisfies WorkerTimeResource;
    },
    halt: () => {
      // No cleanup needed
    },
  });
};

// ============================================================================
// Worker Profiler Resource
// ============================================================================

type ProfileMetric = {
  totalTime: number;
  count: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
};

export type WorkerProfilerResource = {
  start: (name: string) => void;
  end: (name: string) => void;
  measure: <T>(name: string, fn: () => T) => T;
  getMetrics: () => Record<string, ProfileMetric>;
  reset: () => void;
};

export const workerProfiler = defineResource({
  start: () => {
    const metrics = new Map<string, ProfileMetric>();
    const activeTimers = new Map<string, number>();

    const updateMetric = (name: string, duration: number) => {
      const existing = metrics.get(name);
      if (existing) {
        const totalTime = existing.totalTime + duration;
        const count = existing.count + 1;
        metrics.set(name, {
          totalTime,
          count,
          avgTime: totalTime / count,
          minTime: Math.min(existing.minTime, duration),
          maxTime: Math.max(existing.maxTime, duration),
        });
      } else {
        metrics.set(name, {
          totalTime: duration,
          count: 1,
          avgTime: duration,
          minTime: duration,
          maxTime: duration,
        });
      }
    };

    return {
      start: (name: string) => {
        activeTimers.set(name, performance.now());
      },
      end: (name: string) => {
        const startTime = activeTimers.get(name);
        if (startTime === undefined) {
          console.warn(`[WorkerProfiler] No start time for "${name}"`);
          return;
        }
        const duration = performance.now() - startTime;
        activeTimers.delete(name);
        updateMetric(name, duration);
      },
      measure: <T>(name: string, fn: () => T): T => {
        const startTime = performance.now();
        try {
          return fn();
        } finally {
          const duration = performance.now() - startTime;
          updateMetric(name, duration);
        }
      },
      getMetrics: () => {
        const result: Record<string, ProfileMetric> = {};
        for (const [name, metric] of metrics.entries()) {
          result[name] = metric;
        }
        return result;
      },
      reset: () => {
        metrics.clear();
        activeTimers.clear();
      },
    } satisfies WorkerProfilerResource;
  },
  halt: () => {
    // No cleanup needed
  },
});

// ============================================================================
// Worker Randomness Resource
// ============================================================================

export type WorkerRandomnessResource = {
  getMasterSeed: () => string;
  getMasterSeedNumber: () => number;
  domain: (name: string) => DomainRNG;
  getDomains: () => string[];
};

export const createWorkerRandomnessResource = (seed?: string | number) => {
  return defineResource({
    start: () => {
      const rng = createSeededRNG(seed ?? "worker-default-seed");

      console.log(
        `[WorkerRandomness] Initialized with seed: "${rng.getMasterSeed()}" (${rng.getMasterSeedNumber()})`
      );

      return {
        getMasterSeed: () => rng.getMasterSeed(),
        getMasterSeedNumber: () => rng.getMasterSeedNumber(),
        domain: (name: string) => rng.domain(name),
        getDomains: () => rng.getDomains(),
      } satisfies WorkerRandomnessResource;
    },
    halt: () => {
      // No cleanup needed
    },
  });
};

// ============================================================================
// Worker Config Resource
// ============================================================================

export type WorkerConfigResource = {
  get: () => any; // Full config snapshot
  update: (newConfig: any) => void;
  getParameters: () => any;
  getPhysics: () => any;
  getWorld: () => any;
  getSpecies: () => any;
};

export const createWorkerConfigResource = (initialConfig?: any) => {
  return defineResource({
    start: () => {
      let config = initialConfig ?? {};

      return {
        get: () => config,
        update: (newConfig: any) => {
          config = newConfig;
        },
        getParameters: () => config.parameters ?? {},
        getPhysics: () => config.physics ?? {},
        getWorld: () => config.world ?? {},
        getSpecies: () => config.species ?? {},
      } satisfies WorkerConfigResource;
    },
    halt: () => {
      // No cleanup needed
    },
  });
};

// ============================================================================
// Worker System Configuration
// ============================================================================

/**
 * Worker system configuration
 * Minimal set of resources needed for physics simulation
 */
export const createWorkerSystemConfig = (initialState?: {
  seed?: string | number;
  frame?: number;
  elapsedMs?: number;
  config?: any;
}) => {
  return {
    time: createWorkerTimeResource({
      frame: initialState?.frame ?? 0,
      elapsedMs: initialState?.elapsedMs ?? 0,
    }),
    profiler: workerProfiler,
    randomness: createWorkerRandomnessResource(initialState?.seed),
    config: createWorkerConfigResource(initialState?.config),
  };
};
