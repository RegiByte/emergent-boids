import { defineResource } from 'braided'
import {
  emergentSystem,
  type EventHandlerMap,
  type EffectExecutorMap,
} from 'emergent'
import type { RuntimeStoreApi, RuntimeStoreResource } from './runtimeStore.ts'
import type { AnalyticsStoreResource } from './analyticsStore.ts'
import type { ProfileStoreResource } from './profileStore.ts'
import type { RandomnessResource } from '../shared/randomness.ts'
import {
  eventKeywords,
  effectKeywords,
  simulationKeywords,
} from '../../boids/vocabulary/keywords.ts'
import { produce } from 'immer'
import type { TimerManager } from '../shared/timer.ts'
import type { BoidEngine } from './engine.ts'
import { RuntimeStore } from '../../boids/vocabulary/schemas/state.ts'
import { AllEvents } from '../../boids/vocabulary/schemas/events.ts'
import {
  AllEffects,
  ControlEffect,
} from '../../boids/vocabulary/schemas/effects.ts'
import { LocalBoidStoreResource } from './localBoidStore.ts'
import {
  Boid,
  FoodSource,
  Obstacle,
} from '@/boids/vocabulary/schemas/entities.ts'

type HandlerContext = {
  nextState: (
    _current: RuntimeStore,
    _mutation: (_draft: RuntimeStore) => void
  ) => RuntimeStore
  nextSpawnId: () => string
}

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
          if (draft.config.species[event.typeId]?.baseGenome?.traits) {
            const traits = draft.config.species[event.typeId].baseGenome
              .traits as Record<string, number>
            if (event.field in traits) {
              traits[event.field] = event.value
            }
          }
        }),
      },
    ]
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
          draft.config.parameters.perceptionRadius = event.value
        }),
      },
    ]
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
          draft.config.parameters.obstacleAvoidanceWeight = event.value
        }),
      },
    ]
  },

  [eventKeywords.obstacles.added]: (state: RuntimeStore, event, ctx) => {
    const newId = ctx.nextSpawnId()
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles.push({
            id: newId,
            position: { x: event.x, y: event.y },
            radius: event.radius,
          })
        }),
      },
    ]
  },

  [eventKeywords.obstacles.removed]: (state: RuntimeStore, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles.splice(event.index, 1)
        }),
      },
    ]
  },

  [eventKeywords.obstacles.cleared]: (state: RuntimeStore, _event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles = []
        }),
      },
    ]
  },

  [eventKeywords.time.passed]: () => {
    return []
  },

  [eventKeywords.boids.caught]: (_state, event) => {
    return [
      {
        type: effectKeywords.runtime.dispatch,
        event: {
          type: eventKeywords.boids.died,
          boidId: event.preyId,
          typeId: event.preyTypeId,
          reason: 'predation',
        },
      },
    ]
  },

  [eventKeywords.boids.died]: (_state, event) => {
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
    ]
  },

  [eventKeywords.boids.workerStateUpdated]: (_state: RuntimeStore, event) => {
    return [
      {
        type: effectKeywords.localBoidStore.syncWorkerState,
        updates: event.updates,
      },
    ]
  },

  [eventKeywords.boids.reproduced]: (_state, _event) => {
    return []
  },

  [eventKeywords.boids.spawnPredator]: () => {
    return []
  },

  [eventKeywords.boids.foodSourceCreated]: () => {
    return []
  },

  [eventKeywords.ui.sidebarToggled]: (state: RuntimeStore, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.ui.sidebarOpen = event.open
        }),
      },
    ]
  },

  [eventKeywords.ui.headerToggled]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.ui.headerCollapsed = event.collapsed
        }),
      },
    ]
  },

  [eventKeywords.profile.switched]: (_state, event, _ctx) => {
    return [
      {
        type: effectKeywords.profile.load,
        profileId: event.profileId,
      },
    ]
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
          const baseSettings = draft.ui.visualSettings.atmosphere.base
          const settings = {
            trailAlpha: event.settings?.trailAlpha ?? baseSettings.trailAlpha,
            fogColor: event.settings?.fogColor ?? baseSettings.fogColor,
            fogIntensity:
              event.settings?.fogIntensity ?? baseSettings.fogIntensity,
            fogOpacity: event.settings?.fogOpacity ?? baseSettings.fogOpacity,
          }
          draft.ui.visualSettings.atmosphere.activeEvent = {
            eventType: event.eventType,
            settings,
            startedAt: Date.now(),
            minDurationTicks: event.minDurationTicks,
          }
        }),
      },
    ]
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
          if (
            draft.ui.visualSettings.atmosphere.activeEvent?.eventType ===
            event.eventType
          ) {
            draft.ui.visualSettings.atmosphere.activeEvent = null
          }
        }),
      },
    ]
  },

  [eventKeywords.analytics.filterChanged]: (
    _state: RuntimeStore,
    event
  ): ControlEffect[] => {
    return [
      {
        type: effectKeywords.analytics.updateFilter,
        maxEvents: event.maxEvents,
        allowedEventTypes: event.allowedEventTypes,
      },
    ]
  },

  [eventKeywords.analytics.filterCleared]: () => {
    return [
      {
        type: effectKeywords.analytics.clearFilter,
      },
    ]
  },
  [simulationKeywords.events.boidsCaught]: (_state, _event) => {
    return []
  },
  [simulationKeywords.events.boidsDied]: (_state, event) => {
    const removeBoidEffects = event.boids.map((boid) => ({
      type: effectKeywords.engine.removeBoid,
      boidId: boid.id,
    }))

    return removeBoidEffects
  },
  [simulationKeywords.events.boidsReproduced]: (_state, event) => {
    const addBoidEffects = event.boids.flatMap((boid) =>
      boid.offspring.map((b) => ({
        type: effectKeywords.engine.addBoid,
        boid: b,
      }))
    )
    return addBoidEffects
  },
  [simulationKeywords.events.boidsSpawned]: (_state, event) => {
    const addBoidEffects = event.boids.map((boid) => ({
      type: effectKeywords.engine.addBoid,
      boid,
    }))
    return addBoidEffects
  },
  [simulationKeywords.events.boidsStanceChanged]: (_state, _event) => {
    return []
  },
  [simulationKeywords.events.workerStateUpdated]: (_state, _event) => {
    return []
  },
  [simulationKeywords.events.foodSourcesCreated]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.foodSources.push(...event.foodSources)
        }),
      },
    ]
  },
  [simulationKeywords.events.foodSourcesUpdated]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          for (const foodSource of event.foodSources) {
            const existing = draft.simulation.foodSources.find(
              (f) => f.id === foodSource.id
            )
            if (existing) {
              for (const key in foodSource) {
                if (key in existing) {
                  ;(existing as any)[key] = foodSource[key as keyof FoodSource]
                }
              }
            }
          }
        }),
      },
    ]
  },
  [simulationKeywords.events.foodSourceConsumed]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.foodSources = draft.simulation.foodSources.filter(
            (f) => f.id !== event.foodSourceId
          )
        }),
      },
    ]
  },
  [simulationKeywords.events.obstaclesAdded]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles.push(...event.obstacles)
        }),
      },
    ]
  },
  [simulationKeywords.events.obstaclesUpdated]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          for (const obstacle of event.obstacles) {
            const existing = draft.simulation.obstacles.find(
              (o) => o.id === obstacle.id
            )
            if (existing) {
              for (const key in obstacle) {
                if (key in existing) {
                  ;(existing as any)[key] = obstacle[key as keyof Obstacle]
                }
              }
            }
          }
        }),
      },
    ]
  },
  [simulationKeywords.events.obstaclesRemoved]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles = draft.simulation.obstacles.filter(
            (o) => !event.obstacleIds.includes(o.id)
          )
        }),
      },
    ]
  },
  [simulationKeywords.events.obstaclesCleared]: (state, _event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.obstacles = []
        }),
      },
    ]
  },
  [simulationKeywords.events.deathMarkersAdded]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.deathMarkers.push(...event.markers)
        }),
      },
    ]
  },
  [simulationKeywords.events.deathMarkersUpdated]: (state, event, ctx) => {
    return [
      {
        type: effectKeywords.state.update,
        state: ctx.nextState(state, (draft) => {
          draft.simulation.deathMarkers = event.markers
        }),
      },
    ]
  },
  [simulationKeywords.events.timeScaleChanged]: (_state, _event) => {
    return []
  },
  [simulationKeywords.events.initialized]: (_state, _event) => {
    return []
  },
  [simulationKeywords.events.updated]: (_state, _event) => {
    return []
  },
  [simulationKeywords.events.error]: (_state, event) => {
    console.error('[SimulationGateway] Simulation error:', event)
    return []
  },
} satisfies EventHandlerMap<AllEvents, AllEffects, RuntimeStore, HandlerContext>

type ExecutorContext = {
  store: RuntimeStoreApi
  analyticsStore: AnalyticsStoreResource
  profileStore: ProfileStoreResource
  randomness: RandomnessResource
  timer: TimerManager
  engine: BoidEngine
  localBoidStore: LocalBoidStoreResource // Will be injected
}

const executors = {
  [effectKeywords.state.update]: (effect, ctx) => {
    ctx.store.setState(effect.state)
  },

  [effectKeywords.timer.schedule]: (effect, ctx) => {
    ctx.timer.schedule(effect.id, effect.delayMs, () => {
      ctx.dispatch(effect.onExpire)
    })
  },

  [effectKeywords.timer.cancel]: (effect, ctx) => {
    ctx.timer.cancel(effect.id)
  },

  [effectKeywords.engine.addBoid]: (effect, ctx) => {
    ctx.engine.addBoid(effect.boid)
  },

  [effectKeywords.engine.removeBoid]: (effect, ctx) => {
    ctx.engine.removeBoid(effect.boidId)
  },

  [effectKeywords.analytics.updateFilter]: (effect, ctx) => {
    ctx.analyticsStore.updateEventsFilter(
      effect.maxEvents,
      effect.allowedEventTypes
    )
  },

  [effectKeywords.analytics.clearFilter]: (_effect, ctx) => {
    ctx.analyticsStore.clearEventsFilter()
  },

  [effectKeywords.profile.load]: (effect, ctx) => {
    const profile = ctx.profileStore.getProfileById(effect.profileId)
    if (!profile) {
      console.error(`[profile:load] Profile not found: ${effect.profileId}`)
      return
    }

    console.log(
      `[profile:load] Loading profile: ${profile.name} (${profile.id})`
    )

    ctx.profileStore.setActiveProfile(effect.profileId)

    ctx.randomness.setSeed(profile.seed)

    const currentState = ctx.store.getState()
    ctx.store.setState({
      config: {
        profileId: profile.id,
        randomSeed: profile.seed,
        world: profile.world,
        species: profile.species,
        parameters: profile.parameters,
        physics: profile.physics ?? currentState.config.physics,
      },
      simulation: {
        obstacles: [],
        foodSources: [],
        deathMarkers: [],
      },
      ui: currentState.ui,
    })

    ctx.engine.reset()

    console.log(`[profile:load] Profile loaded successfully: ${profile.name}`)
  },

  [effectKeywords.localBoidStore.syncWorkerState]: (effect, ctx) => {
    if (!ctx.localBoidStore) {
      console.warn(
        '[localBoidStore:syncWorkerState] localBoidStore not available'
      )
      return
    }

    const localStore = ctx.localBoidStore.store

    effect.updates.forEach((boid) => {
      if (!boid || !boid.id) {
        console.warn(
          `[localBoidStore:syncWorkerState] Boid not found: ${boid.id}`
        )
        return
      }

      const boidId = boid.id
      localStore.updateBoid(boidId, (local) => {
        for (const key in boid) {
          if (key in local) {
            ;(local as any)[key] = boid[key as keyof Boid]
          }
        }

        if (boid.isDead) {
          ctx.engine.removeBoid(boidId)
        }
      })
    })
  },

  [effectKeywords.runtime.dispatch]: (effect, ctx) => {
    ctx.dispatch(effect.event)
  },
} satisfies EffectExecutorMap<AllEffects, AllEvents, ExecutorContext>

export type SimulationGateway = ReturnType<typeof createSimulationGateway>

function createSimulationGateway(
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
  >()

  const spawnRandomness = randomness.domain('spawn')

  const nextSpawnId = () => {
    const now = performance.now()
    const id = spawnRandomness.intRange(10_000, 99_999)
    return `spawn-${now}-${id}`
  }

  const gateway = createControlLoop({
    getState: () => store.getState(),
    handlers,
    executors: executors,
    handlerContext: {
      nextState: (current, mutation) => {
        return produce(current, mutation)
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
  })

  return gateway
}

export const simulationGateway = defineResource({
  dependencies: [
    'runtimeStore',
    'analyticsStore',
    'profileStore',
    'randomness',
    'timer',
    'engine',
    'localBoidStore',
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
    runtimeStore: RuntimeStoreResource
    analyticsStore: AnalyticsStoreResource
    profileStore: ProfileStoreResource
    randomness: RandomnessResource
    timer: TimerManager
    engine: BoidEngine
    localBoidStore: LocalBoidStoreResource
  }) => {
    const gateway = createSimulationGateway(
      runtimeStore.store,
      analyticsStore,
      profileStore,
      randomness,
      timer,
      engine,
      localBoidStore
    )

    return gateway
  },
  halt: (controller) => {
    controller.dispose()
  },
})
