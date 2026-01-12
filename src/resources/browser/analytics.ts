import { defineResource } from 'braided'
import {
  eventKeywords,
  simulationKeywords,
} from '../../boids/vocabulary/keywords.ts'
import type { AnalyticsStoreResource } from './analyticsStore.ts'
import type { BoidEngine } from './engine.ts'
import { LocalBoidStoreResource } from './localBoidStore.ts'
import type { SimulationGateway } from './simulationGateway.ts'
import { iterateBoids } from '@/boids/iterators.ts'
import { RuntimeStoreResource } from './runtimeStore.ts'
import {
  computeAgeDistributionBySpecies,
  computeDeathMarkerStats,
  computeEnergyStatsBySpecies,
  computeFoodSourceStatsByType,
  computeReproductionMetricsBySpecies,
  computeSpatialPatternsBySpecies,
  getStanceDistributionBySpecies,
} from '@/boids/analytics/statistics.ts'
import { EvolutionSnapshot } from '@/boids/vocabulary/schemas/evolution.ts'
import { computeGeneticsStatsBySpecies } from '@/boids/analytics/genetics.ts'

/**
 * Analytics Resource
 *
 * Observes the event loop and tracks comprehensive ecosystem metrics over time.
 * Runs independently of UI rendering - always collecting data.
 *
 * Now captures rich data for AI training:
 * - Population dynamics with death cause breakdown
 * - Energy statistics (mean, stdDev, min, max)
 * - Age distribution (young, mature, elder)
 * - Spatial patterns (clustering, dispersion)
 * - Reproduction metrics (ready, seeking, mating)
 * - Environmental state (food, markers, obstacles)
 * - Configuration snapshot (active parameters)
 *
 * Responsibilities:
 * - Track births/deaths/catches per species
 * - Capture evolution snapshots every N ticks
 * - Calculate comprehensive statistics
 * - Update analytics slice in runtime store
 * - Manage snapshot history (max 1000 records)
 */
export const analytics = defineResource({
  dependencies: [
    'simulationGateway',
    'runtimeStore',
    'analyticsStore',
    'localBoidStore',
  ],
  start: ({
    simulationGateway,
    runtimeStore,
    analyticsStore,
    localBoidStore,
  }: {
    engine: BoidEngine
    simulationGateway: SimulationGateway
    runtimeStore: RuntimeStoreResource
    analyticsStore: AnalyticsStoreResource
    localBoidStore: LocalBoidStoreResource
  }) => {
    let tickCounter = 0
    let lastSnapshotTime = Date.now()
    let isFirstSnapshot = true // Track if this is the first snapshot
    let snapshotCount = 0 // Track total snapshots for genetics sampling

    const boidStore = localBoidStore.store

    const eventCounters = {
      births: {} as Record<string, number>,
      deaths: {} as Record<string, number>,
      deathsByCause: {} as Record<
        string,
        { old_age: number; starvation: number; predation: number }
      >,
      catches: {} as Record<string, number>,
      escapes: {} as Record<string, number>,
      totalChaseDistance: 0,
      totalFleeDistance: 0,
      chaseCount: 0,
      fleeCount: 0,
    }

    const mutationCounters: Record<
      string,
      {
        traitMutations: number
        colorMutations: number
        bodyPartMutations: number
        totalOffspring: number
      }
    > = {}

    const unsubscribe = simulationGateway.subscribe((event) => {
      analyticsStore.trackEvent(event, tickCounter)

      if (event.type === simulationKeywords.events.boidsReproduced) {
        for (const reproduction of event.boids) {
          for (const offspring of reproduction.offspring) {
            const typeId = offspring.typeId
            eventCounters.births[typeId] =
              (eventCounters.births[typeId] || 0) + 1

            if (!mutationCounters[typeId]) {
              mutationCounters[typeId] = {
                traitMutations: 0,
                colorMutations: 0,
                bodyPartMutations: 0,
                totalOffspring: 0,
              }
            }
            mutationCounters[typeId].totalOffspring++
          }

          if (reproduction.mutations) {
            const typeId = reproduction.offspring[0]?.typeId
            if (typeId && mutationCounters[typeId]) {
              mutationCounters[typeId].traitMutations +=
                reproduction.mutations.traitMutations
              mutationCounters[typeId].colorMutations +=
                reproduction.mutations.colorMutations
              mutationCounters[typeId].bodyPartMutations +=
                reproduction.mutations.bodyPartMutations
            }
          }
        }
      } else if (event.type === simulationKeywords.events.boidsDied) {
        for (const death of event.boids) {
          const typeId = death.typeId
          const reason = death.reason

          eventCounters.deaths[typeId] = (eventCounters.deaths[typeId] || 0) + 1

          if (!eventCounters.deathsByCause[typeId]) {
            eventCounters.deathsByCause[typeId] = {
              old_age: 0,
              starvation: 0,
              predation: 0,
            }
          }
          eventCounters.deathsByCause[typeId][reason]++
        }
      } else if (event.type === simulationKeywords.events.boidsCaught) {
        for (const catchEvent of event.catches) {
          const typeId = catchEvent.preyTypeId
          eventCounters.catches[typeId] =
            (eventCounters.catches[typeId] || 0) + 1
        }
      } else if (event.type === eventKeywords.time.passed) {
        tickCounter++
        const snapshotInterval =
          analyticsStore.store.getState().evolution.config.snapshotInterval
        if (tickCounter % snapshotInterval === 0) {
          captureSnapshot()
        }
      }
    })

    const captureSnapshot = () => {
      const { config, simulation, ui } = runtimeStore.store.getState()
      const timestamp = Date.now()
      const deltaSeconds = (timestamp - lastSnapshotTime) / 1000
      lastSnapshotTime = timestamp
      const populations: Record<string, number> = {}
      for (const boid of iterateBoids(boidStore.boids)) {
        populations[boid.typeId] = (populations[boid.typeId] || 0) + 1
      }
      const energyStats = computeEnergyStatsBySpecies(boidStore.boids)
      const ageStats = computeAgeDistributionBySpecies(
        boidStore.boids,
        config.species
      )
      const spatialPatterns = computeSpatialPatternsBySpecies(
        boidStore.boids,
        config.world.width,
        config.world.height
      )
      const reproductionMetrics = computeReproductionMetricsBySpecies(
        boidStore.boids,
        config.species,
        config.parameters.reproductionEnergyThreshold
      )
      const stancesBySpecies = getStanceDistributionBySpecies(boidStore.boids)
      const foodSourceStats = computeFoodSourceStatsByType(
        simulation.foodSources
      )
      const deathMarkerStats = computeDeathMarkerStats(simulation.deathMarkers)
      const atmosphereState = ui.visualSettings.atmosphere.activeEvent
      const activeParameters = isFirstSnapshot
        ? {
            perceptionRadius: config.parameters.perceptionRadius,
            fearRadius: config.parameters.fearRadius,
            chaseRadius: config.parameters.chaseRadius,
            reproductionEnergyThreshold:
              config.parameters.reproductionEnergyThreshold,
            speciesConfigs: Object.entries(config.species).reduce(
              (acc, [id, species]) => {
                acc[id] = {
                  role: species.role,
                  maxSpeed: species.baseGenome.traits.speed * 10, // Assuming physics.maxSpeed = 10
                  maxForce: species.baseGenome.traits.force * 0.5, // Assuming physics.maxForce = 0.5
                  maxEnergy: 100 * species.baseGenome.traits.size * 1.5, // From phenotype formula
                  energyLossRate:
                    0.01 * (1 - species.baseGenome.traits.efficiency * 0.5), // From phenotype formula
                  fearFactor: species.baseGenome.traits.fearResponse,
                  reproductionType: species.reproduction.type,
                  offspringCount: species.reproduction.offspringCount,
                }
                return acc
              },
              {} as Record<
                string,
                {
                  role: 'prey' | 'predator'
                  maxSpeed: number
                  maxForce: number
                  maxEnergy: number
                  energyLossRate: number
                  fearFactor: number
                  reproductionType: 'sexual' | 'asexual'
                  offspringCount: number
                }
              >
            ),
          }
        : undefined
      const deathsByCause: Record<
        string,
        { old_age: number; starvation: number; predation: number }
      > = {}
      Object.keys(config.species).forEach((typeId) => {
        deathsByCause[typeId] = eventCounters.deathsByCause[typeId] || {
          old_age: 0,
          starvation: 0,
          predation: 0,
        }
      })
      const snapshot: EvolutionSnapshot = {
        tick: tickCounter,
        timestamp,
        deltaSeconds,
        populations,
        births: { ...eventCounters.births },
        deaths: { ...eventCounters.deaths },
        deathsByCause,
        energy: energyStats,
        stances: stancesBySpecies,
        age: ageStats,
        environment: {
          foodSources: foodSourceStats,
          deathMarkers: deathMarkerStats,
          obstacles: {
            count: simulation.obstacles.length,
          },
        },
        spatial: spatialPatterns,
        interactions: {
          catches: { ...eventCounters.catches },
          escapes: { ...eventCounters.escapes },
          averageChaseDistance:
            eventCounters.chaseCount > 0
              ? eventCounters.totalChaseDistance / eventCounters.chaseCount
              : 0,
          averageFleeDistance:
            eventCounters.fleeCount > 0
              ? eventCounters.totalFleeDistance / eventCounters.fleeCount
              : 0,
        },
        reproduction: reproductionMetrics,
        activeParameters,
        genetics:
          snapshotCount %
            analyticsStore.store.getState().evolution.config
              .geneticsSamplingInterval ===
          0
            ? computeGeneticsStatsBySpecies(
                boidStore.boids,
                config.species,
                mutationCounters
              )
            : {}, // Empty object when not sampling (saves ~55% of snapshot size)
        atmosphere: {
          activeEvent: atmosphereState?.eventType || null,
          eventStartedAtTick: atmosphereState ? tickCounter : null,
          eventDurationTicks: atmosphereState
            ? tickCounter -
              Math.floor((timestamp - atmosphereState.startedAt) / 1000)
            : null,
        },
      }
      analyticsStore.captureSnapshot(snapshot)
      snapshotCount++
      if (
        tickCounter % 300 === 0 &&
        tickCounter > 0 &&
        Object.keys(snapshot.genetics).length > 0
      ) {
        console.log('🧬 GENETICS STATS', {
          frame: tickCounter,
          genetics: snapshot.genetics,
        })
      }
      eventCounters.births = {}
      eventCounters.deaths = {}
      eventCounters.deathsByCause = {}
      eventCounters.catches = {}
      eventCounters.escapes = {}

      for (const typeId in mutationCounters) {
        mutationCounters[typeId] = {
          traitMutations: 0,
          colorMutations: 0,
          bodyPartMutations: 0,
          totalOffspring: 0,
        }
      }
      eventCounters.totalChaseDistance = 0
      eventCounters.totalFleeDistance = 0
      eventCounters.chaseCount = 0
      eventCounters.fleeCount = 0
      isFirstSnapshot = false
    }

    return {
      unsubscribe,

      getMutationCounters: () => ({ ...mutationCounters }),
      resetMutationCounters: () => {
        for (const typeId in mutationCounters) {
          mutationCounters[typeId] = {
            traitMutations: 0,
            colorMutations: 0,
            bodyPartMutations: 0,
            totalOffspring: 0,
          }
        }
      },
    }
  },
  halt: ({ unsubscribe }: { unsubscribe: () => void }) => {
    unsubscribe()
  },
})
