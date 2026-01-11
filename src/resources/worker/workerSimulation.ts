import { simulationKeywords } from '@/boids/vocabulary/keywords'
import {
  SimulationCommand,
  SimulationEvent,
} from '@/boids/vocabulary/schemas/simulation'
import { createChannel } from '@/lib/channels'
import {
  CommandHandlers,
  createSimulation,
} from '@/resources/shared/simulation/core'
import { defineResource, StartedResource } from 'braided'
import { WorkerEngineResource } from './workerEngine'
import { WorkerUpdateLoopResource } from './workerUpdateLoop'
import { TimeAPI } from '../shared/time'
import { WorkerStoreResource } from './workerStore'

export const workerSimulation = defineResource({
  dependencies: [
    'workerEngine',
    'workerTime',
    'workerUpdateLoop',
    'workerStore',
  ],
  start: ({
    workerEngine,
    workerTime,
    workerUpdateLoop,
    workerStore,
  }: {
    workerEngine: WorkerEngineResource
    workerTime: TimeAPI
    workerUpdateLoop: WorkerUpdateLoopResource
    workerStore: WorkerStoreResource
  }) => {
    const channel = createChannel<SimulationCommand, SimulationEvent>()

    const commandHandlers = {
      [simulationKeywords.commands.addBoid]: (command) => {
        console.log('[WorkerSimulation] Adding boid:', command.boid)
        workerEngine.addBoid(command.boid)
      },
      [simulationKeywords.commands.removeBoid]: (command) => {
        console.log('[WorkerSimulation] Removing boid:', command.boidId)
        workerEngine.removeBoid(command.boidId)
      },
      [simulationKeywords.commands.pause]: (_command) => {
        console.log('[WorkerSimulation] Pausing')
        workerUpdateLoop.pause()
      },
      [simulationKeywords.commands.resume]: (_command) => {
        console.log('[WorkerSimulation] Resuming')
        workerUpdateLoop.resume()
      },
      [simulationKeywords.commands.start]: (_command) => {
        if (!workerUpdateLoop.isRunning()) {
          console.log('[WorkerSimulation] Starting update loop')
          workerUpdateLoop.start(
            30, // 30 UPS
            (update) => {
              channel.out.notify({
                type: simulationKeywords.events.updated,
                frame: update.frame,
                simulationTime: update.simulationTime,
              })
            },
            (lifecycle) => {
              console.log('[WorkerSimulation] Lifecycle event:', lifecycle)
            }
          )
        }
      },
      [simulationKeywords.commands.step]: (_command) => {
        workerUpdateLoop.step()
      },
      [simulationKeywords.commands.setTimeScale]: (command) => {
        console.log('[WorkerSimulation] Setting time scale:', command.timeScale)
        workerTime.setTimeScale(command.timeScale)
        channel.out.notify({
          type: simulationKeywords.events.timeScaleChanged,
          timeScale: command.timeScale,
        })
      },
      [simulationKeywords.commands.updateParameters]: (command) => {
        console.log(
          '[WorkerSimulation] Updating parameters:',
          command.parameters
        )
        const currentState = workerStore.getState()
        workerStore.setState({
          ...currentState,
          config: {
            ...currentState.config,
            parameters: {
              ...currentState.config.parameters,
              ...command.parameters,
            },
          },
        })
        console.log('[WorkerSimulation] Parameters updated successfully')
      },
      [simulationKeywords.commands.spawnFood]: (command) => {
        console.log('[WorkerSimulation] Spawning food:', command.position)
      },
      [simulationKeywords.commands.clearFood]: (_command) => {
        console.log('[WorkerSimulation] Clearing food')
      },
      [simulationKeywords.commands.spawnObstacle]: (command) => {
        console.log('[WorkerSimulation] Spawning obstacle:', command.position)

        workerEngine.spawnObstacle(command.position, command.radius)
      },
      [simulationKeywords.commands.spawnPredator]: (command) => {
        console.log('[WorkerSimulation] Spawning predator:', command.position)

        workerEngine.spawnPredator(command.position)
      },
      [simulationKeywords.commands.clearDeathMarkers]: (_command) => {
        console.log('[WorkerSimulation] Clearing death markers')

        workerEngine.clearDeathMarkers()
      },
    } satisfies Partial<CommandHandlers>

    const simulation = createSimulation(
      { simulationChannel: channel },
      {
        onInitialize: () => {
          workerEngine.initialize(channel)
        },
        onCommand: (command, resolve) => {
          const handler =
            commandHandlers[command.type as keyof typeof commandHandlers]
          if (!handler) {
            resolve({
              type: simulationKeywords.events.error,
              error: `No handler found for command: ${command.type}`,
              meta: command,
            })
            return
          }
          try {
            handler(command as never)
          } catch (error) {
            resolve({
              type: simulationKeywords.events.error,
              error: error instanceof Error ? error.message : 'Unknown error',
              meta: error,
            })
          }
        },
        onCleanup: () => {
          console.log('[WorkerSimulation] Cleaned up')
        },
      }
    )

    simulation.initialize()

    return {
      ...simulation,
      initialize: () => {},
      channel,
    }
  },
  halt: ({ cleanup }) => {
    cleanup()
  },
})

export type WorkerSimulationResource = StartedResource<typeof workerSimulation>
