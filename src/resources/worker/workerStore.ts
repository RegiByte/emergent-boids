import { syncBoidIdCounter } from "@/boids/boid";
import { Boid } from "@/boids/vocabulary/schemas/entities";
import { RuntimeStore } from "@/boids/vocabulary/schemas/state";
import {
  SharedBoidBufferLayout,
  SharedBoidViews,
  StatsIndex
} from "@/lib/sharedMemory";
import { createAtom } from "@/lib/state";
import { sharedMemoryKeywords } from "@/lib/workerTasks/vocabulary";
import { defineResource, StartedResource } from "braided";
import {
  createLocalBoidStore,
  syncBoidsToSharedMemory,
} from "../browser/localBoidStore";
import { SharedMemoryManager } from "../shared/sharedMemoryManager";

export type WorkerStoreState = Pick<RuntimeStore, "config" | "simulation">;

const createBoidsStore = (sharedMemoryManager: SharedMemoryManager) => {
  const localStore = createLocalBoidStore();

  // Shared array buffers from client
  // let sharedBuffer: SharedArrayBuffer | null = null;
  // let bufferLayout: SharedBoidBufferLayout | null = null;
  // let bufferViews: SharedBoidViews | null = null;

  const api = {
    getBoids: () => localStore.boids,
    addBoid: (boid: Boid) => {
      localStore.addBoid(boid);

      const bufferViews = api.getBufferViews();
      if (bufferViews) {
        Atomics.store(
          bufferViews.stats as Uint32Array,
          StatsIndex.ALIVE_COUNT,
          localStore.count()
        );
      }
    },
    removeBoid: (boidId: string) => {
      if (localStore.removeBoid(boidId)) {
        const bufferViews = api.getBufferViews();
        if (bufferViews) {
          Atomics.store(
            bufferViews.stats as Uint32Array,
            StatsIndex.ALIVE_COUNT,
            localStore.count()
          );
        }
      }
    },
    getBoidById: (id: string) => localStore.getBoidById(id),
    setBoids: (newBoids: Boid[]) => {
      localStore.clear();
      for (const boid of newBoids) {
        localStore.addBoid(boid);
      }
      // Session 124: CRITICAL - Sync boid ID counter to prevent duplicate IDs!
      // The worker has its own copy of the boidIdCounter module variable,
      // so we need to sync it with the highest ID we received from the browser.
      syncBoidIdCounter(newBoids);
    },

    // SharedArrayBuffer access (mutable, shared reference)
    getSharedBuffer: () =>
      sharedMemoryManager.get(sharedMemoryKeywords.boidsPhysics),
    setSharedBuffer: (
      buffer: SharedArrayBuffer,
      layout: SharedBoidBufferLayout
    ) => {
      sharedMemoryManager.attach(
        sharedMemoryKeywords.boidsPhysics,
        buffer,
        layout
      );
    },
    getBufferLayout: () =>
      sharedMemoryManager.get(sharedMemoryKeywords.boidsPhysics).layout,
    getBufferViews: () =>
      sharedMemoryManager.get(sharedMemoryKeywords.boidsPhysics).views as unknown as SharedBoidViews,
    reset: () => {
      localStore.clear();
      const bufferViews = sharedMemoryManager.get(
        sharedMemoryKeywords.boidsPhysics
      ).views as unknown as SharedBoidViews;
      if (bufferViews) {
        Atomics.store(bufferViews.stats as Uint32Array, StatsIndex.ALIVE_COUNT, 0);
        Atomics.store(bufferViews.stats as Uint32Array, StatsIndex.FRAME_COUNT, 0);
      }
    },

    syncToSharedMemory: () => {
      const bufferViews = api.getBufferViews();
      if (!bufferViews) return;

      const boids = api.getBoids();
      syncBoidsToSharedMemory(bufferViews, boids);
    },
    count: () => localStore.count(),
    nextIndex: () => localStore.nextIndex(),
    
    // Session 121: Memory stats for monitoring
    getMemoryStats: () => localStore.getMemoryStats(),
  };

  return api;
};

export const createWorkerStore = (initialState: WorkerStoreState) =>
  defineResource({
    dependencies: ["workerSharedMemoryManager"],
    start: ({
      workerSharedMemoryManager,
    }: {
      workerSharedMemoryManager: SharedMemoryManager;
    }) => {
      const state = createAtom<WorkerStoreState>(initialState);
      const boidStore = createBoidsStore(workerSharedMemoryManager);

      const storeApi = {
        getState: () => state.get(),
        setState: (newState: WorkerStoreState) => state.set(newState),
        updateState: (updater: (state: WorkerStoreState) => WorkerStoreState) =>
          state.update(updater),
      };

      const api = {
        store: storeApi,
        setState: storeApi.setState,
        getState: storeApi.getState,
        boids: boidStore,
      };

      return api;
    },
    halt: () => {},
  });

export type WorkerStoreResource = StartedResource<
  ReturnType<typeof createWorkerStore>
>;
