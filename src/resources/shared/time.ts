import { createAtom, useAtomState } from '@/lib/state.ts'
import { defineResource } from 'braided'

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

export type TimeState = {
  simulationFrame: number // Current frame number (increments each engine update)
  simulationElapsedMs: number // Total simulation time elapsed (ms)
  simulationElapsedSeconds: number // Total simulation time elapsed (seconds)

  realWorldStartMs: number // When simulation started (real time)
  realWorldElapsedMs: number // Real time since start

  isPaused: boolean // Is simulation paused?
  timeScale: number // Speed multiplier (0.25x - 4x)

  stepRequested: boolean // Request single simulation update

  lastUpdateMs: number // Last real-world update time (for delta calculation)
}

export type TimeAPI = {
  getState: () => TimeState
  getFrame: () => number // Get current simulation frame (engine update count)
  getSimulationTime: () => number // Simulation time in seconds
  getRealWorldTime: () => number // Real-world time in seconds

  now: () => number // Current simulation time (ms)
  nowSeconds: () => number // Current simulation time (seconds)

  pause: () => void
  resume: () => void
  setTimeScale: (scale: number) => void
  step: () => void // Advance one tick (when paused)
  clearStepRequest: () => void // Clear step request flag

  update: (realDeltaMs: number) => void
  incrementFrame: () => void

  tick: (timestep?: number) => void

  syncFromWorker: (workerStats: {
    frame: number
    simulationTimeMs: number
  }) => void

  reset: () => void

  useTime: () => TimeState
}

export type TimeResource = TimeAPI

export const time = defineResource({
  start: () => {
    const realWorldStartMs = performance.now() // Use performance.now() for precision
    const FIXED_TIMESTEP = 33.334 // 30 FPS

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
    }

    const stateAtom = createAtom(initialState)

    const api = {
      getState: () => stateAtom.get(),
      getFrame: () => stateAtom.get().simulationFrame,
      getSimulationTime: () => stateAtom.get().simulationElapsedSeconds,
      getRealWorldTime: () => stateAtom.get().realWorldElapsedMs / 1000,

      now: () => stateAtom.get().simulationElapsedMs,
      nowSeconds: () => stateAtom.get().simulationElapsedSeconds,

      pause: () => {
        stateAtom.update((state) => {
          return {
            ...state,
            isPaused: true,
          }
        })
      },

      resume: () => {
        stateAtom.update((state) => {
          return {
            ...state,
            isPaused: false,
          }
        })
      },

      setTimeScale: (scale: number) => {
        if (scale < 0.1 || scale > 4.0) {
          throw new Error('Time scale must be between 0.1 and 4.0')
        }
        stateAtom.update((state) => {
          return {
            ...state,
            timeScale: scale,
          }
        })
      },

      step: () => {
        if (!stateAtom.get().isPaused) return
        stateAtom.update((state) => {
          return {
            ...state,
            stepRequested: true,
          }
        })
      },

      clearStepRequest: () => {
        stateAtom.update((state) => {
          return {
            ...state,
            stepRequested: false,
          }
        })
      },

      update: (realDeltaMs: number) => {
        stateAtom.update((draft) => {
          const updatedState = { ...draft }
          updatedState.realWorldElapsedMs += realDeltaMs

          if (!updatedState.isPaused) {
            const scaledDelta = realDeltaMs * draft.timeScale
            updatedState.simulationElapsedMs += scaledDelta
            updatedState.simulationElapsedSeconds =
              updatedState.simulationElapsedMs / 1000
          }

          return updatedState
        })
      },

      incrementFrame: () => {
        stateAtom.update((draft) => {
          return {
            ...draft,
            simulationFrame: draft.simulationFrame + 1,
          }
        })
      },

      tick: (timestep = FIXED_TIMESTEP) => {
        stateAtom.update((draft) => {
          const elapsedMs =
            draft.simulationElapsedMs + timestep * draft.timeScale
          return {
            ...draft,
            simulationElapsedMs: elapsedMs,
            simulationElapsedSeconds: elapsedMs / 1000,
          }
        })
      },

      syncFromWorker: (workerStats: {
        frame: number
        simulationTimeMs: number
      }) => {
        stateAtom.update((draft) => {
          return {
            ...draft,
            simulationFrame: workerStats.frame,
            simulationElapsedMs: workerStats.simulationTimeMs,
            simulationElapsedSeconds: workerStats.simulationTimeMs / 1000,
          }
        })
      },

      reset: () => {
        const now = performance.now()
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
        }
        stateAtom.set(restoredState)
      },

      useTime: () => useAtomState(stateAtom),
    } as TimeAPI

    return api
  },
  halt: () => {},
})
