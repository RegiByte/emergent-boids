import { defineResource, StartedResource } from 'braided'
import { WorkerStoreResource } from './workerStore'

/**
 * Compatibility resource to replace runtimeStore for randomness seed collection
 */
export const workerRuntimeStore = defineResource({
  dependencies: ['workerStore'],
  start: ({ workerStore }: { workerStore: WorkerStoreResource }) => {
    return workerStore
  },
  halt: () => {},
})

export type WorkerRuntimeStoreResource = StartedResource<
  typeof workerRuntimeStore
>
