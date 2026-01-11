/**
 * Demo Tasks Worker
 *
 * Worker thread using the worker tasks abstraction.
 * This file is incredibly simple - just start the generated system!
 */

import { startSystem, haltSystem } from 'braided'
import { workerSystemConfig } from './demoTasks'
import type { StartedSystem } from 'braided'

console.log('🚀 [Demo Worker] Starting...')

let startedSystem: StartedSystem<typeof workerSystemConfig> | null = null

startSystem(workerSystemConfig)
  .then(({ system, errors, topology }) => {
    if (errors.size > 0) {
      console.error('❌ [Demo Worker] System started with errors:')
      errors.forEach((error, resourceId) => {
        console.error(`  - ${resourceId}:`, error)
      })

      startedSystem = system

      self.postMessage({
        type: 'worker/error',
        message: `System started with ${errors.size} error(s)`,
      })
      return
    }

    startedSystem = system

    console.log('📊 [Demo Worker] Topology:', topology)

    self.postMessage({
      type: 'worker/ready',
      timestamp: Date.now(),
    })

    console.log('🎉 [Demo Worker] Ready!')
  })
  .catch((error: unknown) => {
    console.error('❌ [Demo Worker] Failed to start system:', error)

    self.postMessage({
      type: 'worker/error',
      message: String(error),
    })
  })

self.addEventListener('close', () => {
  console.log('🛑 [Demo Worker] Closing...')

  if (startedSystem) {
    haltSystem(workerSystemConfig, startedSystem).catch((error: unknown) => {
      console.error('[Demo Worker] Error halting system:', error)
    })
  }
})
