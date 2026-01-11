/**
 * Parallel Simulation Test Route
 *
 * Side-by-side comparison of:
 * - Current engine (main thread)
 * - Shared engine (worker thread + SharedArrayBuffer)
 *
 * Tests the drop-in replacement architecture.
 */

import SimulationView from '@/components/SimulationView'
import { parallelManager, useParallelSystem } from '@/systems/parallel'
import { SystemProvider } from '@/systems/standard'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/parallel-test')({
  component: ParallelTestRoute,
  beforeLoad: async () => {
    try {
      const system = await parallelManager.getSystem()
      console.log('[ParallelTest] System loaded:', system)
    } catch (error) {
      console.error('[ParallelTest] Error loading parallel system:', error)
      return {
        error: 'Failed to load parallel system',
      }
    }
  },
})

function ParallelTestRoute() {
  const parallelSystem = useParallelSystem()
  return (
    <SystemProvider system={parallelSystem}>
      <SimulationView />
    </SystemProvider>
  )
}
