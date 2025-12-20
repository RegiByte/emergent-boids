import { defineResource } from "braided";
import {
  emergentSystem,
  type EventHandlerMap,
  type EffectExecutorMap,
} from "emergent";
import type {
  RuntimeStoreApi,
  StartedRuntimeStore,
} from "./runtimeStore";
import {
  eventKeywords,
  effectKeywords,
  type AllEvent,
  type ControlEffect,
  type RuntimeState,
} from "../vocabulary/keywords";
import { produce } from "immer";

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

  [eventKeywords.obstacles.added]: (
    _state,
    event,
    ctx
  ): ControlEffect[] => {
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

  [eventKeywords.obstacles.removed]: (
    _state,
    event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(_state, (draft) => {
          draft.obstacles.splice(event.index, 1);
        }),
      },
    ];
  },

  [eventKeywords.obstacles.cleared]: (
    _state,
    _event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(_state, (draft) => {
          draft.obstacles = [];
        }),
      },
    ];
  },
} satisfies EventHandlerMap<
  AllEvent,
  ControlEffect,
  RuntimeState,
  HandlerContext
>;

// ============================================
// Effect Executors (Side Effects)
// ============================================

type ExecutorContext = {
  store: RuntimeStoreApi;
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
} satisfies EffectExecutorMap<ControlEffect, AllEvent, ExecutorContext>;

// ============================================
// Runtime Controller Resource
// ============================================

export type RuntimeController = ReturnType<typeof createRuntimeController>;

function createRuntimeController(store: RuntimeStoreApi) {
  const createControlLoop = emergentSystem<
    AllEvent,
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
    },
  });

  return runtime;
}

export const runtimeController = defineResource({
  dependencies: ["runtimeStore"],
  start: ({ runtimeStore }: { runtimeStore: StartedRuntimeStore }) => {
    return createRuntimeController(runtimeStore.store);
  },
  halt: () => {
    // Runtime cleanup handled automatically
  },
});
