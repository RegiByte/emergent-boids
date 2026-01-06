import { Force } from "./boid";
import { AllEvents, LifecycleEvent } from "./vocabulary/schemas/events";

export const createCollector = <T>() => {
  const items: T[] = [];
  return {
    items,
    collect: (item: T) => {
      items.push(item);
    },
    reset: () => {
      items.length = 0;
    },
  };
};

export const createEventCollector = <T = AllEvents>() => {
  return createCollector<T>();
};

export const createForceCollector = () => {
  return createCollector<Force>();
};

export const createLifecycleCollector = () => {
  return createCollector<LifecycleEvent>();
};

export type EventCollector<T> = ReturnType<typeof createEventCollector<T>>;
export type CollectEventCallback<T extends EventCollector<any>> = T["collect"];
export type ForceCollector = ReturnType<typeof createForceCollector>;
export type LifecycleCollector = ReturnType<typeof createLifecycleCollector>;