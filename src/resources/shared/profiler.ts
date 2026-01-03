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

/**
 * Cumulative metric tracking for aggregating micro-operations
 * Tracks metrics over a time window (e.g., last N frames)
 */
export type CumulativeMetric = {
  name: string;
  totalTime: number; // Total time accumulated in current window
  callCount: number; // Total calls in current window
  avgTime: number; // Average time per call
  minTime: number; // Min time seen in window
  maxTime: number; // Max time seen in window
  percentOfParent: number; // Percentage of parent operation time (if applicable)
  windowFrames: number; // Number of frames in this window
};

export type ProfilerState = {
  enabled: boolean;
  metrics: Map<string, ProfileMetric>;
  activeTimers: Map<string, number>;
  frameMetrics: FrameMetrics;
  // Cumulative tracking
  cumulativeEnabled: boolean;
  cumulativeMetrics: Map<string, CumulativeMetric>;
  cumulativeWindowFrames: number;
  cumulativeMaxFrames: number;
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
    // Cumulative tracking
    cumulativeEnabled: false,
    cumulativeMetrics: new Map<string, CumulativeMetric>(),
    cumulativeWindowFrames: 0,
    cumulativeMaxFrames: 60, // Default: track over 60 frames
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
 * Update cumulative metric with new timing data (pure)
 */
export function updateCumulativeMetric(
  existing: CumulativeMetric | undefined,
  name: string,
  duration: number,
  windowFrames: number,
): CumulativeMetric {
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
      percentOfParent: 0, // Will be calculated later
      windowFrames,
    };
  } else {
    return {
      name,
      totalTime: duration,
      callCount: 1,
      avgTime: duration,
      minTime: duration,
      maxTime: duration,
      percentOfParent: 0,
      windowFrames,
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

/**
 * Format cumulative profiler summary
 */
export function formatCumulativeSummary(
  metrics: CumulativeMetric[],
  frameMetrics: FrameMetrics,
  windowFrames: number,
): string {
  const lines: string[] = [];

  lines.push(
    "\n╔════════════════════════════════════════════════════════════════════════════╗",
  );
  lines.push(
    "║                    CUMULATIVE PROFILER SUMMARY                             ║",
  );
  lines.push(
    `║                    (${windowFrames} frames aggregated)`.padEnd(77) + "║",
  );
  lines.push(
    "╠════════════════════════════════════════════════════════════════════════════╣",
  );
  lines.push(
    `║ FPS: ${frameMetrics.fps
      .toFixed(1)
      .padEnd(10)} Frame: ${frameMetrics.frameTime.toFixed(2)}ms`.padEnd(77) +
      "║",
  );
  lines.push(
    `║ Update: ${frameMetrics.updateTime.toFixed(
      2,
    )}ms   Render: ${frameMetrics.renderTime.toFixed(2)}ms`.padEnd(77) + "║",
  );
  lines.push(
    "╠════════════════════════════════════════════════════════════════════════════╣",
  );
  lines.push(
    "║ Operation                Total(ms)  Avg(µs)  Calls/frame  Total Calls  %Time║",
  );
  lines.push(
    "╠════════════════════════════════════════════════════════════════════════════╣",
  );

  // Sort by total time
  const sorted = [...metrics].sort((a, b) => b.totalTime - a.totalTime);

  // Calculate total time for percentage
  const totalTime = sorted.reduce((sum, m) => sum + m.totalTime, 0);

  for (const metric of sorted.slice(0, 20)) {
    const name = metric.name.padEnd(23).slice(0, 23);
    const total = metric.totalTime.toFixed(2).padStart(10);
    const avg = (metric.avgTime * 1000).toFixed(2).padStart(8); // Convert to µs
    const callsPerFrame = (metric.callCount / windowFrames).toFixed(1).padStart(11);
    const totalCalls = metric.callCount.toString().padStart(12);
    const percent = ((metric.totalTime / totalTime) * 100).toFixed(1).padStart(6);
    lines.push(
      `║ ${name} ${total} ${avg} ${callsPerFrame} ${totalCalls} ${percent}%║`,
    );
  }

  lines.push(
    "╚════════════════════════════════════════════════════════════════════════════╝\n",
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
  // Cumulative tracking
  enableCumulative: (maxFrames?: number) => void;
  disableCumulative: () => void;
  isCumulativeEnabled: () => boolean;
  recordCumulativeFrame: () => void;
  getCumulativeMetrics: () => CumulativeMetric[];
  printCumulativeSummary: () => void;
  resetCumulative: () => void;
  // Convenience
  startSession: (frames?: number) => void;
  help: () => void;
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

      // Also update cumulative metrics if enabled
      if (state.cumulativeEnabled) {
        const cumulativeExisting = state.cumulativeMetrics.get(name);
        const cumulativeUpdated = updateCumulativeMetric(
          cumulativeExisting,
          name,
          duration,
          state.cumulativeWindowFrames,
        );
        state.cumulativeMetrics.set(name, cumulativeUpdated);
      }
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
      const ruleMetrics = metrics.filter((m) => m.name.startsWith("rules."));
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

    // ========================================================================
    // Cumulative Tracking Methods
    // ========================================================================

    const enableCumulative = (maxFrames: number = 60) => {
      state.cumulativeEnabled = true;
      state.cumulativeMaxFrames = maxFrames;
      state.cumulativeWindowFrames = 0;
      state.cumulativeMetrics.clear();
      console.log(
        `🔍 Cumulative profiler enabled (window: ${maxFrames} frames)`,
      );
    };

    const disableCumulative = () => {
      state.cumulativeEnabled = false;
      console.log("🔍 Cumulative profiler disabled");
    };

    const isCumulativeEnabled = () => state.cumulativeEnabled;

    const recordCumulativeFrame = () => {
      if (!state.cumulativeEnabled) return;

      state.cumulativeWindowFrames++;

      // Reset when window is full
      if (state.cumulativeWindowFrames >= state.cumulativeMaxFrames) {
        // Don't clear - let it accumulate for analysis
        // User can manually reset if needed
      }
    };

    const getCumulativeMetrics = (): CumulativeMetric[] => {
      return Array.from(state.cumulativeMetrics.values());
    };

    const printCumulativeSummary = () => {
      if (!state.cumulativeEnabled) {
        console.log("Cumulative profiler is disabled");
        return;
      }

      if (state.cumulativeWindowFrames === 0) {
        console.log("No cumulative data collected yet");
        return;
      }

      const metrics = getCumulativeMetrics();
      const summary = formatCumulativeSummary(
        metrics,
        state.frameMetrics,
        state.cumulativeWindowFrames,
      );
      console.log(summary);

      // Also print grouped rule metrics
      const lines = [];
      const ruleMetrics = metrics.filter((m) => m.name.startsWith("rules."));
      if (ruleMetrics.length > 0) {
        lines.push("\n🎯 CUMULATIVE RULE-LEVEL BREAKDOWN:");
        lines.push(
          "═══════════════════════════════════════════════════════════════════════════",
        );
        const sorted = ruleMetrics.sort((a, b) => b.totalTime - a.totalTime);
        const totalRuleTime = sorted.reduce((sum, m) => sum + m.totalTime, 0);
        for (const metric of sorted) {
          const name = metric.name.padEnd(30);
          const total = `${metric.totalTime.toFixed(2)}ms`.padStart(12);
          const avg = `${(metric.avgTime * 1000).toFixed(2)}µs`.padStart(10);
          const callsPerFrame = (
            metric.callCount / state.cumulativeWindowFrames
          )
            .toFixed(1)
            .padStart(10);
          const totalCalls = metric.callCount.toString().padStart(10);
          const pct = `${(
            (metric.totalTime / totalRuleTime) *
            100
          ).toFixed(1)}%`.padStart(7);
          lines.push(
            `${name} Total: ${total}  Avg: ${avg}  Calls/frame: ${callsPerFrame}  Total: ${totalCalls}  ${pct}`,
          );
        }
        lines.push(
          "═══════════════════════════════════════════════════════════════════════════\n",
        );
      }
      console.log(lines.join("\n"));
    };

    const resetCumulative = () => {
      state.cumulativeMetrics.clear();
      state.cumulativeWindowFrames = 0;
      console.log("🔍 Cumulative profiler metrics reset");
    };

    // ========================================================================
    // Convenience Methods
    // ========================================================================

    const startSession = (frames: number = 60) => {
      console.log("🔍 Starting profiling session...");
      enable();
      enableCumulative(frames);
      console.log(`   • Standard profiler: enabled`);
      console.log(`   • Cumulative tracking: ${frames} frames`);
      console.log(`\n   Let simulation run, then call:`);
      console.log(`   → profiler.printSummary()           (per-frame)`);
      console.log(`   → profiler.printCumulativeSummary() (aggregated)`);
      console.log(`\n   Or type: profiler.help()`);
    };

    const help = () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║              PROFILER QUICK REFERENCE                      ║
╠════════════════════════════════════════════════════════════╣
║ profiler.startSession(60)    Start profiling (60 frames)  ║
║ profiler.printSummary()       Show per-frame metrics      ║
║ profiler.printCumulativeSummary() Show aggregated metrics ║
║ profiler.resetCumulative()    Reset cumulative data       ║
║ profiler.enable()             Enable standard profiling   ║
║ profiler.disable()            Disable standard profiling  ║
║ profiler.enableCumulative(N)  Track N frames cumulative   ║
║ profiler.disableCumulative()  Stop cumulative tracking    ║
╠════════════════════════════════════════════════════════════╣
║ CUMULATIVE METRICS LEGEND:                                 ║
║   Total(ms)    - Time across all frames                   ║
║   Avg(µs)      - Time per single call                     ║
║   Calls/frame  - Frequency per frame                      ║
║   Total Calls  - All calls in window                      ║
║   %Time        - Percentage of frame time                 ║
╠════════════════════════════════════════════════════════════╣
║ FINDING BOTTLENECKS:                                       ║
║   🎯 High Calls/frame + High %Time = Optimization target  ║
║   📊 Expected: Calls/frame ≈ NumBoids × CallsPerBoid     ║
║   ⚠️  Actual >> Expected = Redundant calculations         ║
╚════════════════════════════════════════════════════════════╝

📚 Full guide: .regibyte/CUMULATIVE_PROFILER_GUIDE.md
`);
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
      // Cumulative tracking
      enableCumulative,
      disableCumulative,
      isCumulativeEnabled,
      recordCumulativeFrame,
      getCumulativeMetrics,
      printCumulativeSummary,
      resetCumulative,
      // Convenience
      startSession,
      help,
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
