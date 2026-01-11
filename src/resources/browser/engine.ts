import { createBoidOfType } from '@/boids/boid.ts'
import {
  createForceCollector,
  createLifecycleCollector,
} from '@/boids/collectors.ts'
import { fadeDeathMarkers } from '@/boids/deathMarkers.ts'
import { countBoidsByRole } from '@/boids/filters.ts'
import {
  canCreatePredatorFood,
  createPredatorFood,
  generatePreyFood,
} from '@/boids/foodManager.ts'
import { filterBoidsWhere } from '@/boids/iterators.ts'
import { canSpawnOffspring } from '@/boids/lifecycle/population.ts'
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
import {
  applyBehaviorDecision,
  buildBehaviorContext,
  evaluateBehavior,
} from '../../boids/behavior/evaluator.ts'
import {
  createBehaviorRuleset,
  MINIMUM_STANCE_DURATION_FRAMES,
} from '../../boids/behavior/rules'
import { createBoid, updateBoid } from '../../boids/boid.ts'
import type { BoidUpdateContext } from '../../boids/context.ts'
import { defaultWorldPhysics } from '../../boids/defaultPhysics.ts'
import { getPredators, getPrey } from '../../boids/filters.ts'
import { FOOD_CONSTANTS } from '../../boids/food.ts'
import { isDead } from '../../boids/lifecycle/health.ts'
import { isReadyToMate, isWithinRadius } from '../../boids/predicates.ts'
import { createSpatialHash, ItemWithDistance } from '../../boids/spatialHash.ts'
import * as vec from '../../boids/vector.ts'
import {
  eventKeywords,
  lifecycleKeywords,
  profilerKeywords,
  roleKeywords,
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
      const { config } = runtimeStore.store.getState()
      const speciesTypes = config.species

      profiler.start('lifecycle.processDeaths')
      for (const event of events) {
        if (event.type === 'lifecycle:death') {
          const boid = boidsStore.getBoidById(event.boidId)
          if (boid) {
            engineEventSubscription.notify({
              type: eventKeywords.boids.died,
              boidId: event.boidId,
              typeId: event.typeId,
              reason: event.reason,
            })
          }
          removeBoid(event.boidId)
        }
      }
      profiler.end('lifecycle.processDeaths')

      profiler.start('lifecycle.processFoodConsumption')
      const foodConsumptionMap = new Map<string, number>()
      for (const event of events) {
        if (event.type === lifecycleKeywords.events.foodConsumed) {
          const current = foodConsumptionMap.get(event.foodId) || 0
          foodConsumptionMap.set(event.foodId, current + event.energyConsumed)
        }
      }

      if (foodConsumptionMap.size > 0) {
        const { simulation: currentSimulation } = runtimeStore.store.getState()
        const updatedFoodSources = currentSimulation.foodSources.map((food) => {
          const consumed = foodConsumptionMap.get(food.id)
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
      const counts = countBoidsByRole(boidsStore.boids, speciesTypes)
      let currentPreyCount = counts.prey
      let currentPredatorCount = counts.predator

      for (const event of events) {
        if (event.type === 'lifecycle:reproduction') {
          const offspring = event.offspring
          const speciesConfig = speciesTypes[offspring.typeId]
          const offspringCount = speciesConfig.reproduction.offspringCount || 1
          const energyBonus =
            speciesConfig.reproduction.offspringEnergyBonus || 0

          const parent1 = boidsStore.getBoidById(offspring.parent1Id)
          const parent2 = offspring.parent2Id
            ? boidsStore.getBoidById(offspring.parent2Id)
            : undefined

          for (let i = 0; i < offspringCount; i++) {
            const currentTypeCount = filterBoidsWhere(
              boidsStore.boids,
              (b) => b.typeId === offspring.typeId
            ).length

            const canSpawn = canSpawnOffspring(
              offspring.typeId,
              speciesTypes,
              {
                maxBoids: config.parameters.maxBoids,
                maxPreyBoids: config.parameters.maxPreyBoids,
                maxPredatorBoids: config.parameters.maxPredatorBoids,
              },
              {
                totalBoids: boidsStore.count(),
                totalPrey: currentPreyCount,
                totalPredators: currentPredatorCount,
              },
              currentTypeCount
            )

            if (canSpawn) {
              const { width, height } = config.world
              const physics = config.physics || defaultWorldPhysics
              const creationContext = {
                world: { width, height },
                species: speciesTypes,
                rng: randomness.domain('reproduction'),
                physics,
              }

              const parentGenomes =
                parent1 && parent1.genome
                  ? {
                      parent1: parent1.genome,
                      parent2: parent2?.genome,
                    }
                  : undefined

              const result = createBoidOfType(
                offspring.position,
                offspring.typeId,
                creationContext,
                energyBonus,
                boidsStore.nextIndex(),
                parentGenomes
              )
              const newBoid = result.boid
              addBoid(newBoid)

              if (speciesConfig.role === 'prey') {
                currentPreyCount++
              } else if (speciesConfig.role === 'predator') {
                currentPredatorCount++
              }

              if (i === 0) {
                engineEventSubscription.notify({
                  type: eventKeywords.boids.reproduced,
                  parentId: offspring.parent1Id,
                  childId: newBoid.id,
                  typeId: offspring.typeId,
                  offspringCount,
                  ...(offspring.parent2Id && {
                    parent2Id: offspring.parent2Id,
                  }),
                })
              }
            }
          }
        }
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
        const { newFoodSources, shouldUpdate } = generatePreyFood(
          simulation.foodSources,
          config.world,
          tickCounter,
          randomness.domain('food'),
          time.now()
        )

        if (shouldUpdate) {
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
          if (canCreatePredatorFood(allFood)) {
            const foodSource = createPredatorFood(
              catchEvent.preyEnergy,
              catchEvent.preyPosition,
              tickCounter,
              randomness.domain('food'),
              time.now()
            )
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
      const {
        config,
        currentFrame,
        nearbyPrey: prey,
        nearbyPredators: predators,
      } = context
      const speciesConfig = config.species[boid.typeId]
      if (!speciesConfig) return

      const role = speciesConfig.role
      const parameters = config.parameters

      const nearbyPredators =
        role === roleKeywords.prey
          ? predators.filter((p) => {
              const fearRadius =
                speciesConfig.limits.fearRadius ?? parameters.fearRadius
              return isWithinRadius(boid.position, p.item.position, fearRadius)
            })
          : []

      const nearbyPrey =
        role === roleKeywords.predator
          ? prey.filter((p) =>
              isWithinRadius(
                boid.position,
                p.item.position,
                parameters.chaseRadius
              )
            )
          : []

      const nearbyFlock: ItemWithDistance<Boid>[] = []
      const boidsToCheck = role === roleKeywords.predator ? predators : prey // Use context boids!

      for (const nearbyBoid of boidsToCheck) {
        if (
          nearbyBoid.item.typeId === boid.typeId && // same species
          nearbyBoid.item.id !== boid.id // not self
        ) {
          nearbyFlock.push(nearbyBoid)
        }
      }

      const populationRatio = boidsStore.count() / parameters.maxBoids
      const readyToMate = isReadyToMate(boid, parameters, speciesConfig)

      const behaviorContext = buildBehaviorContext(boid, speciesConfig, {
        frame: time.getFrame(),
        populationRatio,
        readyToMate,
        nearbyPredators,
        nearbyPrey,
        nearbyFood: context.nearbyFoodSources,
        nearbyFlock,
      })

      const decision = evaluateBehavior(behaviorContext, behaviorRuleset, role)

      if (decision) {
        applyBehaviorDecision(
          boid,
          decision,
          currentFrame, // Use frame for stance tracking!
          MINIMUM_STANCE_DURATION_FRAMES,
          profiler
        )
      }
    }

    const checkCatches = (): CatchEvent[] => {
      const { config: cfg } = runtimeStore.store.getState()
      const { parameters } = cfg
      const boids = boidsStore.boids

      const predators = getPredators(boids, cfg.species)
      const prey = getPrey(boids, cfg.species)

      const catches: CatchEvent[] = []
      const caughtPreyIds: string[] = []

      for (const predator of predators) {
        if (predator.attackCooldownFrames > 0) continue

        for (const preyBoid of prey) {
          if (caughtPreyIds.includes(preyBoid.id)) continue

          const dist = vec.toroidalDistance(
            predator.position,
            preyBoid.position,
            cfg.world.width,
            cfg.world.height
          )

          if (dist < parameters.catchRadius) {
            const damage = predator.phenotype.attackDamage

            preyBoid.health -= damage

            const knockbackDirection = vec.toroidalSubtract(
              preyBoid.position,
              predator.position,
              cfg.world.width,
              cfg.world.height
            )
            const pushDist = vec.magnitude(knockbackDirection)
            if (pushDist > 0) {
              const nx = knockbackDirection.x / pushDist
              const ny = knockbackDirection.y / pushDist

              const sizeRatio =
                predator.phenotype.baseSize / preyBoid.phenotype.baseSize
              const baseKnockback = predator.phenotype.maxSpeed * 1.5 // slightly faster than predator
              const damageMultipler =
                1 + (damage / preyBoid.phenotype.maxHealth) * 3 // up to 3x
              const knockbackStrength =
                baseKnockback * damageMultipler * sizeRatio

              preyBoid.knockbackVelocity = {
                x: nx * knockbackStrength,
                y: ny * knockbackStrength,
              }
              preyBoid.knockbackFramesRemaining = 3
            }

            predator.attackCooldownFrames = parameters.attackCooldownFrames

            if (isDead(preyBoid)) {
              const preyEnergy = preyBoid.phenotype.maxEnergy
              const preyPosition = {
                x: preyBoid.position.x,
                y: preyBoid.position.y,
              }
              const preyTypeId = preyBoid.typeId

              removeBoid(preyBoid.id)
              caughtPreyIds.push(preyBoid.id)

              catches.push({
                type: eventKeywords.boids.caught,
                predatorId: predator.id,
                preyId: preyBoid.id,
                preyTypeId,
                preyEnergy,
                preyPosition,
              })
            }

            break // Predator can only attack one prey per frame
          }
        }
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
