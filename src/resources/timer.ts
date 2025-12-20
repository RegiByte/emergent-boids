import { defineResource } from "braided";

type Timer = {
  startedAt: number;
  delayMs: number;
  id: string;
  taskId: number; // setTimeout id
};

export interface TimerManager {
  schedule: (id: string, delayMs: number, callback: () => void) => void;
  cancel: (id: string) => void;
  cleanup: () => void;
  exists: (id: string) => boolean;
  list: () => Timer[];
}

export const timer = defineResource({
  start: (): TimerManager => {
    const timers = new Map<string, Timer>();

    const manager: TimerManager = {
      schedule: (id: string, delayMs: number, callback: () => void) => {
        if (timers.has(id)) {
          // Cleanup existing timer to prevent duplicate scheduling
          clearTimeout(timers.get(id)?.taskId);
          timers.delete(id);
        }
        const taskId = setTimeout(callback, delayMs) as unknown as number;
        timers.set(id, { startedAt: Date.now(), delayMs, id, taskId });
      },
      cancel: (id: string) => {
        const timer = timers.get(id);
        if (timer) {
          clearTimeout(timer.taskId);
          timers.delete(id);
        }
      },
      cleanup: () => {
        timers.forEach((timer) => clearTimeout(timer.taskId));
        timers.clear();
      },
      exists: (id: string) => {
        return timers.has(id);
      },
      list: () => Array.from(timers.values()),
    };

    return manager;
  },
  halt: (timerManager) => {
    timerManager.cleanup();
  },
});
