/**
 * Event type keywords
 * Use these instead of raw strings for better type safety
 */
export const eventKeywords = {
  taskRequest: 'task/request',

  workerReady: 'worker/ready',
  taskProgress: 'task/progress',
  taskComplete: 'task/complete',
  taskError: 'task/error',
} as const

/**
 * Effect type keywords
 */
export const effectKeywords = {
  client: {
    forwardToWorker: 'client/forwardToWorker',
    log: 'client/log',
    flushQueue: 'client/flushQueue',
  },
  worker: {
    forwardToClient: 'worker/forwardToClient',
    log: 'worker/log',
    executeTask: 'worker/executeTask',
  },
} as const

export const clientStatusKeywords = {
  initializing: 'initializing',
  waitingForReady: 'waitingForReady',
  ready: 'ready',
  error: 'error',
  terminated: 'terminated',
} as const

export const sharedMemoryKeywords = {
  boidsPhysics: 'boidsPhysics',
} as const
