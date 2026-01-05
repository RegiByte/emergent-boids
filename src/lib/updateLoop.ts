type UpdateLoopHandlers = {
  onStart: () => void; //
  onStop: () => void;
  onUpdate: (
    deltaMs: number,
    scaledDeltaMs: number,
    clockDeltaMs: number
  ) => void;
  onPause: () => void;
  getDefaultTimestep: () => number;
  getTimeScale: () => number; // default: 1x
};

export const createUpdateLoop = (handlers: UpdateLoopHandlers) => {
  let animationId: number | null = null;
  let isRunning = false;
  let isPaused = false;
  let lastFrameTime = performance.now();

  const {
    onUpdate,
    onPause,
    onStop,
    getTimeScale,
    onStart,
    getDefaultTimestep,
  } = handlers;

  const update = (deltaMs: number) => {
    if (!isRunning) return;
    const currentTime = performance.now();
    // how many time has passed in the clock since the last update
    const clockDeltaMs = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    // if (!isPaused) {
    const timeScale = getTimeScale();
    const scaledDeltaMs = clockDeltaMs * timeScale;
    onUpdate(deltaMs, scaledDeltaMs, clockDeltaMs);
    // }
    animationId = requestAnimationFrame(update);
  };

  const pause = () => {
    isPaused = true;
    onPause();
  };

  const start = () => {
    if (isRunning) return;
    isRunning = true;
    isPaused = false;
    lastFrameTime = performance.now();
    animationId = requestAnimationFrame(update);
    onStart();
  };

  const stop = () => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    isRunning = false;
    onStop();
  };

  const step = (deltaTime?: number) => {
    if (!isRunning) return;
    const timeScale = getTimeScale();
    const timestep = deltaTime ?? getDefaultTimestep();
    const scaledDeltaMs = timestep * timeScale;
    onUpdate(timestep, scaledDeltaMs, 0);
  };

  const api = {
    update,
    pause,
    start,
    stop,
    step,
    isRunning: () => isRunning,
    isPaused: () => isPaused,
    getDefaultTimestep,
  };

  return api;
};

export type UpdateLoop = ReturnType<typeof createUpdateLoop>;
