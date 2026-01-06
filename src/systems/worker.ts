import { frameRater } from "@/resources/shared/frameRater";
import { profiler } from "@/resources/shared/profiler";
import { randomness } from "@/resources/shared/randomness";
import { sharedMemoryManager } from "@/resources/shared/sharedMemoryManager";
import { time } from "@/resources/shared/time";
import { workerEngine } from "@/resources/worker/workerEngine";
import { workerSimulation } from "@/resources/worker/workerSimulation";
import {
  createWorkerStore,
  WorkerStoreState,
} from "@/resources/worker/workerStore";
import { workerUpdateLoop } from "@/resources/worker/workerUpdateLoop";
import { StartedSystem } from "braided";

export const workerSystemConfig = (initialState: WorkerStoreState) => {
  return {
    workerTime: time,
    workerStore: createWorkerStore(initialState),
    workerEngine,
    workerProfiler: profiler,
    workerRandomness: randomness,
    workerSimulation: workerSimulation,
    // workerLifecycleManager: workerLifecycleManager,
    workerFrameRater: frameRater,
    workerUpdateLoop: workerUpdateLoop,
    workerSharedMemoryManager: sharedMemoryManager,
    // runtimeStore: workerRuntimeStore,
  };
};

export type WorkerSystem = StartedSystem<ReturnType<typeof workerSystemConfig>>;