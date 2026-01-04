import { Boid } from "@/boids/vocabulary/schemas/entities";
import { RuntimeStore } from "@/boids/vocabulary/schemas/state";
import {
  createSharedBoidViews,
  SharedBoidBufferLayout,
  SharedBoidViews,
  StatsIndex,
} from "@/lib/sharedMemory";
import { createAtom } from "@/lib/state";
import { defineResource, StartedResource } from "braided";
import {
  createLocalBoidStore,
  syncBoidsToSharedMemory,
} from "../browser/localBoidStore";

export type WorkerStoreState = Pick<RuntimeStore, "config" | "simulation">;

const createBoidsStore = () => {
  const localStore = createLocalBoidStore();

  // Shared array buffers from client
  let sharedBuffer: SharedArrayBuffer | null = null;
  let bufferLayout: SharedBoidBufferLayout | null = null;
  let bufferViews: SharedBoidViews | null = null;

  const api = {
    getBoids: () => localStore.boids,
    addBoid: (boid: Boid) => {
      localStore.addBoid(boid);

      const bufferViews = api.getBufferViews();
      if (bufferViews) {
        Atomics.store(
          bufferViews.stats,
          StatsIndex.ALIVE_COUNT,
          localStore.count(),
        );
      }
    },
    removeBoid: (boidId: string) => {
      if (localStore.removeBoid(boidId)) {
        const bufferViews = api.getBufferViews();
        if (bufferViews) {
          Atomics.store(
            bufferViews.stats,
            StatsIndex.ALIVE_COUNT,
            localStore.count(),
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
    },

    // SharedArrayBuffer access (mutable, shared reference)
    getSharedBuffer: () => sharedBuffer,
    setSharedBuffer: (
      buffer: SharedArrayBuffer,
      layout: SharedBoidBufferLayout,
    ) => {
      sharedBuffer = buffer;
      bufferLayout = layout;
      bufferViews = createSharedBoidViews(buffer, layout);
    },
    getBufferLayout: () => bufferLayout,
    getBufferViews: () => bufferViews,
    reset: () => {
      localStore.clear();
      const bufferViews = api.getBufferViews();
      if (bufferViews) {
        Atomics.store(bufferViews.stats, StatsIndex.ALIVE_COUNT, 0);
        Atomics.store(bufferViews.stats, StatsIndex.FRAME_COUNT, 0);
      }
    },

    syncToSharedMemory: () => {
      const bufferViews = api.getBufferViews();
      if (!bufferViews) return;

      const boids = api.getBoids();
      syncBoidsToSharedMemory(bufferViews, boids);
    },
    count: () => localStore.count(),
  };

  return api;
};

export const createWorkerStore = (initialState: WorkerStoreState) =>
  defineResource({
    start: () => {
      const state = createAtom<WorkerStoreState>(initialState);
      const boidStore = createBoidsStore();

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
