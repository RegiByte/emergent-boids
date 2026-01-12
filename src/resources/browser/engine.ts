import {
  createForceCollector,
  createLifecycleCollector,
} from '@/boids/collectors.ts'
import { fadeDeathMarkers } from '@/boids/deathMarkers.ts'
import type {
  AllEvents,
  CatchEvent,
} from '@/boids/vocabulary/schemas/events.ts'
import { LifecycleEvent } from '@/boids/vocabulary/schemas/events.ts'
import { Vector2 } from '@/boids/vocabulary/schemas/primitives.ts'
import {
  SimulationCommand,
  SimulationEvent,
} from '@/boids/vocabulary/schemas/simulation.ts'
import { SpeciesConfig } from '@/boids/vocabulary/schemas/species.ts'
import type {
  WorldConfig,
  WorldPhysics,
} from '@/boids/vocabulary/schemas/world.ts'
import { Channel } from '@/lib/channels.ts'
import { DomainRNG } from '@/lib/seededRandom.ts'
import {
  bufferViewIndexes,
  setActiveBufferIndex,
  SharedBoidViews,
} from '@/lib/sharedMemory.ts'
import { createSubscription } from '@/lib/state.ts'
import { sharedMemoryKeywords } from '@/lib/workerTasks/vocabulary.ts'
import { defineResource } from 'braided'
import { createBehaviorRuleset } from '../../boids/behavior/rules'
import { createBoid, updateBoid } from '../../boids/boid.ts'
import type { BoidUpdateContext } from '../../boids/context.ts'
import { defaultWorldPhysics } from '../../boids/defaultPhysics.ts'
import { FOOD_CONSTANTS } from '../../boids/food.ts'
import { createSpatialHash } from '../../boids/spatialHash.ts'
import {
  eventKeywords,
  profilerKeywords,
} from '../../boids/vocabulary/keywords.ts'
import {
  Boid,
  DeathMarker,
  FoodSource,
  Obstacle,
} from '../../boids/vocabulary/schemas/entities.ts'
import type { Profiler } from '../shared/profiler.ts'
import { RandomnessResource } from '../shared/randomness.ts'
import { SharedMemoryManager } from '../shared/sharedMemoryManager.ts'
import type { TimeResource } from '../shared/time.ts'
import {
  applyLifecycleEventsCore,
  checkCatchesCore,
  evaluateBoidBehaviorCore,
  generatePreyFoodBatch,
  createPredatorFoodFromCatch,
  updateBoidCooldowns,
} from '@/boids/engine/core'
import {
  checkBoidLifecycle,
  computeOpsLayout,
  createBaseFrameUpdateContext,
  updateBoids,
  updateBoidSpatialHash,
  updateDeathMarkers,
  updateEngine,
  updateFoodSources,
  updateObstacles,
} from './engine/update.ts'
import {
  initializeBoidsStats,
  LocalBoidStore,
  LocalBoidStoreResource,
  syncBoidsToSharedMemory,
} from './localBoidStore.ts'
import type { RuntimeStoreResource } from './runtimeStore.ts'

export type BoidEngine = {
  initialize: (channel: Channel<SimulationCommand, SimulationEvent>) => void
  update: (deltaSeconds: number) => void
  reset: () => void
  addBoid: (boid: Boid) => void
  removeBoid: (boidId: string) => void
  getBoidById: (boidId: string) => Boid | undefined
  checkCatches: () => CatchEvent[]
  getBufferViews: () => SharedBoidViews
  cleanup: () => void
}

/**
 * Effectful function to create boids based on minimal parameters.
 */
const createBoids = ({
  preyCount,
  preyTypeIds,
  predatorCount,
  predatorTypeIds,
  species,
  rng,
  physics,
  boidsStore,
  world,
}: {
  preyCount: number
  predatorCount: number
  world: Pick<WorldConfig, 'width' | 'height'>
  species: Record<string, SpeciesConfig>
  rng: DomainRNG
  physics: WorldPhysics
  boidsStore: LocalBoidStore
  preyTypeIds: string[]
  predatorTypeIds: string[]
}) => {
  const creationContext = {
    world: {
      width: world.width,
      height: world.height,
    },
    species,
    rng,
    physics,
  }
  for (let i = 0; i < preyCount; i++) {
    boidsStore.addBoid(
      createBoid(preyTypeIds, creationContext, 0, boidsStore.nextIndex())
    )
  }
  for (let i = 0; i < predatorCount; i++) {
    boidsStore.addBoid(
      createBoid(predatorTypeIds, creationContext, 0, boidsStore.nextIndex())
    )
  }
}

export const engine = defineResource({
  dependencies: [
    'runtimeStore',
    'profiler',
    'randomness',
    'time',
    'localBoidStore',
    'sharedMemoryManager',
    'frameRater',
  ],
  start: ({
    runtimeStore,
    profiler,
    randomness,
    time,
    localBoidStore,
    sharedMemoryManager,
    frameRater,
  }: {
    runtimeStore: RuntimeStoreResource
    profiler: Profiler
    randomness: RandomnessResource
    time: TimeResource
    localBoidStore: LocalBoidStoreResource
    sharedMemoryManager: SharedMemoryManager
    frameRater: ReturnType<
      typeof import('../shared/frameRater').frameRater.start
    >
  }) => {
    const { config: initialConfig } = runtimeStore.store.getState()
    const { world: initialWorld, species: initialSpecies } = initialConfig

    const boidsStore = localBoidStore.store

    const engineEventSubscription = createSubscription<AllEvents>()

    let preyTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === 'prey'
    )
    let predatorTypeIds = Object.keys(initialSpecies).filter(
      (id) => initialSpecies[id].role === 'predator'
    )

    const physics = initialConfig.physics || defaultWorldPhysics

    const rng = randomness.domain('spawning')
    createBoids({
      preyCount: initialWorld.initialPreyCount,
      preyTypeIds,
      predatorCount: initialWorld.initialPredatorCount ?? 0,
      predatorTypeIds,
      species: initialSpecies,
      rng,
      physics,
      boidsStore,
      world: initialWorld,
    })

    const boidsPhysicsMemory = sharedMemoryManager.initialize(
      sharedMemoryKeywords.boidsPhysics,
      initialConfig.parameters.maxBoids
    )
    const physicsViews = boidsPhysicsMemory.views as unknown as SharedBoidViews
    syncBoidsToSharedMemory(physicsViews, boidsStore.boids)
    initializeBoidsStats(physicsViews, {
      aliveCount: boidsStore.count(),
      frameCount: 0,
      simulationTimeMs: 0,
    })
    setActiveBufferIndex(physicsViews, bufferViewIndexes.front)

    const boidSpatialHash = createSpatialHash<Boid>(
      initialWorld.width,
      initialWorld.height,
      initialConfig.parameters.perceptionRadius
    )

    const foodSourceSpatialHash = createSpatialHash<FoodSource>(
      initialWorld.width,
      initialWorld.height,
      FOOD_CONSTANTS.FOOD_DETECTION_RADIUS
    )
    const obstacleSpatialHash = createSpatialHash<Obstacle>(
      initialWorld.width,
      initialWorld.height,
      initialConfig.parameters.perceptionRadius
    )
    const deathMarkerSpatialHash = createSpatialHash<DeathMarker>(
      initialWorld.width,
      initialWorld.height,
      initialConfig.parameters.perceptionRadius
    )

    const behaviorRuleset = createBehaviorRuleset()
    const forcesCollector = createForceCollector()
    const lifecycleCollector = createLifecycleCollector()

    const foodSpawnExecutor = frameRater.throttled('foodSpawning', {
      intervalMs: FOOD_CONSTANTS.PREY_FOOD_SPAWN_INTERVAL_TICKS * (1000 / 60), // Convert ticks to ms
    })
    const deathMarkerFadeExecutor = frameRater.throttled('deathMarkerFading', {
      intervalMs: 1000, // Fade every 1 second
    })

    let tickCounter = 0

    const initialize = (
      _channel: Channel<SimulationCommand, SimulationEvent>
    ) => {}

    /**
     * Apply lifecycle events collected during the frame
     *
     * Processes deaths and reproductions in batch after all boids have been updated.
     * This ensures consistent state and proper population cap enforcement.
     *
     * Events are dispatched through the engine's event subscription (no circular dependency).
     */
    const applyLifecycleEvents = (events: LifecycleEvent[]) => {
      profiler.start('lifecycle.applyEvents')
      const { config, simulation: currentSimulation } = runtimeStore.store.getState()

      const result = applyLifecycleEventsCore(events, {
        boids: boidsStore.boids,
        config:         {
          parameters: config.parameters,
          species: config.species,
          world: config.world,
          physics: config.physics,
        },
        currentFrame: time.getFrame(),
        rng: randomness.domain('reproduction'),
        getNextBoidIndex: () => boidsStore.nextIndex(),
      })

      profiler.start('lifecycle.processDeaths')
      for (const boidId of result.boidsToRemove) {
        const boid = boidsStore.getBoidById(boidId)
        if (boid) {
          const deathEvent = events.find(
            (e) => e.type === 'lifecycle:death' && e.boidId === boidId
          ) as Extract<LifecycleEvent, { type: 'lifecycle:death' }> | undefined

          if (deathEvent) {
            engineEventSubscription.notify({
              type: eventKeywords.boids.died,
              boidId: deathEvent.boidId,
              typeId: deathEvent.typeId,
              reason: deathEvent.reason,
            })
          }
        }
        removeBoid(boidId)
      }
      profiler.end('lifecycle.processDeaths')

      profiler.start('lifecycle.processFoodConsumption')
      if (result.foodConsumption.size > 0) {
        const updatedFoodSources = currentSimulation.foodSources.map((food) => {
          const consumed = result.foodConsumption.get(food.id)
          if (consumed) {
            return {
              ...food,
              energy: Math.max(0, food.energy - consumed),
            }
          }
          return food
        })

        runtimeStore.store.setState({
          simulation: {
            ...currentSimulation,
            foodSources: updatedFoodSources,
          },
        })
      }
      profiler.end('lifecycle.processFoodConsumption')

      profiler.start('lifecycle.processReproductions')
      for (const newBoid of result.boidsToAdd) {
        addBoid(newBoid)
      }

      for (const reproEvent of result.reproductionEvents) {
        engineEventSubscription.notify({
          type: eventKeywords.boids.reproduced,
          parentId: reproEvent.parentId,
          childId: reproEvent.childId,
          typeId: reproEvent.typeId,
          offspringCount: reproEvent.offspringCount,
          ...(reproEvent.parent2Id && { parent2Id: reproEvent.parent2Id }),
        })
      }
      profiler.end('lifecycle.processReproductions')
      profiler.end('lifecycle.applyEvents')
    }

    const update = (deltaSeconds: number) => {
      profiler.start(profilerKeywords.engine.update)
      const { simulation, config } = runtimeStore.store.getState()
      time.incrementFrame()

      const matedBoidsThisFrame = new Set<string>()

      const opsLayout = computeOpsLayout({
        deathMarkersCount: simulation.deathMarkers.length,
        obstaclesCount: simulation.obstacles.length,
        foodSourcesCount: simulation.foodSources.length,
        boidsCount: boidsStore.count(),
      })

      const updateContext = createBaseFrameUpdateContext({
        frame: time.getFrame(),
        config,
        profiler,
        simulation,
        boidsCount: boidsStore.count(),
        boidsStore,
        deltaSeconds,
        boidSpatialHash,
        deathMarkerSpatialHash,
        foodSourceSpatialHash,
        forcesCollector,
        lifecycleCollector,
        obstacleSpatialHash,
      })

      updateContext.lifecycleCollector = lifecycleCollector
      updateContext.matedBoidsThisFrame = matedBoidsThisFrame

      boidSpatialHash.grid.clear()
      foodSourceSpatialHash.grid.clear()
      obstacleSpatialHash.grid.clear()
      deathMarkerSpatialHash.grid.clear()

      updateEngine(
        opsLayout,
        updateContext,
        {
          updateBoids: updateBoids,
          updateDeathMarkers: updateDeathMarkers,
          updateObstacles: updateObstacles,
          updateFoodSources: updateFoodSources,
          updateBoidSpatialHash: updateBoidSpatialHash,
        },
        {
          updateBoid: (boid: Boid, context: BoidUpdateContext) => {
            updateBoid(boid, context)
            updateBoidCooldowns(boid, {
            parameters: config.parameters,
            species: config.species,
            world: config.world,
            physics: config.physics,
          })
          },
          updateTrail: (boid: Boid, position: Vector2) => {
            boid.positionHistory.push({
              x: position.x,
              y: position.y,
            })
            const speciesConfig = config.species[boid.typeId]
            if (
              boid.positionHistory.length >
              speciesConfig.visualConfig.trailLength
            ) {
              boid.positionHistory.shift()
            }
          },
          evaluateBoidBehavior: (boid: Boid, context: BoidUpdateContext) => {
            evaluateBoidBehavior(boid, context)
          },
          checkBoidLifecycle: checkBoidLifecycle,
        }
      )

      profiler.start('lifecycle.apply')
      if (lifecycleCollector.items.length > 0) {
        applyLifecycleEvents(lifecycleCollector.items)
        lifecycleCollector.reset()
      }
      profiler.end('lifecycle.apply')

      tickCounter++

      if (foodSpawnExecutor.shouldExecute(deltaSeconds * 1000)) {
        profiler.start('lifecycle.spawnFood')
        const newFoodSources = generatePreyFoodBatch(
          simulation.foodSources,
          config.world,
          tickCounter,
          randomness.domain('food'),
          time.now()
        )

        if (newFoodSources.length > 0) {
          runtimeStore.store.setState({
            simulation: {
              ...simulation,
              foodSources: [...simulation.foodSources, ...newFoodSources],
            },
          })

          for (const foodSource of newFoodSources) {
            engineEventSubscription.notify({
              type: eventKeywords.boids.foodSourceCreated,
              foodSource,
            })
          }
        }
        foodSpawnExecutor.recordExecution()
        profiler.end('lifecycle.spawnFood')
      }

      if (deathMarkerFadeExecutor.shouldExecute(deltaSeconds * 1000)) {
        profiler.start('lifecycle.fadeMarkers')
        const { markers: updatedMarkers, shouldUpdate } = fadeDeathMarkers(
          simulation.deathMarkers
        )

        if (shouldUpdate) {
          runtimeStore.store.setState({
            simulation: {
              ...simulation,
              deathMarkers: updatedMarkers,
            },
          })
        }
        deathMarkerFadeExecutor.recordExecution()
        profiler.end('lifecycle.fadeMarkers')
      }

      profiler.start('lifecycle.cleanupFood')
      const activeFoodSources = simulation.foodSources.filter(
        (food) => food.energy > 0
      )
      if (activeFoodSources.length !== simulation.foodSources.length) {
        runtimeStore.store.setState({
          simulation: {
            ...simulation,
            foodSources: activeFoodSources,
          },
        })
      }
      profiler.end('lifecycle.cleanupFood')

      profiler.start('lifecycle.catches')
      const catches = checkCatches()
      if (catches.length > 0) {
        const newFoodFromCatches: FoodSource[] = []
        const currentFoodSources =
          runtimeStore.store.getState().simulation.foodSources
        const allFood = [...currentFoodSources]

        for (const catchEvent of catches) {
          const foodSource = createPredatorFoodFromCatch(
            catchEvent,
            allFood,
            tickCounter,
            randomness.domain('food'),
            time.now()
          )

          if (foodSource) {
            newFoodFromCatches.push(foodSource)
            allFood.push(foodSource)

            engineEventSubscription.notify({
              type: eventKeywords.boids.foodSourceCreated,
              foodSource,
            })
          }

          engineEventSubscription.notify(catchEvent)
        }

        if (newFoodFromCatches.length > 0) {
          const currentSimulation = runtimeStore.store.getState().simulation
          runtimeStore.store.setState({
            simulation: {
              ...currentSimulation,
              foodSources: allFood,
            },
          })
        }
      }
      profiler.end('lifecycle.catches')
    }

    const evaluateBoidBehavior = (boid: Boid, context: BoidUpdateContext) => {
      evaluateBoidBehaviorCore(
        boid,
        context,
        {
          parameters: context.config.parameters,
          species: context.config.species,
          world: context.config.world,
        },
        behaviorRuleset,
        time.getFrame(),
        boidsStore.count(),
        profiler
      )
    }

    const checkCatches = (): CatchEvent[] => {
      const { config: cfg } = runtimeStore.store.getState()
      const boids = boidsStore.boids

      const catches = checkCatchesCore(boids, {
        parameters: cfg.parameters,
        species: cfg.species,
        world: cfg.world,
      })

      for (const catchEvent of catches) {
        removeBoid(catchEvent.preyId)
      }

      return catches
    }

    const reset = () => {
      const { config: cfg } = runtimeStore.store.getState()
      const { world, species } = cfg

      boidsStore.clear()

      const currentPreyTypeIds = Object.keys(species).filter(
        (id) => species[id].role === 'prey'
      )
      const currentPredatorTypeIds = Object.keys(species).filter(
        (id) => species[id].role === 'predator'
      )

      preyTypeIds = [...currentPreyTypeIds]
      predatorTypeIds = [...currentPredatorTypeIds]

      const resetPhysics =
        (cfg as unknown as { physics?: WorldPhysics }).physics ||
        defaultWorldPhysics

      const creationContext = {
        world: {
          width: world.width,
          height: world.height,
        },
        species,
        rng: randomness.domain('spawning'),
        physics: resetPhysics,
      }

      for (let i = 0; i < world.initialPreyCount; i++) {
        boidsStore.addBoid(
          createBoid(
            currentPreyTypeIds,
            creationContext,
            0,
            boidsStore.nextIndex()
          )
        )
      }

      for (let i = 0; i < (world.initialPredatorCount || 0); i++) {
        boidsStore.addBoid(
          createBoid(
            currentPredatorTypeIds,
            creationContext,
            0,
            boidsStore.nextIndex()
          )
        )
      }

      console.log(
        `[engine.reset] Respawned ${boidsStore.boids.length} boids (${currentPreyTypeIds.length} prey species, ${currentPredatorTypeIds.length} predator species)`
      )
    }

    const addBoid = (boid: Boid) => {
      profiler.start(profilerKeywords.engine.addBoid)
      boidsStore.addBoid(boid)
      profiler.end(profilerKeywords.engine.addBoid)
    }

    const removeBoid = (boidId: string) => {
      profiler.start(profilerKeywords.engine.removeBoid)
      boidsStore.removeBoid(boidId)
      profiler.end(profilerKeywords.engine.removeBoid)
    }

    const getBoidById = (boidId: string) => {
      return boidsStore.getBoidById(boidId)
    }

    const api = {
      initialize,
      update: update,
      cleanup: () => {
        engineEventSubscription.clear()
      },
      reset,
      addBoid,
      removeBoid,
      getBoidById,
      checkCatches,
      getBufferViews: () =>
        boidsPhysicsMemory.views as unknown as SharedBoidViews,
    } satisfies BoidEngine

    return api
  },
  halt: ({ cleanup }) => {
    cleanup()
  },
})
