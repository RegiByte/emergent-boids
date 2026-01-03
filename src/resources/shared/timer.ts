import { defineResource } from "braided";
import type { TimeResource } from "./time.ts";

/**
 * Timer Manager - Simulation-time based scheduling
 *
 * Unlike JavaScript's setTimeout/setInterval which use real-world time,
 * this timer uses simulation time. This means:
 * - Timers pause when simulation is paused
 * - Timers speed up/slow down with time scale
 * - Timers are deterministic and reproducible
 *
 * Must call update() each tick to check for expired timers.
 */

type Timer = {
  startedAt: number; // Simulation time when scheduled (ms)
  delayMs: number; // Delay in simulation milliseconds
  id: string;
  callback: () => void;
};

export interface TimerManager {
  schedule: (id: string, delayMs: number, callback: () => void) => void;
  cancel: (id: string) => void;
  cleanup: () => void;
  exists: (id: string) => boolean;
  list: () => Timer[];
  update: () => void; // NEW: Must be called each tick to check timers
}

export const timer = defineResource({
  dependencies: ["time"],
  start: ({ time }: { time: TimeResource }): TimerManager => {
    const timers = new Map<string, Timer>();

    const manager: TimerManager = {
      schedule: (id: string, delayMs: number, callback: () => void) => {
        if (timers.has(id)) {
          // Remove existing timer to prevent duplicate scheduling
          timers.delete(id);
        }

        const timer: Timer = {
          startedAt: time.now(), // Use simulation time!
          delayMs,
          id,
          callback,
        };

        timers.set(id, timer);
      },

      cancel: (id: string) => {
        timers.delete(id);
      },

      cleanup: () => {
        timers.clear();
      },

      exists: (id: string) => {
        return timers.has(id);
      },

      list: () => Array.from(timers.values()),

      // NEW: Check timers and fire callbacks
      update: () => {
        const now = time.now();

        for (const [id, timer] of timers.entries()) {
          const elapsed = now - timer.startedAt;

          if (elapsed >= timer.delayMs) {
            // Timer expired - fire callback and remove
            timers.delete(id);
            timer.callback();
          }
        }
      },
    };

    return manager;
  },
  halt: (timerManager) => {
    timerManager.cleanup();
  },
});
