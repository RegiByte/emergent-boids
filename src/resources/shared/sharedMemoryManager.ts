import {
  calculateBufferLayout,
  createSharedBoidViews,
  SharedBoidBufferLayout,
} from "@/lib/sharedMemory";
import { createAtom } from "@/lib/state";
import { sharedMemoryKeywords } from "@/lib/workerTasks/vocabulary";
import { ExpandType } from "@/utils/types";
import { defineResource, StartedResource } from "braided";

type BufferLayout = Record<string, number>;

type BufferViews = {
  [key: string]: Uint32Array | Float32Array | Int32Array | Uint8Array;
};

type SharedMemoryInstance<TLayout, TViews> = {
  buffer: SharedArrayBuffer;
  layout: TLayout;
  views: TViews;
};

export type SharedMemoryDefinition<TLayout, TViews> = {
  initializeBuffer: (itemsCount: number) => {
    buffer: SharedArrayBuffer;
    layout: TLayout;
  };
  createLayout: (itemsCount: number) => TLayout;
  createViews: (buffer: SharedArrayBuffer, layout: TLayout) => TViews;
};

type InferMemoryType<Definition extends SharedMemoryDefinition<any, any>> =
  SharedMemoryInstance<
    ReturnType<Definition["createLayout"]>,
    ReturnType<Definition["createViews"]>
  >;

export function defineSharedMemory<
  TLayout extends BufferLayout,
  TViews extends BufferViews,
>(
  config: SharedMemoryDefinition<TLayout, TViews>
): SharedMemoryDefinition<TLayout, TViews> {
  return config;
}

type SharedMemoryMap = Record<string, SharedMemoryDefinition<any, any>>;

const boidsPhysicsMemory = defineSharedMemory({
  initializeBuffer: (itemsCount: number) => {
    const layout = calculateBufferLayout(itemsCount);
    const buffer = new SharedArrayBuffer(layout.totalBytes);
    return {
      buffer,
      layout,
    };
  },
  createLayout: (itemsCount: number) => {
    return calculateBufferLayout(itemsCount);
  },
  createViews: (buffer: SharedArrayBuffer, layout: SharedBoidBufferLayout) => {
    return createSharedBoidViews(buffer, layout);
  },
});
export type BoidsPhysicsMemory = InferMemoryType<typeof boidsPhysicsMemory>;

const definitions = {
  [sharedMemoryKeywords.boidsPhysics]: boidsPhysicsMemory,
} as const satisfies SharedMemoryMap;

type SharedMemoryKeys = keyof typeof definitions;

type SharedMemoryInstances = {
  [Key in SharedMemoryKeys]: ExpandType<
    InferMemoryType<(typeof definitions)[Key]>
  >;
};

/**
 * Shared Memory Manager resource
 *
 * Handles the creation and management of shared memory buffers.
 *
 * Buffers are created in one thread, and shared with other threads.
 *
 * The creating thread initializes the memory and transfers it to other threads.
 */

export const sharedMemoryManager = defineResource({
  dependencies: [],
  start: () => {
    const sharedMemoryStore = createAtom<{
      instances: SharedMemoryInstances;
    }>({
      instances: {} as SharedMemoryInstances,
    });

    const api = {
      // Called by the thread that creates the memory
      initialize: (memoryKey: SharedMemoryKeys, initialSize: number) => {
        const definition = definitions[memoryKey];
        if (!definition) {
          throw new Error(
            `Shared memory definition not found for ${memoryKey}`
          );
        }
        const memory = {
          ...definition.initializeBuffer(initialSize),
        } as InferMemoryType<typeof definition>;
        memory.views = definition.createViews(memory.buffer, memory.layout);
        // const memory = definitions[memoryKey].initialize(initialSize);
        sharedMemoryStore.mutate((state) => {
          state.instances[memoryKey] = memory;
        });
        return memory;
      },
      // Called by the thread that receives the memory and operates on it
      attach: <K extends SharedMemoryKeys>(
        memoryKey: K,
        buffer: SharedArrayBuffer,
        layout: ReturnType<(typeof definitions)[K]["createLayout"]>
      ) => {
        const definition = definitions[memoryKey];
        if (!definition) {
          throw new Error(
            `Shared memory definition not found for ${memoryKey}`
          );
        }
        const views = definition.createViews(buffer, layout);
        const memory = {
          buffer,
          layout,
          views,
        };
        sharedMemoryStore.mutate((state) => {
          state.instances[memoryKey] = memory;
        });
        return memory as InferMemoryType<(typeof definitions)[K]>;
      },
      get: (memoryKey: SharedMemoryKeys) => {
        const definition = definitions[memoryKey];
        if (!definition) {
          throw new Error(
            `Shared memory definition not found for ${memoryKey}`
          );
        }
        const instances = sharedMemoryStore.get().instances;
        return instances[memoryKey] as (typeof instances)[typeof memoryKey];
      },
      remove: (memoryKey: SharedMemoryKeys) => {
        sharedMemoryStore.mutate((state) => {
          if (memoryKey in state.instances) {
            state.instances[memoryKey] =
              undefined as unknown as InferMemoryType<
                (typeof definitions)[typeof memoryKey]
              >;
          }
        });
      },
      cleanup: () => {
        for (const memoryKey in sharedMemoryStore.get().instances) {
          api.remove(memoryKey as SharedMemoryKeys);
        }
      },
    };

    return api;
  },
  halt: (manager) => {
    manager.cleanup();
  },
});

export type SharedMemoryManager = StartedResource<typeof sharedMemoryManager>;
