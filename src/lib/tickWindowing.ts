/**
 * Tick Windowing Utilities
 *
 * Pure functions for grouping events/data by simulation tick windows.
 * Speed-independent aggregation that works at any simulation speed.
 *
 * Philosophy: Simulation time (ticks) > Wall-clock time (milliseconds)
 */

/**
 * Calculate which tick window a given tick belongs to
 *
 * @example
 * getTickWindow(123, 10) → { start: 120, end: 130 }
 * getTickWindow(127, 10) → { start: 120, end: 130 } // Same window!
 * getTickWindow(130, 10) → { start: 130, end: 140 } // New window
 */
export function getTickWindow(
  tick: number,
  windowSize: number
): { start: number; end: number } {
  const start = Math.floor(tick / windowSize) * windowSize;
  const end = start + windowSize;
  return { start, end };
}

/**
 * Generate a stable key for a tick window
 *
 * @example
 * getTickWindowKey("reproduced", 123, 10) → "reproduced-120-130"
 * getTickWindowKey("caught", 127, 10) → "caught-120-130"
 */
export function getTickWindowKey(
  category: string,
  tick: number,
  windowSize: number
): string {
  const { start, end } = getTickWindow(tick, windowSize);
  return `${category}-${start}-${end}`;
}

/**
 * Check if two ticks are in the same window
 *
 * @example
 * areInSameWindow(123, 127, 10) → true
 * areInSameWindow(123, 130, 10) → false
 */
export function areInSameWindow(
  tick1: number,
  tick2: number,
  windowSize: number
): boolean {
  const window1 = getTickWindow(tick1, windowSize);
  const window2 = getTickWindow(tick2, windowSize);
  return window1.start === window2.start;
}

/**
 * Group items by tick window and category
 *
 * Generic function that works with any data type.
 * Returns a Map for O(1) lookups and guaranteed unique keys.
 *
 * @example
 * const events = [
 *   { tick: 123, type: "reproduced", data: {...} },
 *   { tick: 127, type: "caught", data: {...} },
 *   { tick: 125, type: "reproduced", data: {...} },
 * ];
 *
 * const grouped = groupByTickWindow(
 *   events,
 *   (e) => e.type,      // Category extractor
 *   (e) => e.tick,      // Tick extractor
 *   10                  // Window size
 * );
 *
 * // Result:
 * // Map {
 * //   "reproduced-120-130" → [event1, event3],
 * //   "caught-120-130" → [event2]
 * // }
 */
export function groupByTickWindow<T>(
  items: T[],
  getCategoryFn: (item: T) => string,
  getTickFn: (item: T) => number,
  windowSize: number
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const category = getCategoryFn(item);
    const tick = getTickFn(item);
    const key = getTickWindowKey(category, tick, windowSize);

    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

/**
 * Aggregate items by tick window with custom reducer
 *
 * More powerful version that lets you define how to aggregate.
 *
 * @example
 * const events = [
 *   { tick: 123, type: "reproduced", offspring: 2 },
 *   { tick: 125, type: "reproduced", offspring: 1 },
 * ];
 *
 * const aggregated = aggregateByTickWindow(
 *   events,
 *   (e) => e.type,
 *   (e) => e.tick,
 *   10,
 *   (acc, event) => ({
 *     count: acc.count + 1,
 *     totalOffspring: acc.totalOffspring + event.offspring,
 *   }),
 *   () => ({ count: 0, totalOffspring: 0 })
 * );
 *
 * // Result:
 * // Map {
 * //   "reproduced-120-130" → { count: 2, totalOffspring: 3 }
 * // }
 */
export function aggregateByTickWindow<T, A>(
  items: T[],
  getCategoryFn: (item: T) => string,
  getTickFn: (item: T) => number,
  windowSize: number,
  reducerFn: (accumulator: A, item: T) => A,
  initialValueFn: () => A
): Map<string, A> {
  const aggregates = new Map<string, A>();

  for (const item of items) {
    const category = getCategoryFn(item);
    const tick = getTickFn(item);
    const key = getTickWindowKey(category, tick, windowSize);

    const current = aggregates.get(key);
    if (current) {
      aggregates.set(key, reducerFn(current, item));
    } else {
      aggregates.set(key, reducerFn(initialValueFn(), item));
    }
  }

  return aggregates;
}

/**
 * Get the current tick window for "now"
 *
 * Useful for determining which window is currently active.
 *
 * @example
 * getCurrentTickWindow(127, 10) → { start: 120, end: 130 }
 */
export function getCurrentTickWindow(
  currentTick: number,
  windowSize: number
): { start: number; end: number } {
  return getTickWindow(currentTick, windowSize);
}

/**
 * Calculate how many ticks until the next window
 *
 * @example
 * ticksUntilNextWindow(123, 10) → 7  // (130 - 123)
 * ticksUntilNextWindow(129, 10) → 1  // (130 - 129)
 * ticksUntilNextWindow(130, 10) → 10 // (140 - 130)
 */
export function ticksUntilNextWindow(
  currentTick: number,
  windowSize: number
): number {
  const { end } = getTickWindow(currentTick, windowSize);
  return end - currentTick;
}

/**
 * Get all tick windows that overlap with a tick range
 *
 * Useful for querying historical data across multiple windows.
 *
 * @example
 * getOverlappingWindows(123, 145, 10)
 * → [
 *     { start: 120, end: 130 },
 *     { start: 130, end: 140 },
 *     { start: 140, end: 150 }
 *   ]
 */
export function getOverlappingWindows(
  startTick: number,
  endTick: number,
  windowSize: number
): Array<{ start: number; end: number }> {
  const windows: Array<{ start: number; end: number }> = [];
  const firstWindow = getTickWindow(startTick, windowSize);
  const lastWindow = getTickWindow(endTick, windowSize);

  for (
    let start = firstWindow.start;
    start <= lastWindow.start;
    start += windowSize
  ) {
    windows.push({ start, end: start + windowSize });
  }

  return windows;
}

/**
 * Format a tick window for display
 *
 * @example
 * formatTickWindow({ start: 120, end: 130 }) → "T120-T130"
 * formatTickWindow({ start: 120, end: 130 }, "compact") → "120-130"
 */
export function formatTickWindow(
  window: { start: number; end: number },
  format: "full" | "compact" = "full"
): string {
  if (format === "compact") {
    return `${window.start}-${window.end}`;
  }
  return `T${window.start}-T${window.end}`;
}
