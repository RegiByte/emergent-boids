import { RenderMode } from '@/boids/vocabulary/schemas/primitives'
import { createAtom } from '@/lib/state'
import { defineResource, StartedResource } from 'braided'

export type SystemConfig = {
  renderMode: RenderMode
  usesSharedMemory: boolean
}

/**
 * We have a separate system config resource to allow for different parts of the system (e.g render mode, shared memory usage, etc.)
 * change their behavior over time based based on conditions that are not related to the simulation itself.
 */
export const createSystemConfigResource = (initialConfig: SystemConfig) => {
  return defineResource({
    start: () => {
      const config = createAtom({
        renderMode: initialConfig.renderMode,
        usesSharedMemory: initialConfig.usesSharedMemory,
      })

      const api = {
        getConfig: () => config.get(),
        updateConfig: (newConfig: SystemConfig) => config.set(newConfig),
        reset: () => config.set(initialConfig),
      }

      return api
    },
    halt: () => {},
  })
}

export type SystemConfigResource = StartedResource<
  ReturnType<typeof createSystemConfigResource>
>
