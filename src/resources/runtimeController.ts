import { defineResource } from "braided";
import {
  emergentSystem,
  type EventHandlerMap,
  type EffectExecutorMap,
} from "emergent";
import type { RuntimeStoreApi, StartedRuntimeStore } from "./runtimeStore";
import {
  eventKeywords,
  effectKeywords,
  type AllEvents,
  type ControlEffect,
  type RuntimeState,
  AllEffects,
} from "../vocabulary/keywords";
import { produce } from "immer";
import type { TimerManager } from "./timer";
import type { BoidEngine } from "./engine";
import type { BoidConfig } from "../boids/types";

// ============================================
// Event Handlers (Pure Functions)
// ============================================

type HandlerContext = {
  nextState: (
    current: RuntimeState,
    mutation: (draft: RuntimeState) => void
  ) => RuntimeState;
};

const handlers = {
  [eventKeywords.controls.typeConfigChanged]: (
    _state,
    event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(_state, (draft) => {
          if (draft.types[event.typeId]) {
            draft.types[event.typeId][event.field] = event.value;
          }
        }),
      },
    ];
  },

  [eventKeywords.controls.perceptionRadiusChanged]: (
    _state,
    event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(_state, (draft) => {
          draft.perceptionRadius = event.value;
        }),
      },
    ];
  },

  [eventKeywords.controls.obstacleAvoidanceChanged]: (
    _state,
    event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(_state, (draft) => {
          draft.obstacleAvoidanceWeight = event.value;
        }),
      },
    ];
  },

  [eventKeywords.obstacles.added]: (_state, event, ctx): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(_state, (draft) => {
          draft.obstacles.push({
            position: { x: event.x, y: event.y },
            radius: event.radius,
          });
        }),
      },
    ];
  },

  [eventKeywords.obstacles.removed]: (_state, event, ctx): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(_state, (draft) => {
          draft.obstacles.splice(event.index, 1);
        }),
      },
    ];
  },

  [eventKeywords.obstacles.cleared]: (_state, _event, ctx): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(_state, (draft) => {
          draft.obstacles = [];
        }),
      },
    ];
  },

  [eventKeywords.time.passage]: (): ControlEffect[] => {
    // This handler schedules the next tick
    // Energy updates are handled in lifecycleManager
    const effects: ControlEffect[] = [];

    // Schedule next tick
    effects.push({
      type: effectKeywords.timer.schedule,
      id: "energy-tick",
      delayMs: 1000,
      onExpire: {
        type: eventKeywords.time.passage,
        deltaMs: 1000,
      },
    });

    return effects;
  },

  [eventKeywords.boids.caught]: (): ControlEffect[] => {
    // Handled in lifecycleManager - just pass through
    return [];
  },

  [eventKeywords.boids.died]: (): ControlEffect[] => {
    // Handled in lifecycleManager - just pass through
    return [];
  },

  [eventKeywords.boids.reproduced]: (): ControlEffect[] => {
    // Handled in lifecycleManager - just pass through
    return [];
  },

  [eventKeywords.boids.spawnPredator]: (): ControlEffect[] => {
    // Spawn a predator at the specified position
    // This is handled in lifecycleManager
    return [];
  },

  [eventKeywords.boids.foodSourceCreated]: (): ControlEffect[] => {
    // Food source creation is handled in lifecycleManager
    return [];
  },
} satisfies EventHandlerMap<
  AllEvents,
  ControlEffect,
  RuntimeState,
  HandlerContext
>;

// ============================================
// Effect Executors (Side Effects)
// ============================================

type ExecutorContext = {
  store: RuntimeStoreApi;
  timer: TimerManager;
  engine: BoidEngine;
  config: BoidConfig;
};

const executors = {
  [effectKeywords.state.update]: (effect, ctx) => {
    ctx.store.setState({
      state: {
        ...ctx.store.getState().state,
        ...effect.state,
      },
    });
  },

  [effectKeywords.timer.schedule]: (effect, ctx) => {
    ctx.timer.schedule(effect.id, effect.delayMs, () => {
      ctx.dispatch(effect.onExpire);
    });
  },

  [effectKeywords.timer.cancel]: (effect, ctx) => {
    ctx.timer.cancel(effect.id);
  },

  [effectKeywords.engine.addBoid]: (effect, ctx) => {
    ctx.engine.addBoid(effect.boid);
  },

  [effectKeywords.engine.removeBoid]: (effect, ctx) => {
    ctx.engine.removeBoid(effect.boidId);
  },

  [effectKeywords.runtime.dispatch]: (effect, ctx) => {
    ctx.dispatch(effect.event);
  },
} satisfies EffectExecutorMap<AllEffects, AllEvents, ExecutorContext>;

// ============================================
// Runtime Controller Resource
// ============================================

export type RuntimeController = ReturnType<typeof createRuntimeController>;

function createRuntimeController(
  store: RuntimeStoreApi,
  timer: TimerManager,
  engine: BoidEngine,
  config: BoidConfig
) {
  const createControlLoop = emergentSystem<
    AllEvents,
    ControlEffect,
    RuntimeState,
    HandlerContext,
    ExecutorContext
  >();

  const runtime = createControlLoop({
    getState: () => store.getState().state,
    handlers,
    executors: executors,
    handlerContext: {
      nextState: (current, mutation) => {
        return produce(current, mutation);
      },
    },
    executorContext: {
      store,
      timer,
      engine,
      config,
    },
  });

  return runtime;
}

export const runtimeController = defineResource({
  dependencies: ["runtimeStore", "timer", "engine", "config"],
  start: ({
    runtimeStore,
    timer,
    engine,
    config,
  }: {
    runtimeStore: StartedRuntimeStore;
    timer: TimerManager;
    engine: BoidEngine;
    config: BoidConfig;
  }) => {
    const controller = createRuntimeController(
      runtimeStore.store,
      timer,
      engine,
      config
    );

    // Start the energy tick timer
    controller.dispatch({
      type: eventKeywords.time.passage,
      deltaMs: 1000,
    });

    return controller;
  },
  halt: (controller) => {
    controller.dispose();
  },
});
