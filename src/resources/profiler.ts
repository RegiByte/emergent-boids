import { defineResource } from "braided";

// ============================================================================
// Types
// ============================================================================

export type ProfileMetric = {
  name: string;
  totalTime: number;
  callCount: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  lastTime: number;
};

export type FrameMetrics = {
  frameTime: number;
  fps: number;
  updateTime: number;
  renderTime: number;
};

export type ProfilerState = {
  enabled: boolean;
  metrics: Map<string, ProfileMetric>;
  activeTimers: Map<string, number>;
  frameMetrics: FrameMetrics;
};

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Create initial profiler state
 */
export function createProfilerState(): ProfilerState {
  return {
    enabled: false,
    metrics: new Map<string, ProfileMetric>(),
    activeTimers: new Map<string, number>(),
    frameMetrics: {
      frameTime: 0,
      fps: 0,
      updateTime: 0,
      renderTime: 0,
    },
  };
}

/**
 * Update metric with new timing data (pure)
 */
export function updateMetric(
  existing: ProfileMetric | undefined,
  name: string,
  duration: number,
): ProfileMetric {
  if (existing) {
    const totalTime = existing.totalTime + duration;
    const callCount = existing.callCount + 1;
    return {
      name,
      totalTime,
      callCount,
      avgTime: totalTime / callCount,
      minTime: Math.min(existing.minTime, duration),
      maxTime: Math.max(existing.maxTime, duration),
      lastTime: duration,
    };
  } else {
    return {
      name,
      totalTime: duration,
      callCount: 1,
      avgTime: duration,
      minTime: duration,
      maxTime: duration,
      lastTime: duration,
    };
  }
}

/**
 * Sort metrics by average time (descending)
 */
export function sortMetricsByAvgTime(
  metrics: ProfileMetric[],
): ProfileMetric[] {
  return [...metrics].sort((a, b) => b.avgTime - a.avgTime);
}

/**
 * Format profiler summary for console output
 */
export function formatSummary(
  metrics: ProfileMetric[],
  frameMetrics: FrameMetrics,
): string {
  const lines: string[] = [];

  lines.push(
    "\n╔════════════════════════════════════════════════════════════╗",
  );
  lines.push("║              PERFORMANCE PROFILER SUMMARY                  ║");
  lines.push("╠════════════════════════════════════════════════════════════╣");
  lines.push(
    `║ FPS: ${frameMetrics.fps
      .toFixed(1)
      .padEnd(10)} Frame: ${frameMetrics.frameTime.toFixed(2)}ms`.padEnd(61) +
      "║",
  );
  lines.push(
    `║ Update: ${frameMetrics.updateTime.toFixed(
      2,
    )}ms   Render: ${frameMetrics.renderTime.toFixed(2)}ms`.padEnd(61) + "║",
  );
  lines.push("╠════════════════════════════════════════════════════════════╣");
  lines.push("║ Operation                    Avg(ms)  Min(ms)  Max(ms) Calls║");
  lines.push("╠════════════════════════════════════════════════════════════╣");

  const sortedMetrics = sortMetricsByAvgTime(metrics);
  for (const metric of sortedMetrics.slice(0, 15)) {
    const name = metric.name.padEnd(28).slice(0, 28);
    const avg = metric.avgTime.toFixed(3).padStart(7);
    const min = metric.minTime.toFixed(3).padStart(7);
    const max = metric.maxTime.toFixed(3).padStart(7);
    const calls = metric.callCount.toString().padStart(5);
    lines.push(`║ ${name} ${avg} ${min} ${max} ${calls}║`);
  }

  lines.push(
    "╚════════════════════════════════════════════════════════════╝\n",
  );

  return lines.join("\n");
}

// ============================================================================
// Profiler Resource (Impure Shell)
// ============================================================================

export type Profiler = {
  enable: () => void;
  disable: () => void;
  isEnabled: () => boolean;
  start: (name: string) => void;
  end: (name: string) => void;
  measure: <T>(name: string, fn: () => T) => T;
  recordFrame: (
    frameTime: number,
    fps: number,
    updateTime: number,
    renderTime: number,
  ) => void;
  getMetrics: () => ProfileMetric[];
  getFrameMetrics: () => FrameMetrics;
  printSummary: () => void;
  reset: () => void;
};

export const profiler = defineResource({
  start: (): Profiler => {
    // Mutable state (isolated in resource)
    const state = createProfilerState();

    const enable = () => {
      state.enabled = true;
      state.metrics.clear();
      console.log("🔍 Performance profiler enabled");
    };

    const disable = () => {
      state.enabled = false;
      console.log("🔍 Performance profiler disabled");
    };

    const isEnabled = () => state.enabled;

    const start = (name: string) => {
      if (!state.enabled) return;
      state.activeTimers.set(name, performance.now());
    };

    const end = (name: string) => {
      if (!state.enabled) return;

      const startTime = state.activeTimers.get(name);
      if (startTime === undefined) {
        console.warn(`Profiler: No start time for "${name}"`);
        return;
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      state.activeTimers.delete(name);

      // Update metric using pure function
      const existing = state.metrics.get(name);
      const updated = updateMetric(existing, name, duration);
      state.metrics.set(name, updated);
    };

    const measure = <T>(name: string, fn: () => T): T => {
      if (!state.enabled) return fn();

      start(name);
      try {
        return fn();
      } finally {
        end(name);
      }
    };

    const recordFrame = (
      frameTime: number,
      fps: number,
      updateTime: number,
      renderTime: number,
    ) => {
      if (!state.enabled) return;

      state.frameMetrics = {
        frameTime,
        fps,
        updateTime,
        renderTime,
      };
    };

    const getMetrics = (): ProfileMetric[] => {
      return Array.from(state.metrics.values());
    };

    const getFrameMetrics = (): FrameMetrics => {
      return state.frameMetrics;
    };

    const printSummary = () => {
      if (!state.enabled) {
        console.log("Profiler is disabled");
        return;
      }

      const metrics = getMetrics();
      const summary = formatSummary(metrics, state.frameMetrics);
      console.log(summary);

      // Also print rule-specific metrics
      const lines = [];
      const ruleMetrics = metrics.filter((m) => m.name.startsWith("rule."));
      if (ruleMetrics.length > 0) {
        lines.push("\n🎯 RULE-LEVEL BREAKDOWN:");
        lines.push(
          "═══════════════════════════════════════════════════════════",
        );
        const sorted = ruleMetrics.sort((a, b) => b.totalTime - a.totalTime);
        for (const metric of sorted) {
          const name = metric.name.padEnd(30);
          const total = `${metric.totalTime.toFixed(2)}ms`.padStart(10);
          const avg = `${(metric.avgTime * 1000).toFixed(2)}µs`.padStart(10);
          const calls = metric.callCount.toString().padStart(8);
          const pct = `${(
            (metric.totalTime / state.frameMetrics.updateTime) *
            100
          ).toFixed(1)}%`.padStart(6);
          lines.push(
            `${name} Total: ${total}  Avg: ${avg}  Calls: ${calls}  ${pct}`,
          );
        }
        lines.push(
          "═══════════════════════════════════════════════════════════\n",
        );
      } else {
        lines.push(
          "\n⚠️  No rule metrics found. Profiler may not be enabled during rule execution.\n",
        );
      }
      console.log(lines.join("\n"));
    };

    const reset = () => {
      state.metrics.clear();
      state.activeTimers.clear();
      console.log("🔍 Profiler metrics reset");
    };

    const profilerApi: Profiler = {
      enable,
      disable,
      isEnabled,
      start,
      end,
      measure,
      recordFrame,
      getMetrics,
      getFrameMetrics,
      printSummary,
      reset,
    };

    // Expose to window for console access
    if (typeof window !== "undefined") {
      (window as unknown as { profiler: Profiler }).profiler = profilerApi;
    }

    return profilerApi;
  },
  halt: () => {
    // Cleanup window reference
    if (typeof window !== "undefined") {
      delete (window as unknown as { profiler: unknown }).profiler;
    }
  },
});
