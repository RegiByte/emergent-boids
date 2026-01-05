import { defineResource } from "braided";
import {
  emergentSystem,
  type EventHandlerMap,
  type EffectExecutorMap,
} from "emergent";
import type { RuntimeStoreApi, RuntimeStoreResource } from "./runtimeStore.ts";
import type { AnalyticsStoreResource } from "./analyticsStore.ts";
import type { ProfileStoreResource } from "./profileStore.ts";
import type { RandomnessResource } from "../shared/randomness.ts";
import {
  eventKeywords,
  effectKeywords,
} from "../../boids/vocabulary/keywords.ts";
import { produce } from "immer";
import type { TimerManager } from "../shared/timer.ts";
import type { BoidEngine } from "./engine.ts";
import { RuntimeStore } from "../../boids/vocabulary/schemas/state.ts";
import { AllEvents } from "../../boids/vocabulary/schemas/events.ts";
import {
  AllEffects,
  ControlEffect,
} from "../../boids/vocabulary/schemas/effects.ts";
import { LocalBoidStoreResource } from "./localBoidStore.ts";
import { Boid } from "@/boids/vocabulary/schemas/entities.ts";

// ============================================
// Event Handlers (Pure Functions)
// ============================================

type HandlerContext = {
  nextState: (
    _current: RuntimeStore,
    _mutation: (_draft: RuntimeStore) => void
  ) => RuntimeStore;
  nextSpawnId: () => string;
};

const handlers = {
  [eventKeywords.controls.typeConfigChanged]: (
    state: RuntimeStore,
    event,
    ctx
  ) => {
    // Note: This handler now updates genome traits instead of movement params
    // Fields should be trait names like 'speed', 'force', 'sociability', etc.
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          if (draft.config.species[event.typeId]?.baseGenome?.traits) {
            const traits = draft.config.species[event.typeId].baseGenome
              .traits as Record<string, number>;
            if (event.field in traits) {
              traits[event.field] = event.value;
            }
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
  ) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.config.parameters.obstacleAvoidanceWeight = event.value;
        }),
      },
    ];
  },

  [eventKeywords.obstacles.added]: (state: RuntimeStore, event, ctx) => {
    const newId = ctx.nextSpawnId();
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles.push({
            id: newId,
            position: { x: event.x, y: event.y },
            radius: event.radius,
          });
        }),
      },
    ];
  },

  [eventKeywords.obstacles.removed]: (state: RuntimeStore, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles.splice(event.index, 1);
        }),
      },
    ];
  },

  [eventKeywords.obstacles.cleared]: (state: RuntimeStore, _event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles = [];
        }),
      },
    ];
  },

  [eventKeywords.time.passed]: () => {
    // This handler no longer auto-schedules the next tick
    // Instead, the updateLoop dispatches time.passed events directly
    // based on simulation time (respects pause/scale)
    // Energy updates are handled in lifecycleManager
    return [];
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

  [eventKeywords.boids.died]: (_state, event) => {
    // When worker reports a boid died, sync the state to local boid store (Session 115)
    return [
      {
        type: effectKeywords.localBoidStore.syncWorkerState,
        updates: [
          {
            id: event.boidId,
            isDead: true,
          },
        ],
      },
    ];
  },

  [eventKeywords.boids.workerStateUpdated]: (_state: RuntimeStore, event) => {
    return [
      {
        type: effectKeywords.localBoidStore.syncWorkerState,
        updates: event.updates,
      },
    ];
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

  [eventKeywords.ui.sidebarToggled]: (state: RuntimeStore, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.ui.sidebarOpen = event.open;
        }),
      },
    ];
  },

  [eventKeywords.ui.headerToggled]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.ui.headerCollapsed = event.collapsed;
        }),
      },
    ];
  },

  [eventKeywords.profile.switched]: (_state, event, _ctx) => {
    // Profile switching - load new profile configuration
    // This triggers a full simulation reset through engine
    return [
      {
        type: effectKeywords.profile.load,
        profileId: event.profileId,
      },
    ];
  },

  [eventKeywords.atmosphere.eventStarted]: (
    state: RuntimeStore,
    event,
    ctx
  ) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          const baseSettings = draft.ui.visualSettings.atmosphere.base;
          const settings = {
            trailAlpha: event.settings?.trailAlpha ?? baseSettings.trailAlpha,
            fogColor: event.settings?.fogColor ?? baseSettings.fogColor,
            fogIntensity:
              event.settings?.fogIntensity ?? baseSettings.fogIntensity,
            fogOpacity: event.settings?.fogOpacity ?? baseSettings.fogOpacity,
          };
          draft.ui.visualSettings.atmosphere.activeEvent = {
            eventType: event.eventType,
            settings,
            startedAt: Date.now(),
            minDurationTicks: event.minDurationTicks,
          };
        }),
      },
    ];
  },

  [eventKeywords.atmosphere.eventEnded]: (
    state: RuntimeStore,
    event,
    ctx
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          // Only clear if the ended event matches the active one
          if (
            draft.ui.visualSettings.atmosphere.activeEvent?.eventType ===
            event.eventType
          ) {
            draft.ui.visualSettings.atmosphere.activeEvent = null;
          }
        }),
      },
    ];
  },

  [eventKeywords.analytics.filterChanged]: (
    _state: RuntimeStore,
    event
  ): ControlEffect[] => {
    // Analytics filter changes are now handled by analyticsStore
    // We dispatch a special effect to update it
    return [
      {
        type: effectKeywords.analytics.updateFilter,
        maxEvents: event.maxEvents,
        allowedEventTypes: event.allowedEventTypes,
      },
    ];
  },

  [eventKeywords.analytics.filterCleared]: () => {
    // Analytics filter clear is now handled by analyticsStore
    return [
      {
        type: effectKeywords.analytics.clearFilter,
      },
    ];
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
  analyticsStore: AnalyticsStoreResource;
  profileStore: ProfileStoreResource;
  randomness: RandomnessResource;
  timer: TimerManager;
  engine: BoidEngine;
  localBoidStore: LocalBoidStoreResource; // Will be injected (Session 115)
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

  [effectKeywords.analytics.updateFilter]: (effect, ctx) => {
    ctx.analyticsStore.updateEventsFilter(
      effect.maxEvents,
      effect.allowedEventTypes
    );
  },

  [effectKeywords.analytics.clearFilter]: (_effect, ctx) => {
    ctx.analyticsStore.clearEventsFilter();
  },

  [effectKeywords.profile.load]: (effect, ctx) => {
    // Load profile from profileStore
    const profile = ctx.profileStore.getProfileById(effect.profileId);
    if (!profile) {
      console.error(`[profile:load] Profile not found: ${effect.profileId}`);
      return;
    }

    console.log(
      `[profile:load] Loading profile: ${profile.name} (${profile.id})`
    );

    // Update profileStore active profile
    ctx.profileStore.setActiveProfile(effect.profileId);

    // Update randomness seed
    ctx.randomness.setSeed(profile.seed);

    // Load profile into runtimeStore (updates config)
    const currentState = ctx.store.getState();
    ctx.store.setState({
      config: {
        profileId: profile.id,
        randomSeed: profile.seed,
        world: profile.world,
        species: profile.species,
        parameters: profile.parameters,
        physics: profile.physics ?? currentState.config.physics,
      },
      // Reset simulation state
      simulation: {
        obstacles: [],
        foodSources: [],
        deathMarkers: [],
      },
      // Keep UI preferences
      ui: currentState.ui,
    });

    // Reset engine (respawn boids with new species)
    ctx.engine.reset();

    console.log(`[profile:load] Profile loaded successfully: ${profile.name}`);
  },

  [effectKeywords.localBoidStore.syncWorkerState]: (effect, ctx) => {
    // Sync worker state updates to local boid store (Session 115)
    if (!ctx.localBoidStore) {
      console.warn(
        "[localBoidStore:syncWorkerState] localBoidStore not available"
      );
      return;
    }
    // console.log("[localBoidStore:syncWorkerState] Syncing worker state");
    // console.log(effect.updates);

    const localStore = ctx.localBoidStore.store;

    effect.updates.forEach((boid) => {
      if (!boid || !boid.id) {
        console.warn(
          `[localBoidStore:syncWorkerState] Boid not found: ${boid.id}`
        );
        return;
      }

      const boidId = boid.id;
      localStore.updateBoid(boidId, (local) => {
        for (const key in boid) {
          if (key in local) {
            (local as any)[key] = boid[key as keyof Boid];
          }
        }

        if (boid.isDead) {
          ctx.engine.removeBoid(boidId);
        }
      });
    });
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
  analyticsStore: AnalyticsStoreResource,
  profileStore: ProfileStoreResource,
  randomness: RandomnessResource,
  timer: TimerManager,
  engine: BoidEngine,
  localBoidStore: LocalBoidStoreResource
) {
  const createControlLoop = emergentSystem<
    AllEvents,
    AllEffects,
    RuntimeStore,
    HandlerContext,
    ExecutorContext
  >();

  const spawnRandomness = randomness.domain("spawn");

  const nextSpawnId = () => {
    const now = performance.now();
    const id = spawnRandomness.intRange(10_000, 99_999);
    return `spawn-${now}-${id}`;
  };

  const runtime = createControlLoop({
    getState: () => store.getState(),
    handlers,
    executors: executors,
    handlerContext: {
      nextState: (current, mutation) => {
        return produce(current, mutation);
      },
      nextSpawnId,
    },
    executorContext: {
      store,
      analyticsStore,
      profileStore,
      randomness,
      timer,
      engine,
      localBoidStore,
    },
  });

  return runtime;
}

export const runtimeController = defineResource({
  dependencies: [
    "runtimeStore",
    "analyticsStore",
    "profileStore",
    "randomness",
    "timer",
    "engine",
    "localBoidStore",
  ],
  start: ({
    runtimeStore,
    analyticsStore,
    profileStore,
    randomness,
    timer,
    engine,
    localBoidStore,
  }: {
    runtimeStore: RuntimeStoreResource;
    analyticsStore: AnalyticsStoreResource;
    profileStore: ProfileStoreResource;
    randomness: RandomnessResource;
    timer: TimerManager;
    engine: BoidEngine;
    localBoidStore: LocalBoidStoreResource;
  }) => {
    console.log("Starting runtime controller");
    const controller = createRuntimeController(
      runtimeStore.store,
      analyticsStore,
      profileStore,
      randomness,
      timer,
      engine,
      localBoidStore
    );

    engine.eventSubscription.subscribe((event) => {
      controller.dispatch(event);
    });

    // Note: time.passed events are now dispatched by the renderer
    // based on simulation time (respects pause/scale)
    // No need to start a timer here

    return controller;
  },
  halt: (controller) => {
    controller.dispose();
  },
});
