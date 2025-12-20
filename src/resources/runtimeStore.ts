import { defineResource, StartedResource } from "braided";
import { createStore } from "zustand/vanilla";
import { useStore as useZustandStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { BoidConfig } from "../boids/types";
import type { RuntimeState } from "../vocabulary/keywords";

export type RuntimeStore = {
  state: RuntimeState;
};

export type RuntimeStoreApi = StoreApi<RuntimeStore>;

export const runtimeStore = defineResource({
  dependencies: ["config"],
  start: ({ config }: { config: BoidConfig }) => {
    // Create zustand store with initial values from config
    const store = createStore<RuntimeStore>()(() => ({
      state: {
        perceptionRadius: config.perceptionRadius,
        obstacleAvoidanceWeight: config.obstacleAvoidanceWeight,
        obstacles: [],
        // Store mutable copies of type configs
        types: { ...config.types },
      },
    }));

    function useStore<T>(selector: (state: RuntimeStore) => T): T {
      return useZustandStore(store, selector);
    }

    return { store, useStore };
  },
  halt: () => {
    // No cleanup needed for zustand store
  },
});

export type StartedRuntimeStore = StartedResource<typeof runtimeStore>;