import { defineResource } from "braided";
import {
  emergentSystem,
  type EventHandlerMap,
  type EffectExecutorMap,
} from "emergent";
import type { RuntimeStoreApi, StartedRuntimeStore } from "./runtimeStore";
import { eventKeywords, effectKeywords } from "../boids/vocabulary/keywords.ts";
import { produce } from "immer";
import type { TimerManager } from "./timer";
import type { BoidEngine } from "./engine";
import { RuntimeStore } from "../boids/vocabulary/schemas/state.ts";
import { AllEvents } from "../boids/vocabulary/schemas/events.ts";
import { AllEffects, ControlEffect } from "../boids/vocabulary/schemas/effects.ts";

// ============================================
// Event Handlers (Pure Functions)
// ============================================

type HandlerContext = {
  nextState: (
    current: RuntimeStore,
    mutation: (draft: RuntimeStore) => void
  ) => RuntimeStore;
};

const handlers = {
  [eventKeywords.controls.typeConfigChanged]: (
    state: RuntimeStore,
    event,
    ctx
  ) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          if (draft.config.species[event.typeId]) {
            draft.config.species[event.typeId].movement[event.field] =
              event.value;
          }
        }),
      },
    ];
  },

  [eventKeywords.controls.perceptionRadiusChanged]: (
    state: RuntimeStore,
    event,
    ctx
  ) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.config.parameters.perceptionRadius = event.value;
        }),
      },
    ];
  },

  [eventKeywords.controls.obstacleAvoidanceChanged]: (
    state: RuntimeStore,
    event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.config.parameters.obstacleAvoidanceWeight = event.value;
        }),
      },
    ];
  },

  [eventKeywords.obstacles.added]: (
    state: RuntimeStore,
    event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles.push({
            position: { x: event.x, y: event.y },
            radius: event.radius,
          });
        }),
      },
    ];
  },

  [eventKeywords.obstacles.removed]: (
    state: RuntimeStore,
    event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles.splice(event.index, 1);
        }),
      },
    ];
  },

  [eventKeywords.obstacles.cleared]: (
    state: RuntimeStore,
    _event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles = [];
        }),
      },
    ];
  },

  [eventKeywords.time.passed]: (): ControlEffect[] => {
    // This handler schedules the next tick
    // Energy updates are handled in lifecycleManager
    const effects: ControlEffect[] = [];

    // Schedule next tick
    effects.push({
      type: effectKeywords.timer.schedule,
      id: "energy-tick",
      delayMs: 1000,
      onExpire: {
        type: eventKeywords.time.passed,
        deltaMs: 1000,
      },
    });

    return effects;
  },

  [eventKeywords.boids.caught]: (_state, event) => {
    // Handled in lifecycleManager - just pass through
    return [
      // Boid got caught? He died! :( (predation death)
      {
        type: effectKeywords.runtime.dispatch,
        event: {
          type: eventKeywords.boids.died,
          boidId: event.preyId,
          typeId: event.preyTypeId,
          reason: "predation",
        },
      },
    ];
  },

  [eventKeywords.boids.died]: () => {
    // Handled in lifecycleManager - just pass through
    return [];
  },

  [eventKeywords.boids.reproduced]: () => {
    // Handled in lifecycleManager - just pass through
    return [];
  },

  [eventKeywords.boids.spawnPredator]: () => {
    // Spawn a predator at the specified position
    // This is handled in lifecycleManager
    return [];
  },

  [eventKeywords.boids.foodSourceCreated]: () => {
    // Food source creation is handled in lifecycleManager
    return [];
  },
} satisfies EventHandlerMap<
  AllEvents,
  AllEffects,
  RuntimeStore,
  HandlerContext
>;

// ============================================
// Effect Executors (Side Effects)
// ============================================

type ExecutorContext = {
  store: RuntimeStoreApi;
  timer: TimerManager;
  engine: BoidEngine;
};

const executors = {
  [effectKeywords.state.update]: (effect, ctx) => {
    ctx.store.setState(effect.state);
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
  engine: BoidEngine
) {
  const createControlLoop = emergentSystem<
    AllEvents,
    AllEffects,
    RuntimeStore,
    HandlerContext,
    ExecutorContext
  >();

  const runtime = createControlLoop({
    getState: () => store.getState(),
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
    },
  });

  return runtime;
}

export const runtimeController = defineResource({
  dependencies: ["runtimeStore", "timer", "engine"],
  start: ({
    runtimeStore,
    timer,
    engine,
  }: {
    runtimeStore: StartedRuntimeStore;
    timer: TimerManager;
    engine: BoidEngine;
  }) => {
    const controller = createRuntimeController(
      runtimeStore.store,
      timer,
      engine
    );

    // Start the energy tick timer
    controller.dispatch({
      type: eventKeywords.time.passed,
      deltaMs: 1000,
    });

    return controller;
  },
  halt: (controller) => {
    controller.dispose();
  },
});
