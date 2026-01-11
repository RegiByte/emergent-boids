import { defineResource } from 'braided'
import type { SimulationGateway } from './simulationController.ts'
import type { RuntimeStoreResource } from './runtimeStore.ts'
import type { AnalyticsStoreResource } from './analyticsStore.ts'
import type { TimeResource } from '../shared/time.ts'
import {
  eventKeywords,
  simulationKeywords,
} from '../../boids/vocabulary/keywords.ts'
import { produce } from 'immer'

/**
 * Atmosphere Resource
 *
 * Detects ecosystem-level events and triggers atmospheric changes.
 * Maintains cooldowns to prevent event spam.
 *
 * Detection logic:
 * - Mating season: High birth rate (>10% of population per snapshot)
 * - Mass extinction: High death rate (>15% of population per snapshot)
 * - Predator dominance: Predators >30% of total population
 * - Population boom: Total population >150% of initial
 * - Starvation crisis: Average energy <30% across all species
 */
export const atmosphere = defineResource({
  dependencies: ['runtimeController', 'runtimeStore', 'analyticsStore', 'time'],
  start: ({
    runtimeController,
    runtimeStore,
    analyticsStore,
    time,
  }: {
    runtimeController: SimulationGateway
    runtimeStore: RuntimeStoreResource
    analyticsStore: AnalyticsStoreResource
    time: TimeResource
  }) => {
    let tickCounter = 0
    const CHECK_INTERVAL = 3 // Check for events every 3 ticks (same as analytics)
    const MIN_EVENT_DURATION = 10 // 10 seconds minimum

    const detectionWindow = {
      births: {} as Record<string, number>,
      deaths: {} as Record<string, number>,
      windowStart: time.now(), // Use simulation time
    }

    const unsubscribe = runtimeController.subscribe((event) => {
      if (event.type === simulationKeywords.events.boidsReproduced) {
        for (const reproduction of event.boids) {
          for (const offspring of reproduction.offspring) {
            recordBirth(offspring.typeId, 1)
          }
        }
      } else if (event.type === simulationKeywords.events.boidsDied) {
        for (const death of event.boids) {
          recordDeath(death.typeId)
        }
      } else if (event.type === eventKeywords.time.passed) {
        tickCounter++
        if (tickCounter % CHECK_INTERVAL === 0) {
          checkForAtmosphereEvents()
        }
        decreaseActiveEventTick()
      }
    })

    const recordBirth = (typeId: string, offspringCount: number) => {
      detectionWindow.births[typeId] =
        (detectionWindow.births[typeId] || 0) + offspringCount
    }
    const recordDeath = (typeId: string) => {
      detectionWindow.deaths[typeId] = (detectionWindow.deaths[typeId] || 0) + 1
    }

    const decreaseActiveEventTick = () => {
      const state = runtimeStore.store.getState()
      const { ui } = state
      const activeEvent = ui.visualSettings.atmosphere.activeEvent
      runtimeStore.store.setState((state) => {
        return produce(state, (draft) => {
          if (activeEvent) {
            draft.ui.visualSettings.atmosphere.activeEvent = {
              ...activeEvent,
              minDurationTicks: activeEvent.minDurationTicks - 1,
            }
          }
        })
      })

      if (activeEvent && activeEvent.minDurationTicks <= 0) {
        runtimeController.dispatch({
          type: eventKeywords.atmosphere.eventEnded,
          eventType: activeEvent.eventType,
        })
      }
    }

    const checkForAtmosphereEvents = () => {
      const runtimeState = runtimeStore.store.getState()
      const analyticsState = analyticsStore.store.getState()
      const { config } = runtimeState
      const snapshot = analyticsState.evolution.data.currentSnapshot

      if (!snapshot) return

      const populations = Object.values(snapshot.populations) as number[]
      const totalPop = populations.reduce((a, b) => a + b, 0)

      const births = Object.values(detectionWindow.births) as number[]
      const totalBirths = births.reduce((a, b) => a + b, 0)

      const deaths = Object.values(detectionWindow.deaths) as number[]
      const totalDeaths = deaths.reduce((a, b) => a + b, 0)

      const energyStats = Object.values(snapshot.energy)
      const avgEnergy =
        energyStats.length > 0
          ? energyStats.reduce((sum, stats) => sum + stats.mean, 0) /
            energyStats.length
          : 100

      const initialPop =
        config.world.initialPreyCount + (config.world.initialPredatorCount || 0)
      const predatorPop = snapshot.populations['predator'] || 0

      if (totalDeaths > totalPop * 0.15 && totalPop > 50) {
        runtimeController.dispatch({
          type: eventKeywords.atmosphere.eventStarted,
          eventType: 'mass-extinction',
          settings: {
            fogColor: 'rgba(139, 0, 0, 0.7)', // Dark red
          },
          minDurationTicks: MIN_EVENT_DURATION,
        } as const)
        resetDetectionWindow()
        return
      }

      if (totalBirths > totalPop * 0.1 && totalPop > 50) {
        runtimeController.dispatch({
          type: eventKeywords.atmosphere.eventStarted,
          eventType: 'mating-season',
          settings: {
            fogColor: 'rgba(255, 105, 180, 0.6)', // Hot pink
          },
          minDurationTicks: MIN_EVENT_DURATION,
        } as const)
        resetDetectionWindow()
        return
      }

      if (totalPop > 0 && predatorPop / totalPop > 0.3) {
        runtimeController.dispatch({
          type: eventKeywords.atmosphere.eventStarted,
          eventType: 'predator-dominance',
          settings: {
            fogColor: 'rgba(128, 0, 0, 0.8)', // Blood red
          },
          minDurationTicks: MIN_EVENT_DURATION,
        } as const)
        resetDetectionWindow()
        return
      }

      if (avgEnergy < 30 && totalPop > 50) {
        runtimeController.dispatch({
          type: eventKeywords.atmosphere.eventStarted,
          eventType: 'starvation-crisis',
          settings: {
            fogColor: 'rgba(70, 70, 0, 0.7)', // Dark yellow
          },
          minDurationTicks: MIN_EVENT_DURATION,
        } as const)
        resetDetectionWindow()
        return
      }

      if (totalPop > initialPop * 1.5 && totalPop > 100) {
        runtimeController.dispatch({
          type: eventKeywords.atmosphere.eventStarted,
          eventType: 'population-boom',
          settings: {
            fogColor: 'rgba(0, 200, 100, 0.5)', // Bright green
          },
          minDurationTicks: MIN_EVENT_DURATION,
        } as const)
        resetDetectionWindow()
        return
      }

      resetDetectionWindow()
    }

    const resetDetectionWindow = () => {
      detectionWindow.births = {}
      detectionWindow.deaths = {}
      detectionWindow.windowStart = time.now() // Use simulation time
    }

    return { unsubscribe }
  },
  halt: ({ unsubscribe }: { unsubscribe: () => void }) => {
    unsubscribe()
  },
})
