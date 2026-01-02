import { createAtom, useAtomState } from "@/lib/state";
import { defineResource } from "braided";
import { create } from "zustand";

/**
 * Time Resource - Centralized time management for the simulation
 *
 * Provides:
 * - Simulation-relative time (ticks, elapsed seconds)
 * - Real-world time (for UI display)
 * - Time control (pause, resume, scale)
 * - Pure API (no direct Date.now() calls elsewhere)
 *
 * Philosophy:
 * Time is information processing. The simulation doesn't run in "real time" -
 * it runs in simulation time, which can be scaled, paused, and controlled.
 *
 * This eliminates impurity from Date.now() scattered throughout the codebase
 * and provides a single source of truth for all time-related operations.
 */

// ============================================
// Time State Schema
// ============================================

export type TimeState = {
  // Simulation time (affected by pause/scale)
  simulationFrame: number; // Current frame number (increments each engine update)
  simulationElapsedMs: number; // Total simulation time elapsed (ms)
  simulationElapsedSeconds: number; // Total simulation time elapsed (seconds)

  // Real-world time (unaffected by pause/scale)
  realWorldStartMs: number; // When simulation started (real time)
  realWorldElapsedMs: number; // Real time since start

  // Time control
  isPaused: boolean; // Is simulation paused?
  timeScale: number; // Speed multiplier (0.25x - 4x)

  // Step mode
  stepRequested: boolean; // Request single simulation update

  // Internal state
  lastUpdateMs: number; // Last real-world update time (for delta calculation)
};

/**
 * Time Store - Zustand store for React components
 *
 * This prevents infinite render loops by providing a stable reference.
 * Components can subscribe to specific slices of time state.
 */
type TimeStore = TimeState;

const createTimeStore = (initialState: TimeState) => {
  return create<TimeStore>(() => initialState);
};

// ============================================
// Time API
// ============================================

export type TimeAPI = {
  // Query current time
  getState: () => TimeState;
  getFrame: () => number; // Get current simulation frame (engine update count)
  getSimulationTime: () => number; // Simulation time in seconds
  getRealWorldTime: () => number; // Real-world time in seconds

  // Generate timestamps (simulation-relative) - replaces Date.now()
  now: () => number; // Current simulation time (ms)
  nowSeconds: () => number; // Current simulation time (seconds)

  // Time control
  pause: () => void;
  resume: () => void;
  setTimeScale: (scale: number) => void;
  step: () => void; // Advance one tick (when paused)
  clearStepRequest: () => void; // Clear step request flag

  // Update (called by renderer each frame)
  update: (realDeltaMs: number) => void;

  // Tick (called when a fixed timestep update occurs)
  tick: () => void;

  // Reset
  reset: () => void;

  // React integration
  useTime: () => TimeState;
};

// ============================================
// Time Resource Implementation
// ============================================

export type TimeResource = TimeAPI;

export const time = defineResource({
  start: () => {
    const realWorldStartMs = performance.now(); // Use performance.now() for precision

    const initialState: TimeState = {
      simulationFrame: 0,
      simulationElapsedMs: 0,
      simulationElapsedSeconds: 0,
      realWorldStartMs,
      realWorldElapsedMs: 0,
      isPaused: false,
      timeScale: 1.0,
      stepRequested: false,
      lastUpdateMs: realWorldStartMs,
    };

    const stateAtom = createAtom(initialState);

    const api = {
      getState: () => stateAtom.get(),
      getFrame: () => stateAtom.get().simulationFrame,
      getSimulationTime: () => stateAtom.get().simulationElapsedSeconds,
      getRealWorldTime: () => stateAtom.get().realWorldElapsedMs / 1000,

      // Pure simulation time (replaces Date.now())
      now: () => stateAtom.get().simulationElapsedMs,
      nowSeconds: () => stateAtom.get().simulationElapsedSeconds,

      pause: () => {
        stateAtom.update((state) => {
          return {
            ...state,
            isPaused: true,
          };
        });
      },

      resume: () => {
        stateAtom.update((state) => {
          return {
            ...state,
            isPaused: false,
          };
        });
      },

      setTimeScale: (scale: number) => {
        if (scale < 0.1 || scale > 4.0) {
          throw new Error("Time scale must be between 0.1 and 4.0");
        }
        stateAtom.update((state) => {
          return {
            ...state,
            timeScale: scale,
          };
        });
      },

      step: () => {
        if (!stateAtom.get().isPaused) return;
        // Request simulation update (tick will be incremented by renderer via time.tick())
        stateAtom.update((state) => {
          return {
            ...state,
            stepRequested: true,
          };
        });
      },

      clearStepRequest: () => {
        stateAtom.update((state) => {
          return {
            ...state,
            stepRequested: false,
          };
        });
      },

      update: (realDeltaMs: number) => {
        stateAtom.update((draft) => {
          // Update real-world time (always advances)
          const updatedState = { ...draft };
          updatedState.realWorldElapsedMs += realDeltaMs;

          // Update simulation time (only if not paused)
          if (!updatedState.isPaused) {
            const scaledDelta = realDeltaMs * draft.timeScale;
            updatedState.simulationElapsedMs += scaledDelta;
            updatedState.simulationElapsedSeconds =
              updatedState.simulationElapsedMs / 1000;
          }

          return updatedState;
        });
      },

      tick: () => {
        // Called when a fixed timestep update occurs (one frame)
        stateAtom.update((draft) => {
          // Also advance simulation time by one fixed timestep (16.67ms)
          // This ensures lifecycle ticks work correctly in step mode
          return {
            ...draft,
            simulationFrame: draft.simulationFrame + 1,
            simulationElapsedMs: draft.simulationElapsedMs + 16.67,
            simulationElapsedSeconds: draft.simulationElapsedMs / 1000,
          };
        });
      },

      reset: () => {
        const now = performance.now();
        const restoredState = {
          simulationFrame: 0,
          simulationElapsedMs: 0,
          simulationElapsedSeconds: 0,
          realWorldStartMs: now,
          realWorldElapsedMs: 0,
          isPaused: false,
          timeScale: 1.0,
          stepRequested: false,
          lastUpdateMs: now,
        };
        stateAtom.set(restoredState);
      },

      // React integration
      useTime: () => useAtomState(stateAtom),
    } as TimeAPI;

    return api;
  },
  halt: () => {
    // No cleanup needed
  },
});
