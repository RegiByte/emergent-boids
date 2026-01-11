import { getMaxCrowdTolerance } from '@/boids/affinity'
import {
  applyBehaviorDecision,
  buildBehaviorContext,
  evaluateBehavior,
} from '@/boids/behavior/evaluator'
import {
  createBehaviorRuleset,
  MINIMUM_STANCE_DURATION_FRAMES,
} from '@/boids/behavior/rules'
import { createBoidOfType, updateBoid } from '@/boids/boid'
import { createEventCollector, createForceCollector } from '@/boids/collectors'
import { BoidUpdateContext, EngineUpdateContext } from '@/boids/context'
import { defaultWorldPhysics } from '@/boids/defaultPhysics'
import { getBoidsByRole } from '@/boids/filters'
import { FOOD_CONSTANTS } from '@/boids/food'
import { isDead } from '@/boids/lifecycle/health'
import { canSpawnOffspring } from '@/boids/lifecycle/population'
import { isReadyToMate } from '@/boids/predicates'
import { createSpatialHash, ItemWithDistance } from '@/boids/spatialHash'
import {
  eventKeywords,
  lifecycleKeywords,
  profilerKeywords,
  simulationKeywords,
} from '@/boids/vocabulary/keywords'
import * as vec from '@/boids/vector'
import {
  Boid,
  DeathMarker,
  FoodSource,
  Obstacle,
} from '@/boids/vocabulary/schemas/entities'
import { CatchEvent, LifecycleEvent } from '@/boids/vocabulary/schemas/events'
import {
  SharedBoidBufferLayout,
  StatsIndex,
  swapBuffers,
} from '@/lib/sharedMemory'
import { defineResource, StartedResource } from 'braided'
import { BoidEngine } from '../browser/engine'
import {
  checkBoidLifecycle,
  computeOpsLayout,
  updateBoids,
  updateBoidSpatialHash,
  updateDeathMarkers,
  updateEngine,
  updateFoodSources,
  updateObstacles,
} from '../browser/engine/update'
import { initializeBoidsStats } from '../browser/localBoidStore'
import { Profiler } from '../shared/profiler'
import { RandomnessResource } from '../shared/randomness'
import { TimeAPI } from '../shared/time'
import { WorkerStoreResource } from './workerStore'
import {
  SimulationCommand,
  SimulationEvent,
} from '@/boids/vocabulary/schemas/simulation'
import { Channel } from '@/lib/channels'
import { iterateBoids } from '@/boids/iterators'
import { FrameRaterAPI } from '../shared/frameRater'

/**
 * Worker Engine Resource
 *
 * Mirrors the main engine.ts but runs in worker thread.
 * Maintains full Boid[] array and syncs positions/velocities to SharedArrayBuffer.
 *
 * Philosophy: Reuse existing boid behavior code, don't reimplement physics!
 */
export const workerEngine = defineResource({
  dependencies: [
    'workerStore',
    'workerProfiler',
    'workerTime',
    'workerRandomness',
    'workerFrameRater',
  ],
  start: ({
    workerStore,
    workerProfiler,
    workerTime,
    workerRandomness,
    workerFrameRater,
  }: {
    workerStore: WorkerStoreResource
    workerProfiler: Profiler
    workerTime: TimeAPI
    workerRandomness: RandomnessResource
    workerFrameRater: FrameRaterAPI
  }) => {
    const boidsStore = workerStore.boids

    let simulationChannel: Channel<SimulationCommand, SimulationEvent> | null =
      null

    let spatialHash: ReturnType<typeof createSpatialHash<Boid>> | null = null
    let foodSourceSpatialHash: ReturnType<
      typeof createSpatialHash<FoodSource>
    > | null = null
    let obstacleSpatialHash: ReturnType<
      typeof createSpatialHash<Obstacle>
    > | null = null
    let deathMarkerSpatialHash: ReturnType<
      typeof createSpatialHash<DeathMarker>
    > | null = null
    const forcesCollector = createForceCollector()

    const behaviorRuleset = createBehaviorRuleset()

    /**
     * Attach shared memory buffer and initial boids to the engine
     */
    const attach = (input: {
      buffer: SharedArrayBuffer
      layout: SharedBoidBufferLayout
      initialBoids: Boid[]
    }) => {
      boidsStore.setSharedBuffer(input.buffer, input.layout)

      boidsStore.setBoids(input.initialBoids)

      const state = workerStore.getState()
      const config = state.config
      spatialHash = createSpatialHash<Boid>(
        config.world.width,
        config.world.height,
        config.parameters.perceptionRadius
      )
      foodSourceSpatialHash = createSpatialHash<FoodSource>(
        config.world.width,
        config.world.height,
        FOOD_CONSTANTS.FOOD_DETECTION_RADIUS
      )
      obstacleSpatialHash = createSpatialHash<Obstacle>(
        config.world.width,
        config.world.height,
        config.parameters.perceptionRadius
      )
      deathMarkerSpatialHash = createSpatialHash<DeathMarker>(
        config.world.width,
        config.world.height,
        config.parameters.perceptionRadius
      )

      boidsStore.syncToSharedMemory()

      const bufferViews = boidsStore.getBufferViews()
      if (!bufferViews) return
      initializeBoidsStats(bufferViews, {
        aliveCount: boidsStore.count(),
        frameCount: 0,
        simulationTimeMs: 0,
      })

      console.log(
        `[WorkerEngine] Initialized with ${boidsStore.count()} boids via sharedMemoryManager`
      )
    }

    const initialize = (
      channel: Channel<SimulationCommand, SimulationEvent>
    ) => {
      simulationChannel = channel
    }

    /**
     * Update physics using existing boid behavior code
     * This is the main update loop - mirrors engine.ts with single-pass approach
     */
    const lifecycleCollector = createEventCollector<LifecycleEvent>()
    const timePassedRater = workerFrameRater.throttled('timePassed', {
      intervalMs: 1000,
    })
    let lastTimePassed = 0

    const update = (deltaSeconds: number) => {
      const bufferViews = boidsStore.getBufferViews()
      if (
        !spatialHash ||
        !foodSourceSpatialHash ||
        !obstacleSpatialHash ||
        !deathMarkerSpatialHash ||
        !bufferViews
      )
        return

      workerProfiler.start(profilerKeywords.engine.update)

      workerTime.incrementFrame()
      const currentFrame = workerTime.getFrame()

      const state = workerStore.getState()
      const config = state.config
      const boids = boidsStore.getBoids()
      const simulation = state.simulation

      const matedBoidsThisFrame = new Set<string>()

      const opsLayout = computeOpsLayout({
        deathMarkersCount: simulation.deathMarkers.length,
        obstaclesCount: simulation.obstacles.length,
        foodSourcesCount: simulation.foodSources.length,
        boidsCount: boidsStore.count(),
      })

      const maxBoidCrowdTolerance = getMaxCrowdTolerance(config.species)
      const maxNeighborsLookup = Math.ceil(maxBoidCrowdTolerance * 1.3)

      const updateContext: EngineUpdateContext = {
        simulation: {
          obstacles: simulation.obstacles,
          deathMarkers: simulation.deathMarkers,
          foodSources: simulation.foodSources,
        },
        config: {
          parameters: config.parameters,
          world: config.world,
          species: config.species,
        },
        deltaSeconds,
        profiler: workerProfiler,
        boidsById: boids,
        boidIds: Object.keys(boids),
        scaledTime: deltaSeconds * 30,
        boidsByRole: getBoidsByRole(boids, config.species),
        currentFrame,
        boidsCount: boidsStore.count(),
        forcesCollector,
        boidSpatialHash: spatialHash,
        foodSourceSpatialHash,
        obstacleSpatialHash,
        deathMarkerSpatialHash,
        staggerFrames: {
          tail: 3,
          behavior: 20,
          lifecycle: 2,
        },
        constraints: {
          maxNeighborsLookup,
        },
        lifecycleCollector,
        matedBoidsThisFrame,
      }

      spatialHash.grid.clear()
      foodSourceSpatialHash.grid.clear()
      obstacleSpatialHash.grid.clear()
      deathMarkerSpatialHash.grid.clear()

      updateEngine(
        opsLayout,
        updateContext,
        {
          updateBoids,
          updateDeathMarkers,
          updateObstacles,
          updateFoodSources,
          updateBoidSpatialHash,
        },
        {
          updateBoid: (boid: Boid, context: BoidUpdateContext) => {
            updateBoid(boid, context)

            if (boid.attackCooldownFrames > 0) {
              boid.attackCooldownFrames--
            }
            if (boid.eatingCooldownFrames > 0) {
              boid.eatingCooldownFrames--
            }
            if (boid.reproductionCooldown > 0) {
              boid.reproductionCooldown--

              if (boid.reproductionCooldown === 0) {
                const speciesConfig = config.species[boid.typeId]
                if (speciesConfig) {
                  boid.seekingMate = isReadyToMate(
                    boid,
                    config.parameters,
                    speciesConfig
                  )
                }
              }
            }
            if (boid.knockbackFramesRemaining > 0) {
              boid.knockbackFramesRemaining--
            }
          },
          updateTrail: (boid: Boid, position: { x: number; y: number }) => {
            boid.positionHistory.push({
              x: position.x,
              y: position.y,
            })
            const speciesConfig = config.species[boid.typeId]
            if (
              speciesConfig &&
              boid.positionHistory.length >
                speciesConfig.visualConfig.trailLength
            ) {
              boid.positionHistory.shift()
            }
          },
          evaluateBoidBehavior: (boid: Boid, context: BoidUpdateContext) => {
            const speciesConfig = config.species[boid.typeId]
            if (!speciesConfig) return

            const role = speciesConfig.role
            const parameters = config.parameters

            const nearbyPredators =
              role === 'prey'
                ? context.nearbyPredators.filter((p) => {
                    const fearRadius =
                      speciesConfig.limits.fearRadius ?? parameters.fearRadius
                    return p.distance < fearRadius
                  })
                : []

            const nearbyPrey =
              role === 'predator'
                ? context.nearbyPrey.filter(
                    (p) => p.distance < parameters.chaseRadius
                  )
                : []

            const nearbyFlock: ItemWithDistance<Boid>[] = []
            const boidsToCheck =
              role === 'predator' ? context.nearbyPredators : context.nearbyPrey

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
              frame: currentFrame,
              populationRatio,
              readyToMate,
              nearbyPredators,
              nearbyPrey,
              nearbyFood: context.nearbyFoodSources,
              nearbyFlock,
            })

            const decision = evaluateBehavior(
              behaviorContext,
              behaviorRuleset,
              role
            )

            if (decision) {
              applyBehaviorDecision(
                boid,
                decision,
                currentFrame,
                MINIMUM_STANCE_DURATION_FRAMES,
                workerProfiler
              )
            }

            if (
              speciesConfig.role === 'predator' &&
              boid.attackCooldownFrames === 0
            ) {
              for (const {
                item: potentialPrey,
                distance,
              } of context.nearbyPrey) {
                if (distance < config.parameters.catchRadius) {
                  const damage = boid.phenotype.attackDamage
                  potentialPrey.health -= damage

                  const knockbackDirection = vec.toroidalSubtract(
                    potentialPrey.position,
                    boid.position,
                    config.world.width,
                    config.world.height
                  )
                  const pushDist = vec.magnitude(knockbackDirection)
                  if (pushDist > 0) {
                    const nx = knockbackDirection.x / pushDist
                    const ny = knockbackDirection.y / pushDist
                    const sizeRatio =
                      boid.phenotype.baseSize / potentialPrey.phenotype.baseSize
                    const baseKnockback = boid.phenotype.maxSpeed * 2.2
                    const damageMultiplier =
                      1 + (damage / potentialPrey.phenotype.maxHealth) * 3
                    const knockbackStrength =
                      baseKnockback * damageMultiplier * sizeRatio

                    potentialPrey.knockbackVelocity = {
                      x: nx * knockbackStrength,
                      y: ny * knockbackStrength,
                    }
                    potentialPrey.knockbackFramesRemaining = 3
                  }

                  boid.attackCooldownFrames =
                    config.parameters.attackCooldownFrames

                  if (isDead(potentialPrey)) {
                    lifecycleCollector.collect({
                      type: lifecycleKeywords.events.death,
                      boidId: potentialPrey.id,
                      typeId: potentialPrey.typeId,
                      reason: 'predation',
                    })
                  }

                  break // One attack per frame
                }
              }
            }
          },
          checkBoidLifecycle: checkBoidLifecycle,
        }
      )

      workerProfiler.start('lifecycle.apply')

      const deathData: Array<{
        id: string
        typeId: string
        reason: 'old_age' | 'starvation' | 'predation'
        position: { x: number; y: number }
      }> = []

      const catchData: Array<{
        predatorId: string
        preyId: string
        preyTypeId: string
        position: { x: number; y: number }
      }> = []

      let foodConsumptionEvents: Array<{
        type: typeof lifecycleKeywords.events.foodConsumed
        foodId: string
        energyConsumed: number
      }> = []

      if (lifecycleCollector.items.length > 0) {
        for (const event of lifecycleCollector.items) {
          if (event.type === lifecycleKeywords.events.death) {
            const boid = boidsStore.getBoidById(event.boidId)
            if (boid) {
              deathData.push({
                id: event.boidId,
                typeId: event.typeId,
                reason: event.reason,
                position: {
                  x: boid.position.x,
                  y: boid.position.y,
                },
              })

              if (event.reason === 'predation') {
                const predator = Object.values(boids).find(
                  (b) =>
                    config.species[b.typeId]?.role === 'predator' &&
                    b.attackCooldownFrames ===
                      config.parameters.attackCooldownFrames
                )

                if (predator) {
                  catchData.push({
                    predatorId: predator.id,
                    preyId: event.boidId,
                    preyTypeId: event.typeId,
                    position: {
                      x: boid.position.x,
                      y: boid.position.y,
                    },
                  })
                }
              }
            }

            boidsStore.removeBoid(event.boidId)
          }
        }

        if (deathData.length > 0) {
          simulationChannel?.out.notify({
            type: simulationKeywords.events.boidsDied,
            boids: deathData,
          })

          const newMarkers: DeathMarker[] = []
          const CONSOLIDATION_RADIUS = 100 // Merge deaths within this radius
          const MAX_LIFETIME_FRAMES = 600 // 20 seconds at 30 UPS

          for (const death of deathData) {
            if (death.reason === 'predation') continue

            const existingMarkers = simulation.deathMarkers
            let consolidated = false

            for (const marker of existingMarkers) {
              const dx = death.position.x - marker.position.x
              const dy = death.position.y - marker.position.y
              const distance = Math.sqrt(dx * dx + dy * dy)

              if (
                distance < CONSOLIDATION_RADIUS &&
                marker.typeId === death.typeId
              ) {
                marker.strength = Math.min(5.0, marker.strength + 0.5)
                marker.remainingFrames = MAX_LIFETIME_FRAMES // Reset lifetime
                consolidated = true
                break
              }
            }

            if (!consolidated) {
              newMarkers.push({
                id: `death-${currentFrame}-${death.id}`,
                position: {
                  x: death.position.x,
                  y: death.position.y,
                },
                remainingFrames: MAX_LIFETIME_FRAMES,
                strength: 1.0, // Initial strength
                maxLifetimeFrames: MAX_LIFETIME_FRAMES,
                typeId: death.typeId,
              })
            }
          }

          if (newMarkers.length > 0) {
            workerStore.updateState((state) => ({
              ...state,
              simulation: {
                ...state.simulation,
                deathMarkers: [...state.simulation.deathMarkers, ...newMarkers],
              },
            }))

            simulationChannel?.out.notify({
              type: simulationKeywords.events.deathMarkersAdded,
              markers: newMarkers,
            })
          }
        }

        if (catchData.length > 0) {
          simulationChannel?.out.notify({
            type: simulationKeywords.events.boidsCaught,
            catches: catchData,
          })
        }

        const boidsByRole = getBoidsByRole(boids, config.species)
        const currentPreyCount = boidsByRole.prey.length
        const currentPredatorCount = boidsByRole.predator.length

        for (const event of lifecycleCollector.items) {
          if (event.type === lifecycleKeywords.events.reproduction) {
            const offspring = event.offspring
            const speciesConfig = config.species[offspring.typeId]

            if (speciesConfig) {
              let currentTypeCount = 0
              for (const boid of iterateBoids(boids)) {
                if (boid.typeId === offspring.typeId) {
                  currentTypeCount++
                }
              }

              const canSpawn = canSpawnOffspring(
                offspring.typeId,
                config.species,
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

              if (!canSpawn) {
                continue
              }

              const physics = config.physics || defaultWorldPhysics
              const parent = boidsStore.getBoidById(offspring.parent1Id)

              if (parent) {
                const creationContext = {
                  world: {
                    width: config.world.width,
                    height: config.world.height,
                  },
                  species: config.species,
                  rng: workerRandomness.domain('reproduction'),
                  physics,
                }

                const parentGenomes = parent.genome
                  ? {
                      parent1: parent.genome,
                    }
                  : undefined

                const result = createBoidOfType(
                  offspring.position,
                  offspring.typeId,
                  creationContext,
                  speciesConfig.reproduction.offspringEnergyBonus || 0,
                  boidsStore.nextIndex(), // Get proper unique index
                  parentGenomes
                )

                boidsStore.addBoid(result.boid)
                simulationChannel?.out.notify({
                  type: simulationKeywords.events.boidsReproduced,
                  boids: [
                    {
                      parentId1: offspring.parent1Id,
                      parentId2: offspring.parent2Id,
                      offspring: [result.boid],
                      mutations: result.mutationMetadata
                        ? {
                            traitMutations: result.mutationMetadata
                              .hadTraitMutation
                              ? 1
                              : 0,
                            colorMutations: result.mutationMetadata
                              .hadColorMutation
                              ? 1
                              : 0,
                            bodyPartMutations: result.mutationMetadata
                              .hadBodyPartMutation
                              ? 1
                              : 0,
                          }
                        : undefined,
                    },
                  ],
                })
              }
            }
          }
        }

        foodConsumptionEvents = lifecycleCollector.items.filter(
          (event) => event.type === lifecycleKeywords.events.foodConsumed
        ) as typeof foodConsumptionEvents

        lifecycleCollector.reset()
      }
      workerProfiler.end('lifecycle.apply')

      workerProfiler.start('lifecycle.foodManagement')

      if (currentFrame % 90 === 0) {
        const foodState = workerStore.getState()
        const { simulation: foodSimulation } = foodState

        const preyFoodCount = foodSimulation.foodSources.filter(
          (f) => f.sourceType === 'prey'
        ).length

        if (preyFoodCount < 15) {
          const toSpawn = Math.min(5, 15 - preyFoodCount) // Spawn 5, max cap 15
          const newFoodSources: FoodSource[] = []

          for (let i = 0; i < toSpawn; i++) {
            const rng = workerRandomness.domain('food')
            newFoodSources.push({
              id: `food-prey-${workerTime.now()}-${Math.floor(rng.next() * 1000000)}-${i}`,
              position: {
                x: rng.range(0, config.world.width),
                y: rng.range(0, config.world.height),
              },
              energy: 80, // PREY_FOOD_INITIAL_ENERGY
              maxEnergy: 80,
              sourceType: 'prey',
              createdFrame: currentFrame,
            })
          }

          if (newFoodSources.length > 0) {
            workerStore.setState({
              ...foodState,
              simulation: {
                ...foodSimulation,
                foodSources: [...foodSimulation.foodSources, ...newFoodSources],
              },
            })

            simulationChannel?.out.notify({
              type: simulationKeywords.events.foodSourcesCreated,
              foodSources: newFoodSources,
            })
          }
        }
      }

      if (catchData.length > 0) {
        const predatorFoodState = workerStore.getState()
        const { simulation: predatorFoodSimulation } = predatorFoodState
        const predatorFoodCount = predatorFoodSimulation.foodSources.filter(
          (f) => f.sourceType === 'predator'
        ).length
        const newPredatorFood: FoodSource[] = []

        for (const catchEvent of catchData) {
          if (predatorFoodCount + newPredatorFood.length < 25) {
            const rng = workerRandomness.domain('food')
            const preyBoid = deathData.find(
              (d: { id: string }) => d.id === catchEvent.preyId
            )

            if (preyBoid) {
              const foodEnergy = 50 * 0.8 // 80% of prey energy

              newPredatorFood.push({
                id: `food-predator-${workerTime.now()}-${Math.floor(rng.next() * 1000000)}`,
                position: catchEvent.position,
                energy: foodEnergy,
                maxEnergy: foodEnergy,
                sourceType: 'predator',
                createdFrame: currentFrame,
              })
            }
          }
        }

        if (newPredatorFood.length > 0) {
          workerStore.setState({
            ...predatorFoodState,
            simulation: {
              ...predatorFoodSimulation,
              foodSources: [
                ...predatorFoodSimulation.foodSources,
                ...newPredatorFood,
              ],
            },
          })

          simulationChannel?.out.notify({
            type: simulationKeywords.events.foodSourcesCreated,
            foodSources: newPredatorFood,
          })
        }
      }

      if (foodConsumptionEvents.length > 0) {
        const cleanupState = workerStore.getState()
        const { simulation: cleanupSimulation } = cleanupState

        const consumptionByFood = new Map<string, number>()
        for (const event of foodConsumptionEvents) {
          if (event.type === lifecycleKeywords.events.foodConsumed) {
            const current = consumptionByFood.get(event.foodId) || 0
            consumptionByFood.set(event.foodId, current + event.energyConsumed)
          }
        }

        const exhaustedFoodIds: string[] = []
        const changedFoodSources: FoodSource[] = []

        const updatedFoodSources = cleanupSimulation.foodSources
          .map((food) => {
            const consumed = consumptionByFood.get(food.id)
            if (consumed) {
              const newEnergy = Math.max(0, food.energy - consumed)

              const updatedFood = { ...food, energy: newEnergy }

              if (newEnergy <= 0) {
                exhaustedFoodIds.push(food.id)
              } else {
                changedFoodSources.push(updatedFood)
              }

              return updatedFood
            }
            return food
          })
          .filter((food) => food.energy > 0) // Remove exhausted food sources

        workerStore.setState({
          ...cleanupState,
          simulation: {
            ...cleanupSimulation,
            foodSources: updatedFoodSources,
          },
        })

        if (changedFoodSources.length > 0) {
          simulationChannel?.out.notify({
            type: simulationKeywords.events.foodSourcesUpdated,
            foodSources: changedFoodSources,
          })
        }

        if (exhaustedFoodIds.length > 0) {
          for (const foodId of exhaustedFoodIds) {
            simulationChannel?.out.notify({
              type: simulationKeywords.events.foodSourceConsumed,
              foodSourceId: foodId,
              boidId: 'batch-consumption',
            })
          }
        }
      }

      workerProfiler.end('lifecycle.foodManagement')

      workerProfiler.start('lifecycle.deathMarkerDecay')
      const currentSimulation = workerStore.getState().simulation
      const updatedMarkers: DeathMarker[] = []
      const expiredMarkerIds: string[] = []

      for (const marker of currentSimulation.deathMarkers) {
        const remainingFrames = marker.remainingFrames - 1

        if (remainingFrames <= 0) {
          expiredMarkerIds.push(marker.id)
        } else {
          updatedMarkers.push({
            ...marker,
            remainingFrames,
          })
        }
      }

      if (
        expiredMarkerIds.length > 0 ||
        updatedMarkers.length !== currentSimulation.deathMarkers.length
      ) {
        workerStore.updateState((state) => ({
          ...state,
          simulation: {
            ...state.simulation,
            deathMarkers: updatedMarkers,
          },
        }))

        if (updatedMarkers.length > 0) {
          simulationChannel?.out.notify({
            type: simulationKeywords.events.deathMarkersUpdated,
            markers: updatedMarkers,
          })
        }
      }
      workerProfiler.end('lifecycle.deathMarkerDecay')

      workerProfiler.start('sync.toSharedMemory')
      boidsStore.syncToSharedMemory()
      workerProfiler.end('sync.toSharedMemory')

      swapBuffers(bufferViews)

      workerTime.update(deltaSeconds * 1000)

      const frame = Atomics.load(bufferViews.stats, StatsIndex.FRAME_COUNT) + 1
      Atomics.store(bufferViews.stats, StatsIndex.FRAME_COUNT, frame)
      Atomics.store(
        bufferViews.stats,
        StatsIndex.SIMULATION_TIME_MS,
        Math.floor(workerTime.now())
      )

      if (timePassedRater.shouldExecute(deltaSeconds * 1000)) {
        const currentAccumulatedTime =
          timePassedRater.getMetrics().accumulatedTime
        const timeDelta = currentAccumulatedTime - lastTimePassed
        lastTimePassed = currentAccumulatedTime

        simulationChannel?.out.notify({
          type: eventKeywords.time.passed,
          deltaMs: timeDelta,
        })
        timePassedRater.recordExecution()
      }

      workerProfiler.end(profilerKeywords.engine.update)
    }

    /**
     * Spawn an obstacle at the specified position
     */
    const spawnObstacle = (
      position: { x: number; y: number },
      radius: number
    ) => {
      const currentState = workerStore.getState()
      const newObstacle = {
        id: `obstacle-${workerTime.now()}-${Math.floor(Math.random() * 1000000)}`,
        position,
        radius,
      }

      workerStore.setState({
        ...currentState,
        simulation: {
          ...currentState.simulation,
          obstacles: [...currentState.simulation.obstacles, newObstacle],
        },
      })

      simulationChannel?.out.notify({
        type: simulationKeywords.events.obstaclesAdded,
        obstacles: [newObstacle],
      })
    }

    /**
     * Spawn a predator at the specified position
     */
    const spawnPredator = (position: { x: number; y: number }) => {
      const currentState = workerStore.getState()
      const { config } = currentState
      const { species } = config

      const predatorTypeIds = Object.keys(species).filter(
        (id) => species[id].role === 'predator'
      )

      if (predatorTypeIds.length === 0) {
        console.warn('[WorkerEngine] No predator species configured!')
        return
      }

      const physics = config.physics || defaultWorldPhysics
      const creationContext = {
        world: {
          width: config.world.width,
          height: config.world.height,
        },
        species,
        rng: workerRandomness.domain('spawning'),
        physics,
      }

      const result = createBoidOfType(
        position,
        predatorTypeIds[0], // Use first predator type
        creationContext,
        0, // No energy bonus
        boidsStore.nextIndex(),
        undefined // No parents
      )

      boidsStore.addBoid(result.boid)

      simulationChannel?.out.notify({
        type: simulationKeywords.events.boidsSpawned,
        boids: [result.boid],
      })
    }

    const api = {
      getBufferViews: () => {
        const bufferViews = boidsStore.getBufferViews()
        if (!bufferViews) throw new Error('Buffer views not found')
        return bufferViews
      },
      initialize,
      update,
      reset: () => {
        boidsStore.reset()
      },
      addBoid: (boid: Boid) => {
        boidsStore.addBoid(boid)
      },
      removeBoid: (boidId: string) => {
        boidsStore.removeBoid(boidId)
      },
      getBoidById: (boidId: string): Boid | undefined => {
        return boidsStore.getBoidById(boidId)
      },
      checkCatches: (): CatchEvent[] => {
        return []
      },
      spawnObstacle,
      spawnPredator,
      clearDeathMarkers: () => {
        const currentState = workerStore.getState()
        workerStore.setState({
          ...currentState,
          simulation: {
            ...currentState.simulation,
            deathMarkers: [],
          },
        })

        simulationChannel?.out.notify({
          type: simulationKeywords.events.deathMarkersUpdated,
          markers: [],
        })
      },
      cleanup: () => {
        simulationChannel?.clear()
      },
      attach,
    } satisfies BoidEngine & {
      attach: typeof attach
      spawnObstacle: (
        position: { x: number; y: number },
        radius: number
      ) => void
      spawnPredator: (position: { x: number; y: number }) => void
      clearDeathMarkers: () => void
    }

    return api
  },
  halt: () => {},
})

export type WorkerEngineResource = StartedResource<typeof workerEngine>
